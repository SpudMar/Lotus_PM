# ── Stage 1: Dependencies ──────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install dependencies (separate layer for caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Builder ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# OpenSSL required by Prisma engine binaries on Alpine 3.17+ (OpenSSL 3.x)
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js (standalone output for minimal image size)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: Runner ────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# OpenSSL required by Prisma query engine at runtime on Alpine 3.17+
RUN apk add --no-cache openssl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy Prisma schema + migration files (needed for prisma migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy Prisma CLI and engines so we can run migrations on startup.
# .bin/prisma is a symlink → ../prisma/build/index.js; Docker COPY dereferences
# symlinks, so copying via .bin/ breaks __dirname resolution and the CLI can't
# find prisma_schema_build_bg.wasm.  Copy the full packages instead and invoke
# the CLI directly as: node ./node_modules/prisma/build/index.js (see entrypoint.sh)
# prisma/  — CLI + prisma_schema_build_bg.wasm (in build/)
# @prisma/ — engines (query, migration, schema, introspection)
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy standalone Next.js output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Entrypoint: constructs DATABASE_URL from injected secret env vars,
# runs Prisma migrations, then starts the Next.js server.
# ECS injects: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, NEXTAUTH_SECRET
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check (matches ALB health check path in CDK)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["./entrypoint.sh"]
