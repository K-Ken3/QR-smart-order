import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException } from '@nestjs/common';

/**
 * Per-request tenant context carried via Node's AsyncLocalStorage.
 * No dependency injection required — the interceptor sets the value
 * and Prisma middleware reads it within the same async context.
 */
export const TenantContextStorage = new AsyncLocalStorage<string>();

/**
 * Run `fn` inside a tenant-scoped async context.
 * The supplied `tenantId` will be visible to all Prisma calls made
 * within `fn` (including nested calls).
 */
export function withTenantContext<T>(tenantId: string, fn: () => T): T {
  return TenantContextStorage.run(tenantId, fn);
}

// ---------------------------------------------------------------------------
// Models that carry a tenantId field and must be auto-scoped.
// ---------------------------------------------------------------------------
const TENANT_SCOPED_MODELS = new Set([
  'Tenant',
  'Branch',
  'Location',
  'User',
  'Request',
  'QrCode',
  'MenuItem',
  'ServiceCatalog',
  'AuditLog',
  'Feedback',
]);

// Read operations that receive an injected WHERE clause.
const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findUnique',
  'findUniqueOrThrow',
  'findFirstOrThrow',
]);

// Write operations where we also verify the returned record belongs to the tenant.
const WRITE_OPERATIONS = new Set(['update', 'updateMany', 'delete', 'deleteMany']);

type PrismaMiddlewareParams = {
  model?: string;
  action: string;
  args: Record<string, unknown>;
  dataPath: string[];
  runInTransaction: boolean;
};

type PrismaMiddlewareNext = (params: PrismaMiddlewareParams) => Promise<unknown>;

/**
 * Apply the tenant-isolation Prisma middleware to the given client instance.
 *
 * Must be called **before** the first query, i.e. inside `onModuleInit()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyTenantMiddleware(prismaClient: any): void {
  // If the Prisma client instance doesn't support `$use` (driver adapter or runtime mismatch),
  // skip applying the middleware in dev to avoid startup failure. This preserves prod safety
  // where the generated client supports `$use`.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (typeof prismaClient.$use !== 'function') {
    // eslint-disable-next-line no-console
    console.warn('Prisma client does not support $use; tenant middleware not applied.');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  prismaClient.$use(async (params: PrismaMiddlewareParams, next: PrismaMiddlewareNext) => {
    const tenantId = TenantContextStorage.getStore();
    const model = params.model ?? '';

    // Skip tenant scoping for models without a tenantId column.
    if (!TENANT_SCOPED_MODELS.has(model) || !tenantId) {
      return next(params);
    }

    // ── READ operations — inject WHERE tenantId ────────────────────────────
    if (READ_OPERATIONS.has(params.action)) {
      params.args = params.args ?? {};
      params.args['where'] = {
        ...(params.args['where'] as Record<string, unknown> | undefined),
        tenantId,
      };
      return next(params);
    }

    // ── WRITE operations — inject WHERE tenantId, then verify result ───────
    if (WRITE_OPERATIONS.has(params.action)) {
      params.args = params.args ?? {};
      params.args['where'] = {
        ...(params.args['where'] as Record<string, unknown> | undefined),
        tenantId,
      };

      const result = await next(params);

      // updateMany / deleteMany return a count object, not a record — skip check.
      if (params.action === 'updateMany' || params.action === 'deleteMany') {
        return result;
      }

      // For single-record writes, verify ownership.
      if (result && typeof result === 'object') {
        const record = result as Record<string, unknown>;
        if ('tenantId' in record && record['tenantId'] !== tenantId) {
          throw new ForbiddenException('Cross-tenant access denied');
        }
      }

      return result;
    }

    return next(params);
  });
}
