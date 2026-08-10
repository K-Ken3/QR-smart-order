import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBranchDto, UpdateBranchDto } from './branches.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  async createBranch(tenantId: string, dto: CreateBranchDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found for tenant');
    }

    const currentCount = await this.prisma.branch.count({
      where: { tenantId, isActive: true },
    });

    if (currentCount >= subscription.maxBranches) {
      throw new UnprocessableEntityException(
        'Branch quota exceeded for current subscription plan',
      );
    }

    return this.prisma.branch.create({
      data: {
        tenantId,
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone ?? 'UTC',
        currency: dto.currency ?? 'USD',
        language: dto.language ?? 'en',
        escalationThresholdMinutes: dto.escalationThresholdMinutes ?? 5,
      },
    });
  }

  async getBranches(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateBranch(id: string, dto: UpdateBranchDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone,
        currency: dto.currency,
        language: dto.language,
        escalationThresholdMinutes: dto.escalationThresholdMinutes,
      },
    });
  }

  async deactivateBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    await this.prisma.qrCode.updateMany({
      where: { location: { branchId: id }, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
