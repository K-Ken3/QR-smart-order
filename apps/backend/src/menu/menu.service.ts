import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';
import { MenuItemStatus } from '@prisma/client';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async createMenuItem(branchId: string, dto: CreateMenuItemDto) {
    const menu = await this.prisma.menu.findUnique({ where: { branchId } });
    if (!menu) {
      throw new NotFoundException('Menu not found for branch');
    }

    return this.prisma.menuItem.create({
      data: {
        branchId,
        menuId: menu.id,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        imageUrl: dto.imageUrl,
        sectionName: dto.sectionName,
        displayOrder: dto.displayOrder ?? 0,
        stockQty: dto.stockQty ?? null,
      },
    });
  }

  async getMenu(branchId: string) {
    const menu = await this.prisma.menu.findUnique({
      where: { branchId },
      include: { menuItems: true },
    });

    if (!menu) {
      throw new NotFoundException('Menu not found for branch');
    }

    return menu;
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        imageUrl: dto.imageUrl,
        status: dto.status,
        sectionName: dto.sectionName,
        displayOrder: dto.displayOrder,
        stockQty: dto.stockQty,
      },
    });
  }

  async deleteMenuItem(id: string) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    return this.prisma.menuItem.delete({ where: { id } });
  }
}
