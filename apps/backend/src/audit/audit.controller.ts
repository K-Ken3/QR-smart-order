import { Body, Controller, Get, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Roles('SUPER_ADMIN', 'BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get()
  getLogs(
    @Query('tenantId') tenantId?: string,
    @Query('branchId') branchId?: string,
    @Query('actorId') actorId?: string,
    @Query('actionType') actionType?: string,
    @Query('entityType') entityType?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.getLogs({
      tenantId,
      branchId,
      actorId,
      actionType,
      entityType,
      fromDate,
      toDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Roles('SUPER_ADMIN', 'BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('export')
  async exportCsv(
    @Res() res: Response,
    @Query('tenantId') tenantId?: string,
    @Query('branchId') branchId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('entityType') entityType?: string,
  ) {
    const csv = await this.auditService.exportCsv({
      tenantId,
      branchId,
      fromDate,
      toDate,
      entityType,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  }
}
