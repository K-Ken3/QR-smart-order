import { Body, Controller, Delete, Get, Param, Patch, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';
import { MenuService } from './menu.service';

@Controller()
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Post('branches/:branchId/menu/items')
  @HttpCode(HttpStatus.CREATED)
  createMenuItem(
    @Param('branchId') branchId: string,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.menuService.createMenuItem(branchId, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branches/:branchId/menu')
  getMenu(@Param('branchId') branchId: string) {
    return this.menuService.getMenu(branchId);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Patch('menu/items/:id')
  updateMenuItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.menuService.updateMenuItem(id, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Delete('menu/items/:id')
  @HttpCode(HttpStatus.OK)
  deleteMenuItem(@Param('id') id: string) {
    return this.menuService.deleteMenuItem(id);
  }
}
