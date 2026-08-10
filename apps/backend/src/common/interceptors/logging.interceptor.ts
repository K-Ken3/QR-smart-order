import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import * as rTracer from 'cls-rtracer';

/**
 * LoggingInterceptor
 *
 * Emits a single structured JSON log line for every HTTP request/response:
 *
 * ```json
 * {
 *   "level": "info",
 *   "method": "GET",
 *   "path": "/api/health",
 *   "status": 200,
 *   "responseTimeMs": 45,
 *   "requestId": "...",
 *   "timestamp": "2024-01-01T00:00:00.000Z"
 * }
 * ```
 *
 * Log levels:
 *  - 2xx / 3xx → `info`
 *  - 4xx        → `warn`
 *  - 5xx        → `error`
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const { method, originalUrl } = req;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.log(method, originalUrl, res.statusCode, startedAt);
        },
        error: (err: unknown) => {
          // The HttpExceptionFilter will set the status on the response object;
          // for unhandled errors we fall back to 500.
          const status =
            res.statusCode && res.statusCode !== 200
              ? res.statusCode
              : err instanceof Error && 'status' in err
                ? (err as { status: number }).status
                : 500;
          this.log(method, originalUrl, status, startedAt);
        },
      }),
    );
  }

  private log(
    method: string,
    path: string,
    status: number,
    startedAt: number,
  ): void {
    const responseTimeMs = Date.now() - startedAt;
    const requestId = rTracer.id() as string | undefined;
    const timestamp = new Date().toISOString();

    const entry = {
      level: this.resolveLevel(status),
      method,
      path,
      status,
      responseTimeMs,
      requestId,
      timestamp,
    };

    if (status >= 500) {
      this.logger.error(JSON.stringify(entry));
    } else if (status >= 400) {
      this.logger.warn(JSON.stringify(entry));
    } else {
      this.logger.log(JSON.stringify(entry));
    }
  }

  private resolveLevel(status: number): 'info' | 'warn' | 'error' {
    if (status >= 500) return 'error';
    if (status >= 400) return 'warn';
    return 'info';
  }
}
