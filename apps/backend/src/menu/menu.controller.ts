import { Body, Controller, Delete, Get, Param, Patch, Post, HttpCode, HttpStatus, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';
import { MenuService } from './menu.service';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

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
  @Post('menu/upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: undefined, // use default memory storage
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  uploadFile(@UploadedFile() file: { originalname: string; buffer: Buffer } | undefined) {
    if (!file) {
      return { url: null };
    }
    const fs = require('fs');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const filename = `${unique}${extname(file.originalname)}`;
    const filepath = join(UPLOADS_DIR, filename);
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    fs.writeFileSync(filepath, file.buffer);
    return { url: `/uploads/${filename}` };
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
