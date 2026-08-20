import { Body, Controller, Delete, Get, Param, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { IoTAuthService } from './iot-auth.service';

@Controller('iot-devices')
export class IoTAuthController {
  constructor(private readonly iotAuthService: IoTAuthService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Post('keys')
  @HttpCode(HttpStatus.CREATED)
  generateKey(
    @Body('branchId') branchId: string,
    @Body('name') name: string,
  ) {
    return this.iotAuthService.generateApiKey(branchId, name);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Delete('keys/:id')
  @HttpCode(HttpStatus.OK)
  revokeKey(@Param('id') id: string) {
    return this.iotAuthService.revokeApiKey(id);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('keys/:branchId')
  getKeys(@Param('branchId') branchId: string) {
    return this.iotAuthService.getApiKeys(branchId);
  }
}
