import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() — marks an endpoint as publicly accessible.
 *
 * When applied, the global `JwtAuthGuard` will skip JWT verification
 * and allow the request through without an `Authorization` header.
 *
 * @example
 * ```ts
 * @Public()
 * @Post('auth/login')
 * login(@Body() dto: LoginDto) { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
