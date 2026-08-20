import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateRequestDto, AssignRequestDto, UpdateRequestStatusDto, AddRequestNoteDto } from './requests.dto';

const DEDUP_TTL_SECONDS = 60;

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

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
      include: {
        location: { select: { name: true } },
      },
    });

    await this.redis.setex(existingRequestKey, DEDUP_TTL_SECONDS, { requestId: request.id });

    await this.publishEvent('request:created', {
      requestId: request.id,
      locationName: request.location.name,
      serviceType: request.serviceType,
      status: request.status,
      createdAt: request.createdAt,
      branchId: branch.id,
      tenantId: branch.tenantId,
    });

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
    if (!employee.isActive) {
      throw new UnprocessableEntityException('Cannot assign to an inactive employee');
    }
    if (!employee.isClockedIn) {
      throw new UnprocessableEntityException('Cannot assign to an employee who is not clocked in');
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        status: 'ASSIGNED',
        assignedToId: dto.employeeId,
        assignedAt: new Date(),
      },
      include: {
        location: { select: { name: true } },
      },
    });

    await this.publishEvent('request:assigned', {
      requestId: updated.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeId: employee.id,
      status: updated.status,
      branchId: request.branchId,
      tenantId: request.tenantId,
    });

    return updated;
  }

  async updateRequestStatus(id: string, dto: UpdateRequestStatusDto) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }

    const allowed = VALID_TRANSITIONS[request.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new UnprocessableEntityException(
        `Cannot transition from ${request.status} to ${dto.status}`,
      );
    }

    const updateData: Record<string, unknown> = { status: dto.status };

    if (dto.status === 'IN_PROGRESS') {
      updateData.startedAt = new Date();
    } else if (dto.status === 'COMPLETED') {
      updateData.completedAt = new Date();
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: updateData,
    });

    await this.publishEvent('request:status_changed', {
      requestId: updated.id,
      oldStatus: request.status,
      newStatus: dto.status,
      timestamp: new Date().toISOString(),
      branchId: request.branchId,
      tenantId: request.tenantId,
      locationId: request.locationId,
    });

    return updated;
  }

  async cancelRequest(id: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    if (request.status !== 'PENDING') {
      throw new UnprocessableEntityException('Only pending requests may be cancelled');
    }

    const updated = await this.prisma.request.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await this.publishEvent('request:cancelled', {
      requestId: updated.id,
      cancelledAt: updated.cancelledAt,
      branchId: request.branchId,
      tenantId: request.tenantId,
      locationId: request.locationId,
    });

    return updated;
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

  async getRequests(filters: {
    branchId?: string;
    status?: string;
    serviceType?: string;
    locationId?: string;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.branchId) where.branchId = filters.branchId;
    if (filters.status) where.status = filters.status;
    if (filters.serviceType) where.serviceType = filters.serviceType;
    if (filters.locationId) where.locationId = filters.locationId;

    return this.prisma.request.findMany({
      where,
      include: {
        location: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequestById(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        location: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        items: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request;
  }

  private async publishEvent(event: string, data: Record<string, unknown>) {
    try {
      await this.redis.publish(`events:${event}`, { event, ...data });
    } catch (err) {
      this.logger.warn(`Failed to publish event ${event}: ${(err as Error).message}`);
    }
  }
}
