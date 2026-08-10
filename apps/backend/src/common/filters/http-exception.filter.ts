import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as rTracer from 'cls-rtracer';

/**
 * Structured error envelope returned on every error response.
 */
export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
  requestId: string | undefined;
}

/**
 * Maps well-known NestJS / domain exception names to HTTP status codes.
 * Any exception that is NOT an HttpException falls back to 500.
 */
const DOMAIN_EXCEPTION_STATUS_MAP: Record<string, number> = {
  BadRequestException: HttpStatus.BAD_REQUEST,
  UnauthorizedException: HttpStatus.UNAUTHORIZED,
  ForbiddenException: HttpStatus.FORBIDDEN,
  NotFoundException: HttpStatus.NOT_FOUND,
  ConflictException: HttpStatus.CONFLICT,
  UnprocessableEntityException: HttpStatus.UNPROCESSABLE_ENTITY,
  NotImplementedException: HttpStatus.NOT_IMPLEMENTED,
  ServiceUnavailableException: HttpStatus.SERVICE_UNAVAILABLE,
  GatewayTimeoutException: HttpStatus.GATEWAY_TIMEOUT,
  RequestTimeoutException: HttpStatus.REQUEST_TIMEOUT,
  PayloadTooLargeException: HttpStatus.PAYLOAD_TOO_LARGE,
  TooManyRequestsException: HttpStatus.TOO_MANY_REQUESTS,
};

/**
 * Derives a short, screaming-snake-case error code from the exception name.
 * e.g. "NotFoundException"    → "NOT_FOUND"
 *      "BadRequestException"  → "BAD_REQUEST"
 *      "Error"                → "INTERNAL_SERVER_ERROR"
 */
function toErrorCode(name: string, status: number): string {
  // Strip trailing "Exception" to get the semantic name
  const stripped = name.replace(/Exception$/, '');

  // Plain JS Error class resolves to empty or "Error" — map to ISE
  if (!stripped || stripped === 'Error') {
    return status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'INTERNAL_SERVER_ERROR'
      : HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
  }

  // Convert CamelCase → SCREAMING_SNAKE_CASE
  // e.g. "NotFoundException" stripped → "Not Found" ... actually CamelCase:
  // "BadRequest" → "BAD_REQUEST", "NotFound" → "NOT_FOUND"
  const snaked = stripped
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toUpperCase();

  return snaked || 'INTERNAL_SERVER_ERROR';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isDevelopment =
    process.env['NODE_ENV'] === 'development' ||
    process.env['NODE_ENV'] === 'test';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let errorCode: string;
    let message: string;
    let details: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Always derive errorCode from the constructor name for consistent SCREAMING_SNAKE format
    errorCode = toErrorCode(exception.constructor.name, status);

    if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        // ValidationPipe produces array messages — surface as details
        if (Array.isArray(resp['message'])) {
          details = resp['message'] as unknown[];
          message = 'Validation failed';
        } else {
          message = (resp['message'] as string) ?? exception.message;
        }
      } else {
        message = exception.message;
      }
    } else {
      // Non-HttpException: map by constructor name or default to 500
      const exceptionName =
        exception instanceof Error ? exception.constructor.name : 'UnknownError';
      status =
        DOMAIN_EXCEPTION_STATUS_MAP[exceptionName] ??
        HttpStatus.INTERNAL_SERVER_ERROR;
      errorCode = toErrorCode(exceptionName, status);

      if (exception instanceof Error) {
        // In development/test, surface the raw message for easier debugging.
        // In production, never leak internal details.
        message = this.isDevelopment
          ? exception.message
          : 'An unexpected error occurred';
      } else {
        message = 'An unexpected error occurred';
      }
    }

    const requestId = rTracer.id() as string | undefined;

    this.logger.error({
      message: `HTTP ${status} — ${request.method} ${request.url}`,
      method: request.method,
      path: request.url,
      status,
      errorCode,
      requestId,
      // Include stack only in development; never in production
      ...(this.isDevelopment &&
        exception instanceof Error && { stack: exception.stack }),
    });

    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: errorCode,
        message,
        ...(details !== undefined && { details }),
      },
      requestId,
    };

    response.status(status).json(body);
  }
}
