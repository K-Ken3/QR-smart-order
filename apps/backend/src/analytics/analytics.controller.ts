import { Controller, Get, Param, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branches/:branchId')
  getBranchAnalytics(
    @Param('branchId') branchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getBranchAnalytics(branchId, from, to);
  }

  @Roles('BUSINESS_OWNER')
  @Get('tenants/me')
  getTenantAnalytics(
    @CurrentUser() user: RequestUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getTenantAnalytics(user.tenantId, from, to);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branches/:branchId/employees')
  getEmployeePerformance(
    @Param('branchId') branchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getEmployeePerformance(branchId, from, to);
  }

  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  @Get('branches/:branchId/export')
  async exportCsv(
    @Res() res: Response,
    @Param('branchId') branchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const csv = await this.analyticsService.exportBranchCsv(branchId, from, to);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=analytics-${branchId}.csv`);
    res.send(csv);
  }
}
