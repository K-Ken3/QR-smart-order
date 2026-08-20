# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Copy workspace manifests and root tsconfig
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/backend/package.json ./apps/backend/

# Install all dependencies (including dev for build)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source
COPY packages/types/ ./packages/types/
COPY apps/backend/ ./apps/backend/

# Build shared types package first
RUN pnpm --filter @smartserve/types build

# Generate Prisma client
RUN cd apps/backend && pnpm db:generate

# Build the backend with tsc
RUN cd apps/backend && npx tsc -p tsconfig.build.json

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Create non-root user
RUN addgroup -S smartserve && adduser -S smartserve -G smartserve

WORKDIR /app

# Copy everything from builder — node_modules, source, build output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/prisma.config.js ./apps/backend/prisma.config.js
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN chown -R smartserve:smartserve /app
USER smartserve

WORKDIR /app/apps/backend

EXPOSE 3001

# Run migrations then start the app
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
