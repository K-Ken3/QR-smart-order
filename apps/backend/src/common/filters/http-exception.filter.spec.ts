import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpExceptionFilter, ErrorEnvelope } from './http-exception.filter';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Builds a minimal ArgumentsHost that records what was written to the response.
 */
function buildMockHost(method = 'GET', url = '/api/test') {
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
  const response = {
    status: statusFn,
    json: jsonFn,
  };
  const request = {
    method,
    url,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };

  return { host, statusFn, jsonFn };
}

function captureResponse(jsonFn: jest.Mock): ErrorEnvelope {
  expect(jsonFn).toHaveBeenCalledTimes(1);
  return jsonFn.mock.calls[0][0] as ErrorEnvelope;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;

  beforeEach(() => {
    // Force development mode so inner-implementation paths are exercised
    process.env['NODE_ENV'] = 'test';
    filter = new HttpExceptionFilter();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────
  // Error envelope shape
  // ──────────────────────────────────────

  describe('error envelope shape', () => {
    it('always returns success: false', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new NotFoundException('Not found'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.success).toBe(false);
    });

    it('includes error.code, error.message, and requestId fields', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new NotFoundException('Entity missing'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error).toBeDefined();
      expect(typeof body.error.code).toBe('string');
      expect(typeof body.error.message).toBe('string');
      expect('requestId' in body).toBe(true);
    });
  });

  // ──────────────────────────────────────
  // HttpException mapping
  // ──────────────────────────────────────

  describe('HttpException status code mapping', () => {
    const cases: [() => HttpException, number][] = [
      [() => new BadRequestException('bad'), HttpStatus.BAD_REQUEST],
      [() => new UnauthorizedException('unauthorized'), HttpStatus.UNAUTHORIZED],
      [() => new ForbiddenException('forbidden'), HttpStatus.FORBIDDEN],
      [() => new NotFoundException('not found'), HttpStatus.NOT_FOUND],
      [() => new HttpException('conflict', HttpStatus.CONFLICT), HttpStatus.CONFLICT],
      [() => new HttpException('too many', HttpStatus.TOO_MANY_REQUESTS), HttpStatus.TOO_MANY_REQUESTS],
    ];

    it.each(cases)('maps exception to correct HTTP status', (factory, expectedStatus) => {
      const { host, statusFn } = buildMockHost();
      filter.catch(factory(), host as never);
      expect(statusFn).toHaveBeenCalledWith(expectedStatus);
    });
  });

  describe('HttpException error code derivation', () => {
    it('derives NOT_FOUND code from NotFoundException', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new NotFoundException('Entity not found'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('derives UNAUTHORIZED code from UnauthorizedException', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new UnauthorizedException('Token expired'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('derives FORBIDDEN code from ForbiddenException', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new ForbiddenException('Insufficient role'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('derives BAD_REQUEST code from BadRequestException', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new BadRequestException('Invalid input'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('ValidationPipe array message flattening', () => {
    it('surfaces validation messages as details array', () => {
      const { host, jsonFn } = buildMockHost();
      const validationException = new BadRequestException({
        statusCode: 400,
        message: ['email must be valid', 'password must not be empty'],
        error: 'Bad Request',
      });
      filter.catch(validationException, host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.message).toBe('Validation failed');
      expect(body.error.details).toEqual(['email must be valid', 'password must not be empty']);
    });
  });

  describe('string message response', () => {
    it('handles HttpException with plain string response', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new HttpException('Custom plain message', HttpStatus.CONFLICT), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.message).toBe('Custom plain message');
    });
  });

  // ──────────────────────────────────────
  // Non-HttpException fallback
  // ──────────────────────────────────────

  describe('non-HttpException fallback to 500', () => {
    it('returns 500 for a plain Error', () => {
      const { host, statusFn } = buildMockHost();
      filter.catch(new Error('database crashed'), host as never);
      expect(statusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('sets error.code to INTERNAL_SERVER_ERROR for plain Error', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new Error('something broke'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('returns 500 for a thrown non-Error value', () => {
      const { host, statusFn } = buildMockHost();
      filter.catch('just a string thrown', host as never);
      expect(statusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('does not leak internal error message to clients in production', () => {
      // Override environment before creating the filter
      process.env['NODE_ENV'] = 'production';
      const prodFilter = new HttpExceptionFilter();
      const { host, jsonFn } = buildMockHost();
      prodFilter.catch(new Error('internal DB password is abc123'), host as never);
      const body = captureResponse(jsonFn);
      expect(body.error.message).not.toContain('abc123');
      expect(body.error.message).toBe('An unexpected error occurred');
      // Restore
      process.env['NODE_ENV'] = 'test';
    });
  });

  // ──────────────────────────────────────
  // requestId injection
  // ──────────────────────────────────────

  describe('requestId field', () => {
    it('includes requestId key (value may be undefined when no rTracer context)', () => {
      const { host, jsonFn } = buildMockHost();
      filter.catch(new NotFoundException('test'), host as never);
      const body = captureResponse(jsonFn);
      // requestId should be present as a key; its value may be undefined outside rTracer context
      expect('requestId' in body).toBe(true);
    });
  });
});
