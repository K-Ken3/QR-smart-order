import { RateLimitMiddleware } from './rate-limit.middleware';
import { Request, Response } from 'express';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function buildMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    socket: { remoteAddress: '192.168.1.1' },
    ...overrides,
  } as unknown as Request;
}

function buildMockRes() {
  const headers: Record<string, string> = {};
  const jsonFn = jest.fn();
  const statusFn = jest.fn().mockReturnValue({ json: jsonFn });

  const res = {
    setHeader: jest.fn().mockImplementation((k: string, v: string) => {
      headers[k] = v;
    }),
    status: statusFn,
    json: jsonFn,
    _headers: headers,
  };
  return res as unknown as Response & { _headers: Record<string, string>; json: jest.Mock; status: jest.Mock };
}

function makeReq(ip = '10.0.0.1', authToken?: string): Request {
  const headers: Record<string, string> = {};
  if (authToken) headers['authorization'] = `Bearer ${authToken}`;
  return buildMockReq({ headers, socket: { remoteAddress: ip } as never });
}

async function fireRequests(
  middleware: RateLimitMiddleware,
  req: Request,
  count: number,
): Promise<{ passed: number; blocked: number }> {
  let passed = 0;
  let blocked = 0;

  for (let i = 0; i < count; i++) {
    let didBlock = false;
    const res = buildMockRes();
    const next = jest.fn();

    middleware.use(req, res as unknown as Response, next);

    if ((res.status as jest.Mock).mock.calls.length > 0) {
      didBlock = true;
    }

    if (didBlock) blocked++;
    else passed++;
  }

  return { passed, blocked };
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

describe('RateLimitMiddleware', () => {
  let middleware: RateLimitMiddleware;

  beforeEach(() => {
    middleware = new RateLimitMiddleware();
    middleware.clearStore();
  });

  afterEach(() => {
    middleware.clearStore();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────
  // Unauthenticated: 30 req/min per IP
  // ──────────────────────────────────────

  describe('unauthenticated rate limiting (30 req/min per IP)', () => {
    it('allows up to 30 requests from the same IP', async () => {
      const req = makeReq('1.2.3.4');
      const { passed, blocked } = await fireRequests(middleware, req, 30);
      expect(passed).toBe(30);
      expect(blocked).toBe(0);
    });

    it('blocks the 31st request from the same IP', async () => {
      const req = makeReq('1.2.3.4');
      await fireRequests(middleware, req, 30);

      const res = buildMockRes();
      const next = jest.fn();
      middleware.use(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns the correct 429 error envelope on block', async () => {
      const req = makeReq('1.2.3.5');
      await fireRequests(middleware, req, 30);

      const res = buildMockRes();
      const next = jest.fn();
      middleware.use(req, res as unknown as Response, next);

      expect(res.json).toHaveBeenCalledTimes(1);
      const body = (res.json as jest.Mock).mock.calls[0][0] as {
        success: boolean;
        error: { code: string; message: string };
      };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('TOO_MANY_REQUESTS');
      expect(typeof body.error.message).toBe('string');
    });

    it('sets the Retry-After header when blocking', async () => {
      const req = makeReq('1.2.3.6');
      await fireRequests(middleware, req, 30);

      const res = buildMockRes();
      middleware.use(req, res as unknown as Response, jest.fn());

      const setHeaderCalls = (res.setHeader as jest.Mock).mock.calls;
      const retryAfterCall = setHeaderCalls.find(([k]: string[]) => k === 'Retry-After');
      expect(retryAfterCall).toBeDefined();
      const retryAfterValue = Number(retryAfterCall![1]);
      expect(retryAfterValue).toBeGreaterThan(0);
      expect(retryAfterValue).toBeLessThanOrEqual(60);
    });

    it('tracks different IPs independently', async () => {
      const req1 = makeReq('10.0.0.1');
      const req2 = makeReq('10.0.0.2');

      await fireRequests(middleware, req1, 30);

      // IP2 should still be allowed
      const res = buildMockRes();
      const next = jest.fn();
      middleware.use(req2, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(429);
    });
  });

  // ──────────────────────────────────────
  // Authenticated: 120 req/min per token
  // ──────────────────────────────────────

  describe('authenticated rate limiting (120 req/min per user)', () => {
    const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test_user_token';

    it('allows up to 120 requests with a valid Bearer token', async () => {
      const req = makeReq('5.5.5.5', TOKEN);
      const { passed, blocked } = await fireRequests(middleware, req, 120);
      expect(passed).toBe(120);
      expect(blocked).toBe(0);
    });

    it('blocks the 121st authenticated request', async () => {
      const req = makeReq('5.5.5.5', TOKEN);
      await fireRequests(middleware, req, 120);

      const res = buildMockRes();
      const next = jest.fn();
      middleware.use(req, res as unknown as Response, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────
  // Separate tracking: auth vs unauth
  // ──────────────────────────────────────

  describe('separate tracking for authenticated and unauthenticated', () => {
    it('authenticated and unauthenticated limits are counted independently', async () => {
      const ip = '7.7.7.7';
      const TOKEN_B = 'some_valid_token_abc';

      const unauthReq = makeReq(ip);
      const authReq = makeReq(ip, TOKEN_B);

      // Exhaust unauthenticated limit from the same IP
      await fireRequests(middleware, unauthReq, 30);

      // Authenticated requests from the same IP should NOT be blocked yet
      const res = buildMockRes();
      const next = jest.fn();
      middleware.use(authReq, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(429);
    });

    it('different tokens are tracked independently', async () => {
      const TOKEN1 = 'token_user_one_abcde';
      const TOKEN2 = 'token_user_two_fghij';

      const req1 = makeReq('8.8.8.8', TOKEN1);
      const req2 = makeReq('8.8.8.8', TOKEN2);

      await fireRequests(middleware, req1, 120);

      // Token 2 should still pass
      const res = buildMockRes();
      const next = jest.fn();
      middleware.use(req2, res as unknown as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────
  // Pass-through: sets rate-limit headers
  // ──────────────────────────────────────

  describe('response headers on allowed requests', () => {
    it('sets X-RateLimit-Limit and X-RateLimit-Remaining headers', () => {
      const req = makeReq('9.9.9.9');
      const res = buildMockRes();
      const next = jest.fn();

      middleware.use(req, res as unknown as Response, next);

      const calls = (res.setHeader as jest.Mock).mock.calls as [string, string][];
      const limitHeader = calls.find(([k]) => k === 'X-RateLimit-Limit');
      const remainingHeader = calls.find(([k]) => k === 'X-RateLimit-Remaining');

      expect(limitHeader).toBeDefined();
      expect(remainingHeader).toBeDefined();
      expect(Number(limitHeader![1])).toBe(30);
      expect(Number(remainingHeader![1])).toBe(29);
    });
  });

  // ──────────────────────────────────────
  // X-Forwarded-For support
  // ──────────────────────────────────────

  describe('X-Forwarded-For header support', () => {
    it('uses the first IP in X-Forwarded-For when present', async () => {
      const req = buildMockReq({
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
        socket: { remoteAddress: '10.0.0.1' } as never,
      });

      await fireRequests(middleware, req, 30);

      const res = buildMockRes();
      middleware.use(req, res as unknown as Response, jest.fn());
      expect(res.status).toHaveBeenCalledWith(429);
    });
  });
});
