import { MenuItemCategory } from '../enums/menu-item-category.enum';
import { MenuItemStatus } from '../enums/menu-item-status.enum';

export interface CreateMenuItemDto {
  name: string;
  description?: string;
  category: MenuItemCategory;
  price: number;
  imageUrl?: string;
  sectionName?: string;
  displayOrder?: number;
  stockQty?: number;
}

export interface UpdateMenuItemDto {
  name?: string;
  description?: string;
  category?: MenuItemCategory;
  price?: number;
  imageUrl?: string;
  status?: MenuItemStatus;
  sectionName?: string;
  displayOrder?: number;
  stockQty?: number;
}

export interface MenuItemDto {
  id: string;
  branchId: string;
  menuId: string;
  name: string;
  description: string | null;
  category: MenuItemCategory;
  price: number;
  imageUrl: string | null;
  status: MenuItemStatus;
  stockQty: number | null;
  displayOrder: number;
  sectionName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemDto {
  menuItemId: string;
  quantity: number;
  notes?: string;
}
