import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /**
   * GET /tenants/me
   * Accessible by BUSINESS_OWNER and BRANCH_MANAGER.
   * Returns the tenant profile for the caller's tenant.
   */
  @Get('me')
  @Roles('BUSINESS_OWNER', 'BRANCH_MANAGER')
  getMyTenant(@CurrentUser() user: RequestUser) {
    return this.tenantsService.getMyTenant(user.tenantId);
  }

  /**
   * PATCH /tenants/me
   * Accessible by BUSINESS_OWNER only.
   * Updates mutable profile fields and triggers a real-time refresh event.
   */
  @Patch('me')
  @Roles('BUSINESS_OWNER')
  async updateMyTenant(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateTenantDto,
  ) {
    const updatedTenant = await this.tenantsService.updateMyTenant(user.tenantId, dto);
    return { success: true, data: updatedTenant };
  }

  /**
   * GET /tenants
   * Accessible by SUPER_ADMIN only.
   * Returns all tenants with subscription and branch count.
   */
  @Get()
  @Roles('SUPER_ADMIN')
  getAllTenants() {
    return this.tenantsService.getAllTenants();
  }

  /**
   * PATCH /tenants/:id/suspend
   * Accessible by SUPER_ADMIN only.
   * Suspends the given tenant — deactivates all branches, QR codes, and sets subscription to SUSPENDED.
   */
  @Patch(':id/suspend')
  @Roles('SUPER_ADMIN')
  suspendTenant(@Param('id') id: string) {
    return this.tenantsService.suspendTenant(id);
  }
}
