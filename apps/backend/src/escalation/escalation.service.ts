import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Cron('*/30 * * * * *')
  async checkEscalations() {
    try {
      const branches = await this.prisma.branch.findMany({
        where: { isActive: true },
        select: {
          id: true,
          tenantId: true,
          escalationThresholdMinutes: true,
        },
      });

      for (const branch of branches) {
        const threshold = branch.escalationThresholdMinutes;
        const cutoff = new Date(Date.now() - threshold * 60 * 1000);

        const pendingRequests = await this.prisma.request.findMany({
          where: {
            branchId: branch.id,
            status: 'PENDING',
            createdAt: { lt: cutoff },
          },
          include: {
            location: { select: { name: true } },
          },
        });

        for (const request of pendingRequests) {
          const elapsedMs = Date.now() - request.createdAt.getTime();
          const elapsedMinutes = Math.floor(elapsedMs / 60000);

          await this.redis.publish('events:notification:escalation', {
            event: 'notification:escalation',
            requestId: request.id,
            elapsedMinutes,
            locationName: request.location.name,
            branchId: branch.id,
            tenantId: branch.tenantId,
          });
        }
      }
    } catch (err) {
      this.logger.error(`Escalation check failed: ${(err as Error).message}`);
    }
  }
}
