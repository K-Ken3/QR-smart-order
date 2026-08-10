import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { SubStatus } from '../enums/sub-status.enum';

export interface SubscribePlanDto {
  plan: SubscriptionPlan;
  paymentProvider: 'stripe' | 'flutterwave';
  paymentMethodId: string;
}

export interface UpgradePlanDto {
  plan: SubscriptionPlan;
}

export interface SubscriptionDto {
  id: string;
  tenantId: string;
  plan: SubscriptionPlan;
  status: SubStatus;
  currentPeriodEnd: Date;
  gracePeriodEnd: Date | null;
  maxBranches: number;
  maxLocations: number;
  maxEmployees: number;
}

export interface InvoiceDto {
  id: string;
  subscriptionId: string;
  amount: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
  createdAt: Date;
}
