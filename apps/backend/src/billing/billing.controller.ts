import { Body, Controller, Get, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService, private readonly config: ConfigService) {}

  @Public()
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @Roles('BUSINESS_OWNER')
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  subscribe(
    @CurrentUser() user: RequestUser,
    @Body('plan') plan: string,
  ) {
    return this.billingService.subscribe(user.tenantId, plan);
  }

  @Roles('BUSINESS_OWNER')
  @Post('upgrade')
  upgrade(
    @CurrentUser() user: RequestUser,
    @Body('plan') plan: string,
  ) {
    return this.billingService.upgrade(user.tenantId, plan);
  }

  @Roles('BUSINESS_OWNER')
  @Get('subscription')
  getSubscription(@CurrentUser() user: RequestUser) {
    return this.billingService.getSubscription(user.tenantId);
  }

  @Roles('BUSINESS_OWNER')
  @Get('invoices')
  getInvoices(@CurrentUser() user: RequestUser) {
    return this.billingService.getInvoices(user.tenantId);
  }

  @Roles('BUSINESS_OWNER')
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  createCheckoutSession(
    @CurrentUser() user: RequestUser,
    @Body('plan') plan: string,
  ) {
    return this.billingService.createCheckoutSession(user.tenantId, plan);
  }

  @Public()
  @Post('webhooks/flutterwave')
  @HttpCode(HttpStatus.OK)
  async handleFlutterwaveWebhook(@Body() body: any) {
    const flwHash = this.config.get<string>('FLW_WEBHOOK_HASH');
    if (flwHash && body?.hash && body.hash !== flwHash) {
      return { received: false, error: 'Invalid hash' };
    }

    await this.billingService.handleWebhook(body);
    return { received: true };
  }

  @Roles('BUSINESS_OWNER')
  @Get('verify')
  verifyPayment(
    @CurrentUser() user: RequestUser,
    @Query('tx_ref') txRef: string,
    @Query('transaction_id') transactionId: string,
  ) {
    return this.billingService.verifyAndActivate(user.tenantId, txRef, transactionId);
  }
}
