import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContext(user?: Partial<RequestUser>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function buildGuard(requiredRoles?: string[]): RolesGuard {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RolesGuard', () => {
  describe('when no @Roles() metadata is set', () => {
    it('returns true for any authenticated user', () => {
      const guard = buildGuard(undefined);
      const context = buildContext({ userId: 'u1', role: 'EMPLOYEE', tenantId: 't1', email: 'e@t.com' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('returns true even when no user is on the request (public endpoint)', () => {
      const guard = buildGuard(undefined);
      const context = buildContext(undefined);

      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('when @Roles() metadata is set', () => {
    it('allows request when user role matches required role', () => {
      const guard = buildGuard(['BRANCH_MANAGER']);
      const context = buildContext({ userId: 'u1', role: 'BRANCH_MANAGER', tenantId: 't1', email: 'bm@t.com' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('allows request when user role is one of multiple required roles', () => {
      const guard = buildGuard(['BRANCH_MANAGER', 'BUSINESS_OWNER']);
      const context = buildContext({ userId: 'u1', role: 'BUSINESS_OWNER', tenantId: 't1', email: 'bo@t.com' });

      expect(guard.canActivate(context)).toBe(true);
    });

    it('throws ForbiddenException when user role does not match', () => {
      const guard = buildGuard(['BRANCH_MANAGER']);
      const context = buildContext({ userId: 'u1', role: 'EMPLOYEE', tenantId: 't1', email: 'emp@t.com' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException with a descriptive message', () => {
      const guard = buildGuard(['SUPER_ADMIN']);
      const context = buildContext({ userId: 'u1', role: 'RECEPTIONIST', tenantId: 't1', email: 'r@t.com' });

      expect(() => guard.canActivate(context)).toThrow(/Insufficient permissions/);
    });

    it('returns true for @Public endpoints even when roles are required (no user)', () => {
      // If JwtAuthGuard skipped auth (public endpoint), req.user is undefined.
      // RolesGuard should not crash and should return true.
      const guard = buildGuard(['SUPER_ADMIN']);
      const context = buildContext(undefined);

      // No user on request → guard returns true (public route, no enforcement)
      expect(guard.canActivate(context)).toBe(true);
    });

    it('blocks RECEPTIONIST from a SUPER_ADMIN-only endpoint', () => {
      const guard = buildGuard(['SUPER_ADMIN']);
      const context = buildContext({ userId: 'u1', role: 'RECEPTIONIST', tenantId: 't1', email: 'r@t.com' });

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows SUPER_ADMIN on a SUPER_ADMIN-only endpoint', () => {
      const guard = buildGuard(['SUPER_ADMIN']);
      const context = buildContext({ userId: 'u1', role: 'SUPER_ADMIN', tenantId: 't1', email: 'sa@t.com' });

      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
