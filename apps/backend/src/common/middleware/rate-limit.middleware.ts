import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Sliding-window rate limiter.
 *
 * Limits:
 *  - Unauthenticated requests  : 30 per minute per IP
 *  - Authenticated requests    : 120 per minute per user (identified by Bearer token)
 *
 * Storage: in-memory Map, suitable for single-instance deployments.
 * For multi-instance deployments, swap the store for a Redis ZSET implementation.
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);

  /** Window length in milliseconds */
  private readonly WINDOW_MS = 60_000;

  /** Max requests for unauthenticated callers (per IP) */
  private readonly UNAUTH_MAX = 30;

  /** Max requests for authenticated callers (per user token / IP) */
  private readonly AUTH_MAX = 120;

  /**
   * In-memory store: key → sorted list of request timestamps (ms).
   * Keys are either `ip:<address>` or `auth:<token_prefix>`.
   */
  private readonly store = new Map<string, number[]>();

  use(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const isAuthenticated = typeof authHeader === 'string' && authHeader.startsWith('Bearer ');

    const key = this.buildKey(req, isAuthenticated, authHeader);
    const limit = isAuthenticated ? this.AUTH_MAX : this.UNAUTH_MAX;

    const now = Date.now();
    const windowStart = now - this.WINDOW_MS;

    // Retrieve and prune timestamps older than the window
    const timestamps = (this.store.get(key) ?? []).filter(ts => ts > windowStart);

    if (timestamps.length >= limit) {
      // Oldest timestamp in the window tells us when a slot opens up
      const oldestInWindow = timestamps[0]!;
      const retryAfterMs = oldestInWindow + this.WINDOW_MS - now;
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);

      this.logger.warn({
        message: 'Rate limit exceeded',
        key,
        count: timestamps.length,
        limit,
        retryAfterSeconds,
      });

      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil((oldestInWindow + this.WINDOW_MS) / 1000)));

      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: `Rate limit exceeded. Please retry after ${retryAfterSeconds} second(s).`,
          details: [{ retryAfterSeconds }],
        },
        requestId: undefined,
      });
      return;
    }

    // Record this request
    timestamps.push(now);
    this.store.set(key, timestamps);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(limit - timestamps.length));

    next();
  }

  private buildKey(req: Request, isAuthenticated: boolean, authHeader: string | undefined): string {
    if (isAuthenticated && authHeader) {
      // Use the first 32 chars of the Bearer token as a safe, opaque key
      // (avoids logging full tokens, handles missing tokens gracefully)
      const token = authHeader.replace(/^Bearer\s+/, '');
      return `auth:${token.substring(0, 32)}`;
    }

    // Fall back to IP address for unauthenticated requests
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      'unknown';
    return `ip:${ip}`;
  }

  /**
   * Exposed for testing: clears the in-memory store.
   */
  clearStore(): void {
    this.store.clear();
  }

  /**
   * Exposed for testing: returns the current count for a key.
   */
  getCount(key: string, windowMs = this.WINDOW_MS): number {
    const now = Date.now();
    const windowStart = now - windowMs;
    return (this.store.get(key) ?? []).filter(ts => ts > windowStart).length;
  }
}
