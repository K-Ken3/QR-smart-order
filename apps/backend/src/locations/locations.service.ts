import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto, UpdateLocationDto } from './locations.dto';
import { LocationStatus } from '@prisma/client';
import { QrService } from '../qr/qr.service';
import { QrValidity } from '@smartserve/types';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qrService: QrService,
  ) {}

  async createLocation(branchId: string, dto: CreateLocationDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const defaultCatalog = await this.prisma.serviceCatalog.findUnique({
      where: {
        branchId_locationType: {
          branchId,
          locationType: dto.locationType,
        },
      },
    });

    if (!defaultCatalog) {
      throw new NotFoundException('Default service catalog not found for this location type');
    }

    const location = await this.prisma.location.create({
      data: {
        branchId,
        name: dto.name,
        locationType: dto.locationType,
        floor: dto.floor,
        zone: dto.zone,
      },
    });

    if (dto.locationType === 'DINING_TABLE') {
      try {
        await this.qrService.generateQr(location.id, QrValidity.NON_EXPIRING);
      } catch {
        // QR generation is best-effort; location creation still succeeds
      }
    }

    return this.prisma.location.findUnique({
      where: { id: location.id },
      include: { qrCodes: true },
    });
  }

  async getLocations(branchId: string) {
    return this.prisma.location.findMany({
      where: { branchId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLocation(id: string, dto: UpdateLocationDto) {
    const existing = await this.prisma.location.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Location not found');
    }

    const data: { [key: string]: unknown } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.locationType !== undefined) data.locationType = dto.locationType;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.zone !== undefined) data.zone = dto.zone;
    if (dto.status !== undefined) {
      if (!Object.values(LocationStatus).includes(dto.status as LocationStatus)) {
        throw new UnprocessableEntityException('Invalid location status');
      }
      data.status = dto.status;
    }

    return this.prisma.location.update({
      where: { id },
      data,
    });
  }

  async deleteLocation(id: string) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const openRequests = await this.prisma.request.count({
      where: {
        locationId: id,
        status: {
          in: ['PENDING', 'IN_PROGRESS'],
        },
      },
    });

    if (openRequests > 0) {
      throw new UnprocessableEntityException(
        'Cannot delete location with pending or in-progress requests',
      );
    }

    return this.prisma.location.delete({ where: { id } });
  }
}
