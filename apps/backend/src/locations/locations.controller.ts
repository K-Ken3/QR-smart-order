import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { CreateLocationDto, UpdateLocationDto } from './locations.dto';
import { LocationsService } from './locations.service';

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Post('branches/:branchId/locations')
  @HttpCode(HttpStatus.CREATED)
  createLocation(
    @CurrentUser() user: RequestUser,
    @Param('branchId') branchId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locationsService.createLocation(branchId, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branches/:branchId/locations')
  getLocations(@Param('branchId') branchId: string) {
    return this.locationsService.getLocations(branchId);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Patch('locations/:id')
  updateLocation(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locationsService.updateLocation(id, dto);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Delete('locations/:id')
  @HttpCode(HttpStatus.OK)
  deleteLocation(@Param('id') id: string) {
    return this.locationsService.deleteLocation(id);
  }
}
