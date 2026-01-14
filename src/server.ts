/**
 * Finalyst Static Demo Server
 *
 * Serves the React UI with mock JSON data, protected by invite + password authentication.
 * Supports multiple clients with multiple data versions.
 *
 * Structure:
 *   data/{client_id}/client.json     - Client config (invite_code, password, versions)
 *   data/{client_id}/{version}/      - Version-specific data
 *
 * Flow:
 * 1. No invite param → "No invite" page
 * 2. With invite param → Lookup client by invite_code
 * 3. Valid client, no cookie → Login page (enter password)
 * 4. POST /auth with invite + password → Validate and set cookie (client_id + version)
 * 5. Valid cookie → Serve client/version-specific content
 * 6. POST /api/version → Switch version (updates cookie)
 */

import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { readdir } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Global config
const PORT = parseInt(Bun.env.PORT || "3001");
const COOKIE_NAME = "finalyst_auth";

// Paths - DATA_DIR can be overridden via env variable
const PUBLIC_DIR = resolve(__dirname, "../public");
const DATA_DIR = Bun.env.DATA_DIR
  ? resolve(Bun.env.DATA_DIR)
  : resolve(__dirname, "../data");
const LOGIN_DIR = resolve(__dirname, "../login");

// Client config type
interface ClientConfig {
  id: string;
  name: string;
  invite_code: string;
  password: string;
  default_version: string;
  versions: string[];
  data_dir: string;
}

// Version config type
interface VersionConfig {
  id: string;
  name: string;
  description: string;
}

// In-memory client registry
const clients: Map<string, ClientConfig> = new Map();
let dataDirectoryExists = false;

// Check if data directory exists
async function checkDataDirectory(): Promise<boolean> {
  try {
    const dir = Bun.file(DATA_DIR);
    // Try to read the directory
    await readdir(DATA_DIR);
    return true;
  } catch (e) {
    return false;
  }
}

// Load clients from disk
async function loadClients(): Promise<{ success: boolean; error?: string }> {
  clients.clear();

  // Check if data directory exists
  dataDirectoryExists = await checkDataDirectory();
  if (!dataDirectoryExists) {
    console.warn(`  Data directory not found: ${DATA_DIR}`);
    console.warn(`  Server will run but no clients available.`);
    console.warn(`  Set DATA_DIR env variable or create the directory.`);
    return { success: false, error: `Data directory not found: ${DATA_DIR}` };
  }

  try {
    const entries = await readdir(DATA_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        const configPath = join(DATA_DIR, entry.name, "client.json");
        try {
          const file = Bun.file(configPath);
          if (await file.exists()) {
            const config = await file.json() as ClientConfig;
            config.data_dir = join(DATA_DIR, entry.name);
            clients.set(config.invite_code, config);
            console.log(`  Loaded client: ${config.name} (${config.id}) - ${config.versions.length} versions`);
          }
        } catch (e) {
          console.warn(`  Warning: Could not load client ${entry.name}`);
        }
      }
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';
    console.warn(`  Error reading data directory: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  console.log(`  Total clients: ${clients.size}`);
  return { success: true };
}

// Load version config
async function loadVersion(client: ClientConfig, versionId: string): Promise<VersionConfig | null> {
  const versionPath = join(client.data_dir, versionId, "version.json");
  try {
    const file = Bun.file(versionPath);
    if (await file.exists()) {
      return await file.json() as VersionConfig;
    }
  } catch (e) {
    // Version config not found
  }
  return null;
}

// Scan filesystem for available versions (dynamic discovery)
async function discoverVersions(client: ClientConfig): Promise<string[]> {
  const versions: string[] = [];
  try {
    const entries = await readdir(client.data_dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "client.json") {
        // Check if it has a version.json or any data files
        const versionDir = join(client.data_dir, entry.name);
        const versionJson = Bun.file(join(versionDir, "version.json"));
        const merchantsJson = Bun.file(join(versionDir, "merchants.json"));
        if (await versionJson.exists() || await merchantsJson.exists()) {
          versions.push(entry.name);
        }
      }
    }
  } catch (e) {
    // Fall back to client.versions if scan fails
    return client.versions;
  }
  return versions.length > 0 ? versions : client.versions;
}

// MIME types
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  });
  return cookies;
}

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME_TYPES[ext] || "application/octet-stream";
}

async function serveFile(filePath: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  try {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const headers: Record<string, string> = {
        "Content-Type": getMimeType(filePath),
        ...extraHeaders,
      };
      return new Response(file, { headers });
    }
  } catch (e) {
    // File doesn't exist
  }
  return new Response("Not Found", { status: 404 });
}

function serveNoInvitePage(): Response {
  // Show different message if data directory is missing
  if (!dataDirectoryExists) {
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finalyst - Setup Required</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full text-center">
    <div class="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-xl mb-4">
      <svg class="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1 class="text-2xl font-bold text-gray-900 mb-2">Setup Required</h1>
    <p class="text-gray-500 mb-4">
      Data directory not found. The server is running but no client data is available.
    </p>
    <div class="bg-gray-100 rounded-lg p-4 text-left mb-4">
      <p class="text-xs text-gray-500 mb-2">Expected data directory:</p>
      <code class="text-sm text-gray-700 break-all">${DATA_DIR}</code>
    </div>
    <p class="text-sm text-gray-500 mb-2">
      Create the directory and add client folders, or set <code class="bg-gray-100 px-1 rounded">DATA_DIR</code> in .env
    </p>
    <div class="text-xs text-gray-400 mt-6">
      Finalyst Payment Analytics
    </div>
  </div>
</body>
</html>
    `, { headers: { "Content-Type": "text/html" } });
  }

  // Show no-invite message if data exists but no invite provided
  return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finalyst - No Invite</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
    <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-xl mb-4">
      <svg class="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>
    <h1 class="text-2xl font-bold text-gray-900 mb-2">No Invite Code</h1>
    <p class="text-gray-500 mb-6">
      This demo requires an invite link to access.<br>
      Please contact your account manager.
    </p>
    <div class="text-xs text-gray-400">
      Finalyst Payment Analytics
    </div>
  </div>
</body>
</html>
  `, { headers: { "Content-Type": "text/html" } });
}

async function serveLoginPage(client: ClientConfig): Promise<Response> {
  // Try to serve the custom login page
  const loginFile = resolve(LOGIN_DIR, "index.html");
  try {
    const file = Bun.file(loginFile);
    if (await file.exists()) {
      let html = await file.text();
      // Inject client info
      html = html.replace("</head>", `<script>
        window.CLIENT = {
          id: "${client.id}",
          name: "${client.name}",
          invite: "${client.invite_code}"
        };
      </script></head>`);
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }
  } catch (e) {
    // Fallback
  }

  // Fallback login page
  return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finalyst - ${client.name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    window.CLIENT = {
      id: "${client.id}",
      name: "${client.name}",
      invite: "${client.invite_code}"
    };
  </script>
</head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Finalyst</h1>
      <p class="text-gray-500 mt-1">${client.name}</p>
      <p class="text-gray-400 text-sm mt-2">Enter your password to continue</p>
    </div>
    <form id="loginForm" class="space-y-4">
      <input
        type="password"
        id="password"
        name="password"
        placeholder="Password"
        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        autofocus
        required
      />
      <button
        type="submit"
        class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
      >
        Login
      </button>
      <p id="error" class="text-red-500 text-sm text-center hidden">Invalid password</p>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('error');

      try {
        const res = await fetch('/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invite: window.CLIENT.invite, password })
        });

        if (res.ok) {
          window.location.href = '/';
        } else {
          errorEl.classList.remove('hidden');
          document.getElementById('password').value = '';
        }
      } catch (err) {
        errorEl.classList.remove('hidden');
      }
    });
  </script>
</body>
</html>
  `, { headers: { "Content-Type": "text/html" } });
}

async function serveApiRoute(
  pathname: string,
  client: ClientConfig,
  version: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  // Remove /api prefix
  const apiPath = pathname.replace(/^\/api/, "");
  const VERSION_DATA_DIR = join(client.data_dir, version);

  let jsonPath: string;

  // /api/health
  if (apiPath === "/health") {
    return new Response(JSON.stringify({
      status: "healthy",
      client: client.id,
      version: version
    }), {
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
  }

  // /api/client - returns client info and current version
  if (apiPath === "/client") {
    return new Response(JSON.stringify({
      id: client.id,
      name: client.name,
      current_version: version,
    }), {
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
  }

  // /api/client/versions - returns available versions (dynamically discovered)
  if (apiPath === "/client/versions") {
    const versionIds = await discoverVersions(client);
    const versions: VersionConfig[] = [];
    for (const vId of versionIds) {
      const vConfig = await loadVersion(client, vId);
      if (vConfig) {
        versions.push(vConfig);
      } else {
        versions.push({ id: vId, name: vId, description: "" });
      }
    }
    return new Response(JSON.stringify({
      current: version,
      versions: versions,
    }), {
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
  }

  // /api/merchants
  if (apiPath === "/merchants") {
    jsonPath = `${VERSION_DATA_DIR}/merchants.json`;
  }
  // /api/merchants/:id
  else if (apiPath.match(/^\/merchants\/\d+$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/merchants/${id}.json`;
  }
  // /api/merchants/:id/monthly
  else if (apiPath.match(/^\/merchants\/\d+\/monthly$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/monthly/${id}.json`;
  }
  // /api/merchants/:id/plans
  else if (apiPath.match(/^\/merchants\/\d+\/plans$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/plans/${id}.json`;
  }
  // /api/merchants/:id/plans/:planKey
  else if (apiPath.match(/^\/merchants\/\d+\/plans\/.+$/)) {
    const parts = apiPath.split("/");
    const planKey = decodeURIComponent(parts[4]);
    const safeKey = planKey.replace(/:/g, "_").replace(/\//g, "_");
    jsonPath = `${VERSION_DATA_DIR}/plans/details/${safeKey}.json`;
  }
  // /api/merchants/:id/stability
  else if (apiPath.match(/^\/merchants\/\d+\/stability$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/stability/${id}.json`;
  }
  // /api/merchants/:id/dynamics
  else if (apiPath.match(/^\/merchants\/\d+\/dynamics$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/dynamics/${id}.json`;
  }
  // /api/merchants/:id/analysis OR /api/merchants/:id/rate-plan-analysis OR /api/merchants/:id/analysis-config
  else if (apiPath.match(/^\/merchants\/\d+\/(analysis|rate-plan-analysis|analysis-config)$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/analysis/${id}.json`;
  }
  // /api/merchants/:id/plan-dynamics/:planId
  else if (apiPath.match(/^\/merchants\/\d+\/plan-dynamics\/.+$/)) {
    const parts = apiPath.split("/");
    const merchantId = parts[2];
    const planId = decodeURIComponent(parts[4]);
    const safePlanId = planId.replace(/:/g, "_").replace(/\//g, "_");
    jsonPath = `${VERSION_DATA_DIR}/plan-dynamics/${merchantId}_${safePlanId}.json`;
  }
  // /api/contracts/:merchantId/:contractId/mapping (POST - but we return cached data)
  else if (apiPath.match(/^\/contracts\/\d+\/[A-Za-z0-9-]+\/mapping$/)) {
    const merchantId = apiPath.split("/")[2];
    const contractId = apiPath.split("/")[3];
    jsonPath = `${VERSION_DATA_DIR}/contracts/mapping/${merchantId}_${contractId}.json`;
  }
  // /api/contracts/:merchantId/:contractId (contract details)
  else if (apiPath.match(/^\/contracts\/\d+\/[A-Za-z0-9-]+$/)) {
    const merchantId = apiPath.split("/")[2];
    const contractId = apiPath.split("/")[3];
    jsonPath = `${VERSION_DATA_DIR}/contracts/details/${merchantId}_${contractId}.json`;
  }
  // /api/contracts/:id (list of contracts for merchant)
  else if (apiPath.match(/^\/contracts\/\d+$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/contracts/${id}.json`;
  }
  // /api/transactions/:id
  else if (apiPath.match(/^\/transactions\/[a-f0-9-]+$/)) {
    const txId = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/transactions/${txId}.json`;
  }
  // /api/transactions/:id/why
  else if (apiPath.match(/^\/transactions\/[a-f0-9-]+\/why$/)) {
    const txId = apiPath.split("/")[2];
    jsonPath = `${VERSION_DATA_DIR}/transactions/why/${txId}.json`;
  }
  // /api/reports/deviation
  else if (apiPath === "/reports/deviation") {
    jsonPath = `${VERSION_DATA_DIR}/reports/deviation.json`;
  }
  // /api/reports/deviation/underpay
  else if (apiPath === "/reports/deviation/underpay") {
    jsonPath = `${VERSION_DATA_DIR}/reports/deviation_underpay.json`;
  }
  // /api/reports/contract-mismatch
  else if (apiPath === "/reports/contract-mismatch") {
    jsonPath = `${VERSION_DATA_DIR}/reports/contract_mismatch.json`;
  }
  // /api/reports/anomalies
  else if (apiPath === "/reports/anomalies") {
    jsonPath = `${VERSION_DATA_DIR}/reports/anomalies.json`;
  }
  // /api/dsl-config - DSL configuration with versioning
  else if (apiPath === "/dsl-config") {
    jsonPath = `${VERSION_DATA_DIR}/dsl-config.json`;
  }
  // /api/ontology-mapping - Ontology field mapping configuration
  else if (apiPath === "/ontology-mapping") {
    jsonPath = `${VERSION_DATA_DIR}/ontology-mapping.json`;
  }
  // /api/experiments - Experiments list for this client/version
  else if (apiPath === "/experiments") {
    jsonPath = `${VERSION_DATA_DIR}/experiments.json`;
  }
  // /api/pipeline-config - Pipeline configuration schema (shared across all clients)
  else if (apiPath === "/pipeline-config") {
    jsonPath = `${DATA_DIR}/pipeline-config.json`;
  }
  else {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return serveFile(jsonPath, { ...extraHeaders, "Content-Type": "application/json" });
}

async function serveStatic(pathname: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  // Default to index.html for SPA routing
  let filePath = `${PUBLIC_DIR}${pathname}`;

  // Check if it's a file with extension
  if (!pathname.includes(".")) {
    filePath = `${PUBLIC_DIR}/index.html`;
  }

  const response = await serveFile(filePath, extraHeaders);

  // If file not found and not a specific file request, serve index.html (SPA routing)
  if (response.status === 404 && !pathname.includes(".")) {
    return serveFile(`${PUBLIC_DIR}/index.html`, extraHeaders);
  }

  return response;
}

// Create authentication cookie value (includes client ID and version)
function createAuthCookie(clientId: string, version: string): string {
  const value = encodeURIComponent(JSON.stringify({ client: clientId, version: version, ts: Date.now() }));
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`;
}

// Parse auth cookie and return client ID and version if valid
function parseAuthCookie(cookies: Record<string, string>): { clientId: string; version: string } | null {
  const value = cookies[COOKIE_NAME];
  if (!value) return null;
  try {
    const data = JSON.parse(value);
    if (data.client && data.version) {
      return { clientId: data.client, version: data.version };
    }
  } catch {
    // Invalid cookie
  }
  return null;
}

// Find client by ID
function findClientById(clientId: string): ClientConfig | null {
  for (const client of clients.values()) {
    if (client.id === clientId) {
      return client;
    }
  }
  return null;
}

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const cookies = parseCookies(req.headers.get("cookie") || "");
    const inviteParam = url.searchParams.get("invite");

    // Check existing auth cookie
    const authData = parseAuthCookie(cookies);
    const authedClient = authData ? findClientById(authData.clientId) : null;
    const authedVersion = authData?.version || authedClient?.default_version || "mainline";

    // POST /auth - login endpoint (validates invite + password)
    if (url.pathname === "/auth" && req.method === "POST") {
      try {
        const body = await req.json() as { invite?: string; password?: string };
        const client = clients.get(body.invite || "");

        if (client && body.password === client.password) {
          return new Response(JSON.stringify({ success: true, client: client.id }), {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": createAuthCookie(client.id, client.default_version),
            },
          });
        }
      } catch (e) {
        // Invalid JSON
      }
      return new Response(JSON.stringify({ success: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /logout - clear cookie
    if (url.pathname === "/logout" && req.method === "POST") {
      return new Response(JSON.stringify({ success: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`,
        },
      });
    }

    // GET /api/status - unauthenticated health check for monitoring
    if (url.pathname === "/api/status" && req.method === "GET") {
      return new Response(JSON.stringify({
        status: dataDirectoryExists ? "healthy" : "degraded",
        dataDir: DATA_DIR,
        dataDirExists: dataDirectoryExists,
        clientsLoaded: clients.size,
        message: dataDirectoryExists
          ? `${clients.size} clients loaded`
          : `Data directory not found: ${DATA_DIR}`
      }), {
        status: dataDirectoryExists ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Already authenticated - serve content
    if (authedClient) {
      // POST /api/reload - reload all client data from disk (requires auth)
      if (url.pathname === "/api/reload" && req.method === "POST") {
        console.log(`Reloading client data (requested by ${authedClient.id})...`);
        const result = await loadClients();
        return new Response(JSON.stringify({
          success: result.success,
          clients: clients.size,
          dataDir: DATA_DIR,
          message: result.success
            ? `Reloaded ${clients.size} clients from ${DATA_DIR}`
            : result.error
        }), {
          status: result.success ? 200 : 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      // POST /api/version - switch version
      if (url.pathname === "/api/version" && req.method === "POST") {
        try {
          const body = await req.json() as { version?: string };
          // Validate against dynamically discovered versions
          const availableVersions = await discoverVersions(authedClient);
          if (body.version && availableVersions.includes(body.version)) {
            return new Response(JSON.stringify({ success: true, version: body.version }), {
              headers: {
                "Content-Type": "application/json",
                "Set-Cookie": createAuthCookie(authedClient.id, body.version),
              },
            });
          }
        } catch (e) {
          // Invalid JSON
        }
        return new Response(JSON.stringify({ success: false, error: "Invalid version" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // API routes - serve from data/
      if (url.pathname.startsWith("/api/")) {
        return serveApiRoute(url.pathname, authedClient, authedVersion);
      }
      // Static files - serve from public/
      return serveStatic(url.pathname);
    }

    // Not authenticated - check invite
    // No invite param → show "no invite" page
    if (!inviteParam) {
      return serveNoInvitePage();
    }

    // Lookup client by invite code
    const client = clients.get(inviteParam);
    if (!client) {
      return serveNoInvitePage();
    }

    // Valid invite, no auth → show login page
    return serveLoginPage(client);
  },
});

// Initialize
console.log(`
========================================
  Finalyst Static Demo Server
========================================
Loading clients...`);

const loadResult = await loadClients();

if (loadResult.success) {
  console.log(`
Server running at: http://0.0.0.0:${PORT}
Data dir: ${DATA_DIR}
UI dir: ${PUBLIC_DIR}
Status: Ready (${clients.size} clients)
========================================
`);
} else {
  console.log(`
Server running at: http://0.0.0.0:${PORT}
Data dir: ${DATA_DIR} (NOT FOUND)
UI dir: ${PUBLIC_DIR}
Status: Degraded - No data available
========================================

To fix this:
  1. Create the data directory: ${DATA_DIR}
  2. Or set DATA_DIR=/path/to/data in .env

Check status: curl http://localhost:${PORT}/api/status
`);
}
