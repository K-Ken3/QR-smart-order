export interface CreateBranchDto {
    name: string;
    address: string;
    timezone: string;
    currency?: string;
    language?: string;
}
export interface UpdateBranchDto {
    name?: string;
    address?: string;
    timezone?: string;
    currency?: string;
    language?: string;
    isActive?: boolean;
    escalationThresholdMinutes?: number;
}
export interface BranchDto {
    id: string;
    tenantId: string;
    name: string;
    address: string;
    timezone: string;
    currency: string;
    language: string;
    isActive: boolean;
    escalationThresholdMinutes: number;
    createdAt: Date;
}
//# sourceMappingURL=branch.dto.d.ts.map