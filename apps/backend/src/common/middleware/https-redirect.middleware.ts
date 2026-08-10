import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Redirects HTTP traffic to HTTPS in production environments.
 *
 * Detection strategy: checks the `x-forwarded-proto` header set by reverse
 * proxies / load balancers (Nginx, Railway, Vercel, AWS ALB, etc.).
 * If the header is absent or already "https", the request is passed through.
 *
 * Only active when NODE_ENV === 'production'.
 */
@Injectable()
export class HttpsRedirectMiddleware implements NestMiddleware {
  private readonly isProduction = process.env['NODE_ENV'] === 'production';

  use(req: Request, res: Response, next: NextFunction): void {
    if (!this.isProduction) {
      return next();
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const proto = Array.isArray(forwardedProto)
      ? forwardedProto[0]
      : forwardedProto;

    if (proto && proto.toLowerCase() !== 'https') {
      const httpsUrl = `https://${req.headers['host'] ?? ''}${req.originalUrl}`;
      res.redirect(301, httpsUrl);
      return;
    }

    next();
  }
}
