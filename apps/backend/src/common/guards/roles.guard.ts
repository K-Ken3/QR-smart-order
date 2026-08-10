import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY, UserRoleValue } from '../decorators/roles.decorator';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

/**
 * RolesGuard — enforces RBAC after authentication.
 *
 * Behaviour:
 *  - If no `@Roles()` metadata is present on the handler or class, all
 *    authenticated users are allowed through (no role restriction).
 *  - If `@Roles(...roles)` is present, the authenticated user's `role` must
 *    appear in the allowed list. A mismatch throws 403 `ForbiddenException`.
 *
 * Must run *after* `JwtAuthGuard` so that `req.user` is populated.
 * Register globally in AppModule via `APP_GUARD`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRoleValue[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No role restriction — any authenticated user passes.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;

    // No user on request means JwtAuthGuard was bypassed (@Public endpoint).
    // RolesGuard defers gracefully — public endpoints carry no role restriction.
    if (!user) {
      return true;
    }

    const hasRole = requiredRoles.includes(user.role as UserRoleValue);

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: [${requiredRoles.join(', ')}], got: ${user.role}`,
      );
    }

    return true;
  }
}
