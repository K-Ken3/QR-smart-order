import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { QrService } from './qr.service';
import { GenerateQrDto, QrValidateDto } from './qr.dto';

@Controller()
export class QrController {
  constructor(private readonly qrService: QrService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Post('locations/:id/qr/generate')
  @HttpCode(HttpStatus.CREATED)
  async generateQr(
    @Param('id') locationId: string,
    @Body() dto: GenerateQrDto,
  ) {
    return this.qrService.generateQr(locationId, dto.validityPeriod);
  }

  @Public()
  @Post('qr/validate')
  @HttpCode(HttpStatus.OK)
  async validateQr(@Body() dto: QrValidateDto) {
    const context = await this.qrService.resolveQrContext(dto.token);
    return {
      valid: true,
      location: {
        id: context.location.id,
        name: context.location.name,
        locationType: context.location.locationType,
        branchId: context.location.branchId,
      },
      serviceCatalog: context.serviceCatalog.map(service => ({
        id: service.id,
        name: service.name,
        category: service.category,
        displayOrder: service.displayOrder,
        isActive: service.isActive,
      })),
    };
  }

  @Public()
  @Get('qr/scan/:token/menu')
  @HttpCode(HttpStatus.OK)
  async getScanMenu(@Param('token') token: string) {
    return this.qrService.getMenuByToken(token);
  }
}
