# ============================================================
#  HiveClaw — Docker Image
#  Multi-stage build for minimal production image
# ============================================================

FROM node:22-alpine AS base

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ bash

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ---- Production Stage ----
FROM node:22-alpine AS production

RUN apk add --no-cache bash tini

WORKDIR /app

# Copy dependencies from build stage
COPY --from=base /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Make scripts executable
RUN chmod +x bin/hiveclaw.js scripts/*.sh 2>/dev/null || true

# Expose gateway port and HiveMem port
EXPOSE 18789
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://localhost:18789/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start gateway
CMD ["node", "gateway/index.js"]
