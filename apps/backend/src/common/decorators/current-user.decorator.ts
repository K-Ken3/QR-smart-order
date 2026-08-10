import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

/**
 * @CurrentUser() — parameter decorator that extracts the authenticated user
 * from the Express request object.
 *
 * The `RequestUser` object is attached to `req.user` by the `JwtStrategy.validate()`
 * method after a successful JWT verification.
 *
 * @example
 * ```ts
 * @Get('profile')
 * getProfile(@CurrentUser() user: RequestUser) {
 *   return user;
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: RequestUser }>();
    return request.user;
  },
);
