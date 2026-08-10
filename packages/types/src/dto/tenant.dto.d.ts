import { SubscriptionPlan } from '../enums/subscription-plan.enum';
import { SubStatus } from '../enums/sub-status.enum';
export interface TenantProfileDto {
    id: string;
    name: string;
    email: string;
    logoUrl: string | null;
    isActive: boolean;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface UpdateTenantDto {
    name?: string;
    logoUrl?: string;
}
export interface TenantSubscriptionDto {
    plan: SubscriptionPlan;
    status: SubStatus;
    maxBranches: number;
    maxLocations: number;
    maxEmployees: number;
    currentPeriodEnd: Date;
}
//# sourceMappingURL=tenant.dto.d.ts.map