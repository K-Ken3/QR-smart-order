import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { withTenantContext } from '../../prisma/tenant-context.middleware';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

/**
 * TenantContextInterceptor
 *
 * Extracts `tenantId` from the authenticated user on the request (`req.user`)
 * and wraps the downstream handler in a `withTenantContext()` call so that
 * every Prisma query executed during that request is automatically scoped to
 * the caller's tenant.
 *
 * No-ops for public endpoints where `req.user` is absent.
 *
 * Register in `main.ts` (via `app.useGlobalInterceptors`) *after* the
 * `LoggingInterceptor`, or add it to AppModule's global providers.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();

    const tenantId = request.user?.tenantId;

    // Public endpoint — no tenant context required.
    if (!tenantId) {
      return next.handle();
    }

    // Wrap the entire handler execution inside the tenant context.
    // withTenantContext is synchronous but returns the Observable produced
    // by next.handle(), so the async execution stays within the ALS store.
    return withTenantContext(tenantId, () => next.handle());
  }
}
