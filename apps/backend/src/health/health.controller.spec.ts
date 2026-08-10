import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

// Mock @prisma/client so tests run without a generated Prisma client
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({})),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal mock for PrismaService: only exposes $queryRaw */
function makePrismaService(shouldSucceed: boolean) {
  return {
    $queryRaw: shouldSucceed
      ? jest.fn().mockResolvedValue([{ '?column?': 1 }])
      : jest.fn().mockRejectedValue(new Error('DB connection refused')),
  };
}

/** Minimal mock for RedisService: only exposes getClient().ping() */
function makeRedisService(shouldSucceed: boolean) {
  return {
    getClient: jest.fn().mockReturnValue({
      ping: shouldSucceed
        ? jest.fn().mockResolvedValue('PONG')
        : jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('HealthController', () => {
  async function createController(
    dbOk: boolean,
    redisOk: boolean,
  ): Promise<HealthController> {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: makePrismaService(dbOk) },
        { provide: RedisService, useValue: makeRedisService(redisOk) },
      ],
    }).compile();

    return module.get<HealthController>(HealthController);
  }

  // ── 1. Happy path ──────────────────────────────────────────────────────────
  describe('when DB and Redis are healthy', () => {
    it('returns HTTP 200 with status "ok"', async () => {
      const controller = await createController(true, true);
      const result = await controller.check();

      expect(result.status).toBe('ok');
      expect(result.checks.db.status).toBe('up');
      expect(result.checks.redis.status).toBe('up');
      expect(typeof result.uptime).toBe('number');
      expect(result.timestamp).toBeDefined();
    });

    it('includes non-negative responseTimeMs for each check', async () => {
      const controller = await createController(true, true);
      const result = await controller.check();

      expect(result.checks.db.responseTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.checks.redis.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── 2. DB failure ──────────────────────────────────────────────────────────
  describe('when DB is down', () => {
    it('throws HttpException with status 503 and db.status "down"', async () => {
      const controller = await createController(false, true);

      await expect(controller.check()).rejects.toBeInstanceOf(HttpException);

      try {
        await controller.check();
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const body = httpErr.getResponse() as {
          status: string;
          checks: { db: { status: string }; redis: { status: string } };
        };
        expect(body.status).toBe('error');
        expect(body.checks.db.status).toBe('down');
        expect(body.checks.redis.status).toBe('up');
      }
    });
  });

  // ── 3. Redis failure ───────────────────────────────────────────────────────
  describe('when Redis is down', () => {
    it('throws HttpException with status 503 and redis.status "down"', async () => {
      const controller = await createController(true, false);

      try {
        await controller.check();
        fail('Expected an exception to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const body = httpErr.getResponse() as {
          status: string;
          checks: { db: { status: string }; redis: { status: string } };
        };
        expect(body.status).toBe('error');
        expect(body.checks.db.status).toBe('up');
        expect(body.checks.redis.status).toBe('down');
      }
    });
  });

  // ── 4. Both fail ───────────────────────────────────────────────────────────
  describe('when both DB and Redis are down', () => {
    it('throws HttpException with status 503 and both checks "down"', async () => {
      const controller = await createController(false, false);

      try {
        await controller.check();
        fail('Expected an exception to be thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        const httpErr = err as HttpException;
        expect(httpErr.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const body = httpErr.getResponse() as {
          status: string;
          checks: { db: { status: string }; redis: { status: string } };
        };
        expect(body.status).toBe('error');
        expect(body.checks.db.status).toBe('down');
        expect(body.checks.redis.status).toBe('down');
      }
    });

    it('includes error messages in the failed checks', async () => {
      const controller = await createController(false, false);

      try {
        await controller.check();
      } catch (err) {
        const httpErr = err as HttpException;
        const body = httpErr.getResponse() as {
          checks: {
            db: { status: string; error?: string };
            redis: { status: string; error?: string };
          };
        };
        expect(body.checks.db.error).toBeTruthy();
        expect(body.checks.redis.error).toBeTruthy();
      }
    });
  });
});
