import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class IoTAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new ForbiddenException('IoT API key required');
    }

    const cachedBranchId = await this.redis.get<string>(`iot:key:${apiKey}`);
    if (cachedBranchId) {
      request.iotBranchId = cachedBranchId;
      return true;
    }

    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const record = await (this.prisma as any).iotDeviceKey.findFirst({
      where: { keyHash, isActive: true },
    });

    if (!record) {
      throw new ForbiddenException('Invalid IoT API key');
    }

    await this.redis.setex(`iot:key:${apiKey}`, 300, record.branchId);

    request.iotBranchId = record.branchId;
    return true;
  }
}
