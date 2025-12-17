# syntax=docker/dockerfile:1

# ============================================
# Stage: Base
# ============================================
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# ============================================
# Stage: Development
# ============================================
FROM base AS development

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Expose port (configurable via PORT env)
EXPOSE 3001

# Run development server with watch mode
CMD ["bun", "--watch", "run", "src/server.ts"]

# ============================================
# Stage: Production
# ============================================
FROM base AS production

# Copy package files
COPY package.json bun.lockb* ./

# Install production dependencies only
RUN bun install --production

# Copy application code
COPY src ./src
COPY public ./public
COPY data ./data
COPY login ./login

# Use existing bun user (already in oven/bun image)
RUN chown -R bun:bun /app

USER bun

# Expose port (configurable via PORT env)
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-80}/api/health || exit 1

# Run production server
CMD ["bun", "run", "src/server.ts"]
