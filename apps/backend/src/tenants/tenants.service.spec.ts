/**
 * tenants.service.spec.ts
 *
 * Unit tests for TenantsService. PrismaService and RedisService are fully mocked
 * so these tests run without a real database or Redis connection.
 */

// Mock the PrismaService module before any imports.
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

// ─────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────

const mockTenantId = 'tenant-001';

function makeMockTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: mockTenantId,
    name: 'Demo Restaurant',
    logoUrl: null,
    contactEmail: 'owner@demo.com',
    contactPhone: '+1234567890',
    isActive: true,
    emailVerified: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Mock PrismaService
// ─────────────────────────────────────────────────────────────

const mockPrisma = {
  tenant: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  branch: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  qrCode: {
    updateMany: jest.fn(),
  },
  subscription: {
    upsert: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─────────────────────────────────────────────────────────────
// Mock RedisService
// ─────────────────────────────────────────────────────────────

const mockRedis = {
  publish: jest.fn(),
};

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function buildService(): TenantsService {
  return new TenantsService(
    mockPrisma as never,
    mockRedis as never,
  );
}

// ─────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────

describe('TenantsService', () => {
  let service: TenantsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  // ────────────────────────────────────────────
  // getMyTenant()
  // ────────────────────────────────────────────

  describe('getMyTenant()', () => {
    it('returns the tenant when found', async () => {
      const tenant = makeMockTenant();
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(tenant);

      const result = await service.getMyTenant(mockTenantId);

      expect(result).toEqual(tenant);
      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: mockTenantId },
      });
    });

    it('throws NotFoundException when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValueOnce(null);

      await expect(service.getMyTenant('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ────────────────────────────────────────────
  // updateMyTenant()
  // ────────────────────────────────────────────

  describe('updateMyTenant()', () => {
    it('calls prisma.tenant.update and publishes a Redis event', async () => {
      const dto: UpdateTenantDto = { name: 'Updated Restaurant' };
      const updatedTenant = makeMockTenant({ name: 'Updated Restaurant' });

      mockPrisma.tenant.update.mockResolvedValueOnce(updatedTenant);
      mockRedis.publish.mockResolvedValueOnce(1);

      const result = await service.updateMyTenant(mockTenantId, dto);

      expect(result).toEqual(updatedTenant);

      // Verify Prisma update was called correctly
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith({
        where: { id: mockTenantId },
        data: { name: 'Updated Restaurant' },
      });

      // Verify Redis publish was called with the correct channel and event shape
      expect(mockRedis.publish).toHaveBeenCalledWith(
        `tenant:${mockTenantId}`,
        expect.objectContaining({
          event: 'tenant:profile_updated',
          tenantId: mockTenantId,
          updatedAt: expect.any(String),
        }),
      );
    });
  });

  // ────────────────────────────────────────────
  // getAllTenants()
  // ────────────────────────────────────────────

  describe('getAllTenants()', () => {
    it('returns an array of tenants with subscription and branch count', async () => {
      const tenants = [
        {
          ...makeMockTenant(),
          subscription: { plan: 'STARTER', status: 'ACTIVE' },
          _count: { branches: 2 },
        },
        {
          ...makeMockTenant({ id: 'tenant-002', name: 'Another Cafe' }),
          subscription: { plan: 'PROFESSIONAL', status: 'ACTIVE' },
          _count: { branches: 5 },
        },
      ];
      mockPrisma.tenant.findMany.mockResolvedValueOnce(tenants);

      const result = await service.getAllTenants();

      expect(result).toEqual(tenants);
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        include: {
          subscription: true,
          _count: { select: { branches: true } },
        },
      });
    });
  });

  // ────────────────────────────────────────────
  // suspendTenant()
  // ────────────────────────────────────────────

  describe('suspendTenant()', () => {
    it('runs $transaction and deactivates branches, QR codes, and subscription', async () => {
      // Capture the transaction callback and run it against the mock tx object
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const mockTx = {
            branch: {
              findMany: jest.fn().mockResolvedValueOnce([
                { id: 'branch-001' },
                { id: 'branch-002' },
              ]),
              updateMany: jest.fn().mockResolvedValueOnce({ count: 2 }),
            },
            qrCode: {
              updateMany: jest.fn().mockResolvedValueOnce({ count: 3 }),
            },
            subscription: {
              upsert: jest.fn().mockResolvedValueOnce({ status: 'SUSPENDED' }),
            },
          };
          await callback(mockTx as never);
          return mockTx;
        },
      );

      const result = await service.suspendTenant(mockTenantId);

      expect(result).toEqual({ message: 'Tenant suspended' });
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Extract the tx mock that was created inside the callback
      const txMock = await mockPrisma.$transaction.mock.results[0].value;

      // (a) Branches were fetched
      expect(txMock.branch.findMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        select: { id: true },
      });

      // (b) Branches were deactivated
      expect(txMock.branch.updateMany).toHaveBeenCalledWith({
        where: { tenantId: mockTenantId },
        data: { isActive: false },
      });

      // (c) QR codes for those branches were deactivated
      expect(txMock.qrCode.updateMany).toHaveBeenCalledWith({
        where: { branchId: { in: ['branch-001', 'branch-002'] } },
        data: { isActive: false },
      });

      // (d) Subscription was upserted as SUSPENDED
      expect(txMock.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: mockTenantId },
          update: { status: 'SUSPENDED' },
        }),
      );
    });

    it('skips QR code deactivation when tenant has no branches', async () => {
      mockPrisma.$transaction.mockImplementation(
        async (callback: (tx: typeof mockPrisma) => Promise<unknown>) => {
          const mockTx = {
            branch: {
              findMany: jest.fn().mockResolvedValueOnce([]),
              updateMany: jest.fn().mockResolvedValueOnce({ count: 0 }),
            },
            qrCode: {
              updateMany: jest.fn(),
            },
            subscription: {
              upsert: jest.fn().mockResolvedValueOnce({ status: 'SUSPENDED' }),
            },
          };
          await callback(mockTx as never);
          return mockTx;
        },
      );

      const result = await service.suspendTenant(mockTenantId);

      expect(result).toEqual({ message: 'Tenant suspended' });

      const txMock = await mockPrisma.$transaction.mock.results[0].value;
      // QR code updateMany should NOT be called when there are no branches
      expect(txMock.qrCode.updateMany).not.toHaveBeenCalled();
    });
  });
});
