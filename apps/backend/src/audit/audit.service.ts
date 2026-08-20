import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface AuditLogEntry {
  tenantId?: string;
  branchId?: string;
  actorId?: string;
  actorRole?: string;
  actionType: string;
  entityType: string;
  entityId: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: entry.tenantId ?? null,
          branchId: entry.branchId ?? null,
          actorId: entry.actorId ?? null,
          actorRole: (entry.actorRole as any) ?? null,
          actionType: entry.actionType,
          entityType: entry.entityType,
          entityId: entry.entityId,
          ipAddress: entry.ipAddress ?? null,
          metadata: (entry.metadata as any) ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  async getLogs(filters: {
    tenantId?: string;
    branchId?: string;
    actorId?: string;
    actionType?: string;
    entityType?: string;
    fromDate?: string;
    toDate?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {};

    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.actionType) where.actionType = filters.actionType;
    if (filters.entityType) where.entityType = filters.entityType;

    if (filters.fromDate || filters.toDate) {
      where.createdAt = {
        ...(filters.fromDate && { gte: new Date(filters.fromDate) }),
        ...(filters.toDate && { lte: new Date(filters.toDate) }),
      };
    }

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportCsv(filters: {
    tenantId?: string;
    branchId?: string;
    fromDate?: string;
    toDate?: string;
    entityType?: string;
  }): Promise<string> {
    const where: Record<string, unknown> = {};
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {
        ...(filters.fromDate && { gte: new Date(filters.fromDate) }),
        ...(filters.toDate && { lte: new Date(filters.toDate) }),
      };
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const header = 'ID,Tenant ID,Branch ID,Actor ID,Actor Role,Action Type,Entity Type,Entity ID,IP Address,Created At\n';
    const rows = logs.map((log) =>
      [
        log.id,
        log.tenantId ?? '',
        log.branchId ?? '',
        log.actorId ?? '',
        log.actorRole ?? '',
        log.actionType,
        log.entityType,
        log.entityId,
        log.ipAddress ?? '',
        log.createdAt.toISOString(),
      ].join(','),
    ).join('\n');

    return header + rows;
  }
}
