import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IoTAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async generateApiKey(branchId: string, name: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const record = await (this.prisma as any).iotDeviceKey.create({
      data: {
        branchId,
        name,
        keyHash,
        isActive: true,
      },
    });

    return {
      id: record.id,
      name,
      apiKey: rawKey,
      branchId,
      createdAt: record.createdAt,
    };
  }

  async revokeApiKey(id: string) {
    const record = await (this.prisma as any).iotDeviceKey.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('API key not found');
    }

    return (this.prisma as any).iotDeviceKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getApiKeys(branchId: string) {
    return (this.prisma as any).iotDeviceKey.findMany({
      where: { branchId },
      select: {
        id: true,
        name: true,
        branchId: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
