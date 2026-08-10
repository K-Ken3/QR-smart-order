import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../common/decorators/public.decorator';

/** Per-check sub-deadline (ms). Must be < 200 ms overall budget. */
const CHECK_TIMEOUT_MS = 150;

interface CheckResult {
  status: 'up' | 'down';
  responseTimeMs: number;
  error?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    db: CheckResult;
    redis: CheckResult;
  };
  uptime: number;
  timestamp: string;
}

/**
 * Races `promise` against a timeout. Rejects with an error if the timeout
 * fires first. This enforces the 150 ms sub-deadline for each connectivity
 * check.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

/**
 * HealthController
 *
 * GET /health — public endpoint (no auth guards).
 *
 * Returns HTTP 200 with `status: "ok"` when all checks pass.
 * Returns HTTP 503 with `status: "error"` when any check fails.
 *
 * Response shape:
 * ```json
 * {
 *   "status": "ok",
 *   "checks": {
 *     "db":    { "status": "up",   "responseTimeMs": 12 },
 *     "redis": { "status": "up",   "responseTimeMs": 4  }
 *   },
 *   "uptime": 3600,
 *   "timestamp": "2024-01-01T00:00:00.000Z"
 * }
 * ```
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const [dbResult, redisResult] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const allUp = dbResult.status === 'up' && redisResult.status === 'up';
    const overallStatus: HealthResponse['status'] = allUp ? 'ok' : 'error';

    const response: HealthResponse = {
      status: overallStatus,
      checks: {
        db: dbResult,
        redis: redisResult,
      },
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };

    if (!allUp) {
      // Throw an HttpException that carries the raw health payload so the
      // consumer always gets the same structured shape regardless of HTTP status.
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return response;
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private async checkDb(): Promise<CheckResult> {
    const start = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — $queryRaw is available after `prisma generate`
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, CHECK_TIMEOUT_MS);
      return { status: 'up', responseTimeMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        responseTimeMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async checkRedis(): Promise<CheckResult> {
    const start = Date.now();
    try {
      await withTimeout(
        this.redis.getClient().ping(),
        CHECK_TIMEOUT_MS,
      );
      return { status: 'up', responseTimeMs: Date.now() - start };
    } catch (err) {
      return {
        status: 'down',
        responseTimeMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
