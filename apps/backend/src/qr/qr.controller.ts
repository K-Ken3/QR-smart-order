import {
  Body,
  Controller,
  Param,
  Post,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
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
}
