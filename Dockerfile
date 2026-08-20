# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/backend/package.json ./apps/backend/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/types/ ./packages/types/
COPY apps/backend/ ./apps/backend/

RUN pnpm --filter @smartserve/types build
RUN cd apps/backend && pnpm db:generate
RUN cd apps/backend && ../../node_modules/.bin/tsc -p tsconfig.build.json
RUN cd apps/backend && ls dist/main.js

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
RUN npm install -g prisma@7.9.1

RUN addgroup -S smartserve && adduser -S smartserve -G smartserve

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/apps/backend/prisma.config.js ./apps/backend/prisma.config.js
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN mkdir -p uploads && chown -R smartserve:smartserve /app
USER smartserve

WORKDIR /app/apps/backend

EXPOSE 10000

CMD ["sh", "-c", "prisma migrate deploy && node dist/main.js"]
