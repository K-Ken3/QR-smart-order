import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import { UpdateCatalogDto } from './catalog.dto';

@Controller('branches/:branchId/catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get(':locationType')
  getCatalog(
    @Param('branchId') branchId: string,
    @Param('locationType') locationType: string,
  ) {
    return this.catalogService.getCatalog(branchId, locationType);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Patch(':locationType')
  updateCatalog(
    @Param('branchId') branchId: string,
    @Param('locationType') locationType: string,
    @Body() dto: UpdateCatalogDto,
  ) {
    return this.catalogService.updateCatalog(branchId, locationType, dto);
  }
}
