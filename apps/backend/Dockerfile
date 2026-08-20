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
RUN pnpm install --frozen-lockfile

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

# Copy workspace manifests for production install
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/types/package.json ./packages/types/
COPY apps/backend/package.json ./apps/backend/

# Install production deps (prisma is now a production dep)
RUN pnpm install --frozen-lockfile --prod

# Copy built output and Prisma schema
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma

# Copy shared types build
COPY --from=builder /app/packages/types/dist ./packages/types/dist

RUN chown -R smartserve:smartserve /app
USER smartserve

WORKDIR /app/apps/backend

EXPOSE 3001

# Generate Prisma client at runtime, run migrations, then start
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && node dist/main.js"]
