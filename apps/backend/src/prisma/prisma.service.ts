import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { applyTenantMiddleware } from './tenant-context.middleware';

/**
 * PrismaService wraps the Prisma Client as a NestJS injectable service.
 *
 * Before first use, run the following commands:
 *   pnpm db:generate   — generates @prisma/client types from prisma/schema.prisma
 *   pnpm db:migrate    — applies the initial migration to the database
 *   pnpm db:seed       — seeds the demo tenant, branch, location, and catalog data
 *
 * After `pnpm db:generate` all model accessors (prisma.tenant, prisma.user, etc.)
 * are fully typed and available through dependency injection.
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore — PrismaClient is generated at build time by `prisma generate`
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
/* eslint-enable @typescript-eslint/ban-ts-comment */

@Injectable()
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — PrismaClient is generated at build time by `prisma generate`
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    super({
      adapter,
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — available after prisma generate
    await this.$connect();

    // Register the per-request tenant isolation middleware.
    // Must be applied after $connect() so Prisma internals are ready.
    applyTenantMiddleware(this);

    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — available after prisma generate
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
