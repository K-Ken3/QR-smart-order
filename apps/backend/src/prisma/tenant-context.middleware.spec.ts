import { ForbiddenException } from '@nestjs/common';
import {
  TenantContextStorage,
  withTenantContext,
  applyTenantMiddleware,
} from './tenant-context.middleware';

// ---------------------------------------------------------------------------
// Helpers — minimal Prisma client stub
// ---------------------------------------------------------------------------

type MiddlewareHandler = (params: unknown, next: (p: unknown) => Promise<unknown>) => Promise<unknown>;

function buildPrismaStub(): { $use: jest.Mock; _handler: MiddlewareHandler | null } {
  const stub: { $use: jest.Mock; _handler: MiddlewareHandler | null } = {
    $use: jest.fn(),
    _handler: null,
  };

  stub.$use.mockImplementation((fn: MiddlewareHandler) => {
    stub._handler = fn;
  });

  return stub;
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('TenantContextStorage / withTenantContext', () => {
  it('provides the tenantId within the callback scope', () => {
    let captured: string | undefined;

    withTenantContext('tenant-abc', () => {
      captured = TenantContextStorage.getStore();
    });

    expect(captured).toBe('tenant-abc');
  });

  it('does not leak tenantId outside the callback scope', () => {
    withTenantContext('tenant-xyz', () => {
      // inside
    });

    // After the callback finishes the store should be gone.
    expect(TenantContextStorage.getStore()).toBeUndefined();
  });

  it('supports nested contexts — inner overrides outer', () => {
    let inner: string | undefined;

    withTenantContext('outer', () => {
      withTenantContext('inner', () => {
        inner = TenantContextStorage.getStore();
      });
    });

    expect(inner).toBe('inner');
  });
});

describe('applyTenantMiddleware', () => {
  it('calls $use once to register the middleware', () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    expect(stub.$use).toHaveBeenCalledTimes(1);
  });
});

describe('Tenant-context Prisma middleware behaviour', () => {
  function buildHandler(resultOverride?: unknown): MiddlewareHandler {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const handler = stub._handler!;

    // Replace the handler so we can customise what `next` returns.
    return (params: unknown, _next: (p: unknown) => Promise<unknown>) =>
      handler(params, () => Promise.resolve(resultOverride ?? { tenantId: 'tenant-1' }));
  }

  // ── Read operations ────────────────────────────────────────────────────

  it('injects tenantId into WHERE clause for findMany within tenant context', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const capturedParams: unknown[] = [];
    const params = { model: 'Branch', action: 'findMany', args: { where: { isActive: true } } };

    await withTenantContext('tenant-1', () =>
      middleware(params, (p) => {
        capturedParams.push(p);
        return Promise.resolve([]);
      }),
    );

    const forwarded = capturedParams[0] as { args: { where: Record<string, unknown> } };
    expect(forwarded.args.where.tenantId).toBe('tenant-1');
    expect(forwarded.args.where.isActive).toBe(true);
  });

  it('injects tenantId for findFirst', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const capturedParams: unknown[] = [];
    const params = { model: 'User', action: 'findFirst', args: {} };

    await withTenantContext('tenant-2', () =>
      middleware(params, (p) => {
        capturedParams.push(p);
        return Promise.resolve(null);
      }),
    );

    const forwarded = capturedParams[0] as { args: { where: Record<string, unknown> } };
    expect(forwarded.args.where.tenantId).toBe('tenant-2');
  });

  // ── No-context pass-through ───────────────────────────────────────────

  it('passes through without modifying args when no tenant context is set', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const capturedParams: unknown[] = [];
    const params = { model: 'Branch', action: 'findMany', args: { where: { isActive: true } } };

    // Call outside any withTenantContext — storage is undefined.
    await middleware(params, (p) => {
      capturedParams.push(p);
      return Promise.resolve([]);
    });

    const forwarded = capturedParams[0] as { args: { where: Record<string, unknown> } };
    // tenantId must NOT have been injected.
    expect(forwarded.args.where.tenantId).toBeUndefined();
  });

  it('passes through for models not in the tenant-scoped list', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const capturedParams: unknown[] = [];
    const params = { model: 'RefreshToken', action: 'findMany', args: { where: {} } };

    await withTenantContext('tenant-1', () =>
      middleware(params, (p) => {
        capturedParams.push(p);
        return Promise.resolve([]);
      }),
    );

    const forwarded = capturedParams[0] as { args: { where: Record<string, unknown> } };
    expect(forwarded.args.where.tenantId).toBeUndefined();
  });

  // ── Cross-tenant access blocked ───────────────────────────────────────

  it('throws ForbiddenException on cross-tenant update (returned record has different tenantId)', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const params = {
      model: 'Branch',
      action: 'update',
      args: { where: { id: 'branch-99' }, data: { name: 'Hacked' } },
    };

    await expect(
      withTenantContext('tenant-A', () =>
        middleware(params, () =>
          // Simulate DB returning a record that belongs to a DIFFERENT tenant.
          Promise.resolve({ id: 'branch-99', tenantId: 'tenant-B', name: 'Hacked' }),
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does NOT throw when update returns a record matching the context tenantId', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const params = {
      model: 'Branch',
      action: 'update',
      args: { where: { id: 'branch-1' }, data: { name: 'Updated' } },
    };

    await expect(
      withTenantContext('tenant-A', () =>
        middleware(params, () =>
          Promise.resolve({ id: 'branch-1', tenantId: 'tenant-A', name: 'Updated' }),
        ),
      ),
    ).resolves.toEqual({ id: 'branch-1', tenantId: 'tenant-A', name: 'Updated' });
  });

  it('returns count for updateMany without ownership check', async () => {
    const stub = buildPrismaStub();
    applyTenantMiddleware(stub);
    const middleware = stub._handler!;

    const params = {
      model: 'Branch',
      action: 'updateMany',
      args: { where: { isActive: true }, data: { isActive: false } },
    };

    await expect(
      withTenantContext('tenant-A', () =>
        middleware(params, () => Promise.resolve({ count: 3 })),
      ),
    ).resolves.toEqual({ count: 3 });
  });
});
