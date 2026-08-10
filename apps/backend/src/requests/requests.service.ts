import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateRequestDto, AssignRequestDto, UpdateRequestStatusDto, AddRequestNoteDto } from './requests.dto';
import { RequestStatus } from '@prisma/client';

const DEDUP_TTL_SECONDS = 60;

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async createRequest(dto: CreateRequestDto) {
    const existingRequestKey = `req:dedup:${dto.location_id}:${dto.service_type}`;
    const existingRequest = await this.redis.get<{ requestId: string }>(existingRequestKey);
    if (existingRequest) {
      throw new ConflictException({
        message: 'Duplicate request submission',
        requestId: existingRequest.requestId,
      });
    }

    const location = await this.prisma.location.findUnique({ where: { id: dto.location_id } });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: location.branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const request = await this.prisma.request.create({
      data: {
        tenantId: branch.tenantId,
        branchId: branch.id,
        locationId: location.id,
        sourceType: dto.source_type,
        serviceType: dto.service_type,
        payload: dto.payload as any,
        metadata: dto.metadata as any ?? null,
        notes: null,
      },
    });

    await this.redis.setex(existingRequestKey, DEDUP_TTL_SECONDS, { requestId: request.id });

    return request;
  }

  async assignRequest(id: string, dto: AssignRequestDto) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Only pending requests can be assigned');
    }

    const employee = await this.prisma.user.findUnique({ where: { id: dto.employeeId } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    if (!employee.branchId || employee.branchId !== request.branchId) {
      throw new UnprocessableEntityException('Employee does not belong to request branch');
    }

    return this.prisma.request.update({
      where: { id },
      data: {
        status: 'ASSIGNED',
        assignedToId: dto.employeeId,
        assignedAt: new Date(),
      },
    });
  }

  async updateRequestStatus(id: string, dto: UpdateRequestStatusDto) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    if (dto.status === 'IN_PROGRESS') {
      if (request.status !== 'ASSIGNED') {
        throw new UnprocessableEntityException('Only assigned requests may transition to IN_PROGRESS');
      }
      return this.prisma.request.update({
        where: { id },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    if (dto.status === 'COMPLETED') {
      if (request.status !== 'IN_PROGRESS') {
        throw new UnprocessableEntityException('Only in-progress requests may transition to COMPLETED');
      }
      return this.prisma.request.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
    }

    throw new UnprocessableEntityException('Unsupported request status transition');
  }

  async cancelRequest(id: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Only pending requests may be cancelled');
    }

    return this.prisma.request.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });
  }

  async addRequestNote(id: string, dto: AddRequestNoteDto) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    return this.prisma.request.update({
      where: { id },
      data: { notes: dto.note },
    });
  }
}
