import { Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

export interface SubscriptionPlan {
  name: string;
  maxBranches: number;
  maxLocations: number;
  maxEmployees: number;
  priceMonthly: number;
  features: string[];
}

export const PLANS: Record<string, SubscriptionPlan> = {
  STARTER: {
    name: 'STARTER',
    maxBranches: 1,
    maxLocations: 10,
    maxEmployees: 5,
    priceMonthly: 0,
    features: ['1 Branch', '10 Locations', '5 Employees', 'Basic Analytics', 'Email Support'],
  },
  PROFESSIONAL: {
    name: 'PROFESSIONAL',
    maxBranches: 10,
    maxLocations: 100,
    maxEmployees: 50,
    priceMonthly: 15,
    features: ['10 Branches', '100 Locations', '50 Employees', 'Advanced Analytics', 'Priority Support', 'Custom Branding'],
  },
  ENTERPRISE: {
    name: 'ENTERPRISE',
    maxBranches: 100,
    maxLocations: 1000,
    maxEmployees: 500,
    priceMonthly: 199,
    features: ['100 Branches', '1000 Locations', '500 Employees', 'Full Analytics', 'Dedicated Support', 'Custom Branding', 'API Access', 'SSO'],
  },
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  getPlans(): SubscriptionPlan[] {
    return Object.values(PLANS);
  }

  async subscribe(tenantId: string, planName: string) {
    const plan = PLANS[planName];
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    const existing = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (existing && existing.status === 'ACTIVE') {
      throw new UnprocessableEntityException('Tenant already has an active subscription');
    }

    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan: planName as any,
        status: 'ACTIVE',
        maxBranches: plan.maxBranches,
        maxLocations: plan.maxLocations,
        maxEmployees: plan.maxEmployees,
        currentPeriodEnd,
      },
      update: {
        plan: planName as any,
        status: 'ACTIVE',
        maxBranches: plan.maxBranches,
        maxLocations: plan.maxLocations,
        maxEmployees: plan.maxEmployees,
        currentPeriodEnd,
      },
    });
  }

  async upgrade(tenantId: string, newPlanName: string) {
    const newPlan = PLANS[newPlanName];
    if (!newPlan) {
      throw new NotFoundException('Plan not found');
    }

    const current = await this.prisma.subscription.findUnique({ where: { tenantId } });
    if (!current) {
      throw new NotFoundException('No subscription found');
    }

    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    return this.prisma.subscription.update({
      where: { tenantId },
      data: {
        plan: newPlanName as any,
        maxBranches: newPlan.maxBranches,
        maxLocations: newPlan.maxLocations,
        maxEmployees: newPlan.maxEmployees,
        currentPeriodEnd,
      },
    });
  }

  async getSubscription(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { invoices: true },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription found');
    }
    return subscription;
  }

  async getInvoices(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { subscription: { tenantId } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCheckoutSession(tenantId: string, planName: string) {
    const plan = PLANS[planName];
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    if (plan.priceMonthly === 0) {
      throw new UnprocessableEntityException('STARTER plan is free — no checkout needed');
    }

    const flwSecretKey = this.config.get<string>('FLW_SECRET_KEY');
    if (!flwSecretKey) {
      throw new UnprocessableEntityException('Flutterwave is not configured');
    }

    // @ts-ignore
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const txRef = `ssqr-${tenantId.slice(0, 8)}-${Date.now()}`;
    const amount = plan.priceMonthly;
    const currency = this.config.get<string>('FLW_CURRENCY') ?? 'RWF';

    const Flutterwave = (await import('flutterwave-node-v3')).default;
    const flw = new Flutterwave('unused', flwSecretKey);

    const response = await flw.Charge.create({
      tx_ref: txRef,
      amount: amount.toString(),
      currency,
      redirect_url: `${frontendUrl}/billing?tx_ref=${txRef}`,
      customer: {
        email: (tenant as any).email,
        name: (tenant as any).name,
      },
      customizations: {
        title: 'SmartServe QR',
        description: `Subscription — ${plan.name} ($${plan.priceMonthly}/mo)`,
      },
      meta: [{ tenantId, planName }],
    });

    if (response.status !== 'success') {
      throw new UnprocessableEntityException('Failed to create payment link');
    }

    // Store the pending transaction reference
    // @ts-ignore
    await this.prisma.subscription.upsert({
      where: { tenantId },
      create: {
        tenantId,
        plan: planName as any,
        status: 'PENDING',
        flwSubId: txRef,
        maxBranches: plan.maxBranches,
        maxLocations: plan.maxLocations,
        maxEmployees: plan.maxEmployees,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        flwSubId: txRef,
      },
    });

    return { txRef, url: response.data?.link ?? null };
  }

  async verifyAndActivate(tenantId: string, txRef: string, transactionId: string) {
    const flwSecretKey = this.config.get<string>('FLW_SECRET_KEY');
    if (!flwSecretKey) {
      throw new UnprocessableEntityException('Flutterwave is not configured');
    }

    const Flutterwave = (await import('flutterwave-node-v3')).default;
    const flw = new Flutterwave('unused', flwSecretKey);

    const response = await flw.Transaction.verify({ id: transactionId });

    if (response.data.status === 'successful') {
      // Find the pending subscription to get the plan name
      // @ts-ignore
      const subscription = await this.prisma.subscription.findUnique({ where: { tenantId } });
      const planName = subscription?.plan ?? 'PROFESSIONAL';
      const plan = PLANS[planName as string];

      if (plan) {
        const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        // @ts-ignore
        await this.prisma.subscription.update({
          where: { tenantId },
          data: {
            plan: planName as any,
            status: 'ACTIVE',
            flwSubId: txRef,
            maxBranches: plan.maxBranches,
            maxLocations: plan.maxLocations,
            maxEmployees: plan.maxEmployees,
            currentPeriodEnd,
          },
        });

        // @ts-ignore
        await this.prisma.invoice.create({
          data: {
            subscriptionId: subscription!.id,
            amount: plan.priceMonthly,
            currency: 'RWF',
            status: 'paid',
            flwTransactionId: transactionId,
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }
    }

    return { verified: response.data.status === 'successful' };
  }

  async handleWebhook(body: any) {
    // Flutterwave sends different event types
    const event = body;

    if (event.event === 'checkout.completed' || event.data?.status === 'successful') {
      const txRef = event.data?.tx_ref;
      const transactionId = event.data?.id?.toString();
      if (!txRef || !transactionId) return;

      // Extract tenantId from tx_ref format: ssqr-{tenantIdPrefix}-{timestamp}
      // We need to look up by flwSubId
      // @ts-ignore
      const subscription = await this.prisma.subscription.findFirst({
        where: { flwSubId: txRef },
      });
      if (!subscription) return;

      await this.verifyAndActivate(subscription.tenantId, txRef, transactionId);
    }
  }
}
