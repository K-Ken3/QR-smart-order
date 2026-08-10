import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCatalogDto } from './catalog.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getCatalog(branchId: string, locationType: string) {
    const catalog = await this.prisma.serviceCatalog.findUnique({
      where: {
        branchId_locationType: {
          branchId,
          locationType: locationType as any,
        },
      },
      include: { services: true },
    });

    if (!catalog) {
      throw new NotFoundException('Catalog not found');
    }

    return catalog;
  }

  async updateCatalog(branchId: string, locationType: string, dto: UpdateCatalogDto) {
    const catalog = await this.prisma.serviceCatalog.findUnique({
      where: {
        branchId_locationType: {
          branchId,
          locationType: locationType as any,
        },
      },
      include: { services: true },
    });

    if (!catalog) {
      throw new NotFoundException('Catalog not found for location type');
    }

    if (dto.isPublished && dto.services.filter(service => service.isActive).length === 0) {
      throw new UnprocessableEntityException('Published catalog must contain at least one active service');
    }

    await this.prisma.service.deleteMany({ where: { catalogId: catalog.id } });

    const services = dto.services.map(service => ({
      catalogId: catalog.id,
      name: service.name,
      category: service.category,
      displayOrder: service.displayOrder,
      isActive: service.isActive,
    }));

    await this.prisma.service.createMany({ data: services });

    return this.prisma.serviceCatalog.update({
      where: { id: catalog.id },
      data: { isPublished: dto.isPublished ?? catalog.isPublished },
      include: { services: true },
    });
  }
}
