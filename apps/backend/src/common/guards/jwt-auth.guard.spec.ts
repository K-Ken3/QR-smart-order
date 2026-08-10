import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildContext(isPublic: boolean, user: unknown = undefined): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
    }),
    // Other methods that ExecutionContext requires (not used in these tests):
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({}),
    switchToWs: () => ({}),
    getType: () => 'http',
    __isPublic: isPublic,
  } as unknown as ExecutionContext;
}

function buildGuard(reflectorOverrides?: Partial<Reflector>): JwtAuthGuard {
  const reflector = {
    getAllAndOverride: jest.fn(),
    ...reflectorOverrides,
  } as unknown as Reflector;
  return new JwtAuthGuard(reflector);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwtAuthGuard', () => {
  describe('when @Public() metadata is present', () => {
    it('returns true without attempting JWT verification', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(true),
      } as unknown as Reflector;

      const guard = new JwtAuthGuard(reflector);
      const context = buildContext(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        expect.anything(),
        expect.anything(),
      ]);
    });
  });

  describe('when @Public() metadata is NOT present', () => {
    it('delegates to the passport-jwt super.canActivate()', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector;

      const guard = new JwtAuthGuard(reflector);

      // Spy on the parent AuthGuard behaviour — when no real JWT infra is
      // present, super.canActivate() will reject with UnauthorizedException.
      const superSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockImplementation(() => {
          throw new UnauthorizedException();
        });

      const context = buildContext(false);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      superSpy.mockRestore();
    });

    it('allows request through when passport resolves a valid token', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector;

      const guard = new JwtAuthGuard(reflector);

      const superSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockReturnValue(true);

      const context = buildContext(false, {
        userId: 'u1',
        tenantId: 't1',
        role: 'BUSINESS_OWNER',
        email: 'owner@test.com',
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      superSpy.mockRestore();
    });

    it('throws 401 when token is missing (passport rejects)', () => {
      const reflector = {
        getAllAndOverride: jest.fn().mockReturnValue(false),
      } as unknown as Reflector;

      const guard = new JwtAuthGuard(reflector);

      const superSpy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(guard)), 'canActivate')
        .mockImplementation(() => {
          throw new UnauthorizedException('No auth token');
        });

      const context = buildContext(false);

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      superSpy.mockRestore();
    });
  });

  describe('guard instantiation', () => {
    it('can be constructed with a Reflector', () => {
      const guard = buildGuard();
      expect(guard).toBeInstanceOf(JwtAuthGuard);
    });
  });
});
