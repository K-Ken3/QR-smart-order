import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBranchAnalytics(branchId: string, fromDate?: string, toDate?: string) {
    const dateFilter: Record<string, unknown> = {};
    if (fromDate) dateFilter.gte = new Date(fromDate);
    if (toDate) dateFilter.lte = new Date(toDate);

    const where: Record<string, unknown> = { branchId };
    if (fromDate || toDate) {
      where.createdAt = dateFilter;
    }

    const [
      totalRequests,
      requestsByStatus,
      requestsByServiceType,
      averageCompletionTime,
      busiestLocations,
      topMenuItems,
    ] = await Promise.all([
      this.prisma.request.count({ where }),
      this.prisma.request.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.request.groupBy({
        by: ['serviceType'],
        where,
        _count: true,
      }),
      this.prisma.request.findMany({
        where: {
          ...where,
          status: 'COMPLETED',
          startedAt: { not: null },
          completedAt: { not: null },
        },
        select: { startedAt: true, completedAt: true },
      }),
      this.prisma.request.groupBy({
        by: ['locationId'],
        where,
        _count: true,
        orderBy: { _count: { locationId: 'desc' } },
        take: 5,
      }),
      this.prisma.requestItem.groupBy({
        by: ['menuItemId'],
        _count: true,
        _sum: { quantity: true },
        orderBy: { _count: { menuItemId: 'desc' } },
        take: 10,
      }),
    ]);

    const locationNames = await this.prisma.location.findMany({
      where: { branchId },
      select: { id: true, name: true },
    });
    const locationMap = new Map(locationNames.map((l) => [l.id, l.name]));

    // Compute average completion time from the raw records
    const durations = averageCompletionTime
      .filter((r) => r.startedAt && r.completedAt)
      .map((r) => (r.completedAt!.getTime() - r.startedAt!.getTime()) / 1000 / 60);
    const averageCompletionMinutes =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    return {
      totalRequests,
      averageCompletionMinutes: Math.round(averageCompletionMinutes * 100) / 100,
      requestsByStatus: requestsByStatus.map((r) => ({
        status: r.status,
        count: r._count,
      })),
      requestsByServiceType: requestsByServiceType.map((r) => ({
        serviceType: r.serviceType,
        count: r._count,
      })),
      busiestLocations: busiestLocations.map((l) => ({
        locationId: l.locationId,
        locationName: locationMap.get(l.locationId) ?? l.locationId,
        count: l._count,
      })),
      topMenuItems: topMenuItems.map((item) => ({
        menuItemId: item.menuItemId,
        orderCount: item._count,
        totalQuantity: item._sum.quantity,
      })),
    };
  }

  async getTenantAnalytics(tenantId: string, fromDate?: string, toDate?: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });

    const branchAnalytics = await Promise.all(
      branches.map(async (branch) => ({
        branchId: branch.id,
        branchName: branch.name,
        ...(await this.getBranchAnalytics(branch.id, fromDate, toDate)),
      })),
    );

    const totalRequests = branchAnalytics.reduce((sum, b) => sum + b.totalRequests, 0);

    return {
      totalRequests,
      branches: branchAnalytics,
    };
  }

  async exportBranchCsv(branchId: string, fromDate?: string, toDate?: string) {
    const where: Record<string, unknown> = { branchId };
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate && { gte: new Date(fromDate) }),
        ...(toDate && { lte: new Date(toDate) }),
      };
    }

    const requests = await this.prisma.request.findMany({
      where,
      include: {
        location: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    const header = 'ID,Location,Service Type,Status,Source,Assigned To,Created At,Completed At\n';
    const rows = requests.map((r) =>
      [
        r.id,
        r.location.name,
        r.serviceType,
        r.status,
        r.sourceType,
        r.assignedTo ? `${r.assignedTo.firstName} ${r.assignedTo.lastName}` : '',
        r.createdAt.toISOString(),
        r.completedAt?.toISOString() ?? '',
      ].join(','),
    ).join('\n');

    return header + rows;
  }

  async getEmployeePerformance(branchId: string, fromDate?: string, toDate?: string) {
    const where: Record<string, unknown> = { branchId };
    if (fromDate || toDate) {
      where.createdAt = {
        ...(fromDate && { gte: new Date(fromDate) }),
        ...(toDate && { lte: new Date(toDate) }),
      };
    }

    const employees = await this.prisma.user.findMany({
      where: { branchId, role: { notIn: ['SUPER_ADMIN', 'BUSINESS_OWNER', 'GUEST'] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        isClockedIn: true,
      },
    });

    const performance = await Promise.all(
      employees.map(async (emp) => {
        const completedTasks = await this.prisma.request.count({
          where: { ...where, assignedToId: emp.id, status: 'COMPLETED' },
        });
        const totalAssigned = await this.prisma.request.count({
          where: { ...where, assignedToId: emp.id },
        });
        return {
          employeeId: emp.id,
          firstName: emp.firstName,
          lastName: emp.lastName,
          role: emp.role,
          isClockedIn: emp.isClockedIn,
          completedTasks,
          totalAssigned,
        };
      }),
    );

    return performance;
  }
}
