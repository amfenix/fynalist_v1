/**
 * Finalyst Static Demo Server
 *
 * Serves the React UI with mock JSON data, protected by invite + password authentication.
 *
 * Flow:
 * 1. No invite param → "No invite" page
 * 2. With invite param, no cookie → Login page (enter password)
 * 3. POST /auth with invite + password → Validate and set cookie
 * 4. Valid cookie → Serve content
 */

const INVITE_CODE = Bun.env.INVITE_CODE || "demo-invite";
const PASSWORD = Bun.env.PASSWORD || "demo-password";
const PORT = parseInt(Bun.env.PORT || "3001");
const COOKIE_NAME = "finalyst_auth";
const COOKIE_VALUE = "authenticated"; // Don't store secrets in cookie

// Paths - use Bun's file resolution
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PUBLIC_DIR = resolve(__dirname, "../public");
const DATA_DIR = resolve(__dirname, "../data");
const LOGIN_DIR = resolve(__dirname, "../login");

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
      cookies[name] = value;
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
  return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Finalyst - No Invite</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: {
              50: '#f0f9ff',
              100: '#e0f2fe',
              500: '#0ea5e9',
              600: '#0284c7',
              700: '#0369a1',
            }
          }
        }
      }
    }
  </script>
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

async function serveLoginPage(invite: string): Promise<Response> {
  // Try to serve the custom login page
  const loginFile = resolve(LOGIN_DIR, "index.html");
  try {
    const file = Bun.file(loginFile);
    if (await file.exists()) {
      let html = await file.text();
      // Inject the invite code into the page
      html = html.replace("</head>", `<script>window.INVITE_CODE = "${invite}";</script></head>`);
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
  <title>Finalyst - Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>window.INVITE_CODE = "${invite}";</script>
</head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
  <div class="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
    <div class="text-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Finalyst Demo</h1>
      <p class="text-gray-500 mt-2">Enter your password to continue</p>
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
          body: JSON.stringify({ invite: window.INVITE_CODE, password })
        });

        if (res.ok) {
          window.location.reload();
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

async function serveApiRoute(pathname: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  // Remove /api prefix
  const apiPath = pathname.replace(/^\/api/, "");

  // Map API routes to JSON files
  let jsonPath: string;

  // /api/merchants
  if (apiPath === "/merchants") {
    jsonPath = `${DATA_DIR}/merchants.json`;
  }
  // /api/merchants/:id
  else if (apiPath.match(/^\/merchants\/\d+$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${DATA_DIR}/merchants/${id}.json`;
  }
  // /api/merchants/:id/monthly
  else if (apiPath.match(/^\/merchants\/\d+\/monthly$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${DATA_DIR}/monthly/${id}.json`;
  }
  // /api/merchants/:id/plans
  else if (apiPath.match(/^\/merchants\/\d+\/plans$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${DATA_DIR}/plans/${id}.json`;
  }
  // /api/merchants/:id/plans/:planKey
  else if (apiPath.match(/^\/merchants\/\d+\/plans\/.+$/)) {
    const parts = apiPath.split("/");
    const planKey = decodeURIComponent(parts[4]);
    const safeKey = planKey.replace(/:/g, "_").replace(/\//g, "_");
    jsonPath = `${DATA_DIR}/plans/details/${safeKey}.json`;
  }
  // /api/merchants/:id/stability
  else if (apiPath.match(/^\/merchants\/\d+\/stability$/)) {
    const id = apiPath.split("/")[2];
    jsonPath = `${DATA_DIR}/stability/${id}.json`;
  }
  // /api/transactions/:id
  else if (apiPath.match(/^\/transactions\/[a-f0-9-]+$/)) {
    const txId = apiPath.split("/")[2];
    jsonPath = `${DATA_DIR}/transactions/${txId}.json`;
  }
  // /api/transactions/:id/why
  else if (apiPath.match(/^\/transactions\/[a-f0-9-]+\/why$/)) {
    const txId = apiPath.split("/")[2];
    jsonPath = `${DATA_DIR}/transactions/why/${txId}.json`;
  }
  // /api/health
  else if (apiPath === "/health") {
    return new Response(JSON.stringify({ status: "healthy" }), {
      headers: { "Content-Type": "application/json", ...extraHeaders },
    });
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

const server = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Bind to all interfaces for Docker
  async fetch(req) {
    const url = new URL(req.url);
    const cookies = parseCookies(req.headers.get("cookie") || "");
    const inviteParam = url.searchParams.get("invite");

    // Check if already authenticated via cookie
    const isAuthed = cookies[COOKIE_NAME] === COOKIE_VALUE;

    // POST /auth - login endpoint (validates invite + password)
    if (url.pathname === "/auth" && req.method === "POST") {
      try {
        const body = await req.json() as { invite?: string; password?: string };
        if (body.invite === INVITE_CODE && body.password === PASSWORD) {
          return new Response(JSON.stringify({ success: true }), {
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": `${COOKIE_NAME}=${COOKIE_VALUE}; HttpOnly; Path=/; Max-Age=86400; SameSite=Strict`,
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

    // Already authenticated - serve content
    if (isAuthed) {
      // API routes - serve from data/
      if (url.pathname.startsWith("/api/")) {
        return serveApiRoute(url.pathname);
      }
      // Static files - serve from public/
      return serveStatic(url.pathname);
    }

    // Not authenticated - check invite
    // No invite param → show "no invite" page
    if (!inviteParam) {
      return serveNoInvitePage();
    }

    // Invalid invite → show "no invite" page
    if (inviteParam !== INVITE_CODE) {
      return serveNoInvitePage();
    }

    // Valid invite, no auth → show login page
    return serveLoginPage(inviteParam);
  },
});

console.log(`
╔════════════════════════════════════════════════════════════╗
║                  Finalyst Static Demo                      ║
╠════════════════════════════════════════════════════════════╣
║  Server running at: http://0.0.0.0:${PORT}
║  Access via invite: http://host:${PORT}?invite=...
╚════════════════════════════════════════════════════════════╝
`);
