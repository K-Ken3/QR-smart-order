import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * HealthModule
 *
 * Exposes GET /health — a public, unauthenticated endpoint that checks
 * PostgreSQL (via PrismaService) and Redis (via RedisService) connectivity.
 *
 * Both PrismaModule and RedisModule are declared @Global(), so their services
 * are available here without explicit re-import.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
