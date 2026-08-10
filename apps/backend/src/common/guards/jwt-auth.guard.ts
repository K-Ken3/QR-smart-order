import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * JwtAuthGuard — global authentication guard.
 *
 * Behaviour:
 *  - If the handler (or its class) is decorated with `@Public()`, the guard
 *    immediately returns `true` and skips JWT verification entirely.
 *  - Otherwise it delegates to Passport's `jwt` strategy. A missing, expired,
 *    or invalid token will cause Passport to throw a 401 `UnauthorizedException`.
 *
 * Register globally in AppModule via `APP_GUARD` so every endpoint is protected
 * by default, and only explicitly `@Public()` routes are open.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check handler-level metadata first, then fall back to class-level.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    // Delegate to passport-jwt for token verification.
    return super.canActivate(context);
  }
}
