/**
 * auth-verify.service.spec.ts
 *
 * Unit tests for AuthService.verifyEmail()
 * Validates: Requirements 1, acceptance criteria 1.2
 *
 * Covers:
 *  - Valid token → activates tenant, upserts STARTER subscription, returns success message
 *  - Expired / invalid JWT → throws UnauthorizedException
 *  - Wrong `purpose` claim → throws UnauthorizedException
 *  - Already verified (double-verification) → returns idempotent message without throwing
 */

// Mock PrismaService before any imports
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

// ─────────────────────────────────────────────────────────────
// Shared test data
// ─────────────────────────────────────────────────────────────

const mockTenantId = 'tenant-abc';
const mockUserId = 'user-xyz';

const validPayload = {
  sub: mockUserId,
  tenantId: mockTenantId,
  purpose: 'email-verify',
};

// ─────────────────────────────────────────────────────────────
// Mock dependencies
// ─────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  subscription: {
    upsert: jest.fn(),
  },
};

const mockRedis = {
  setex: jest.fn(),
  del: jest.fn(),
};

// JwtService is replaced per-test via mockJwtService.verify
const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
} as unknown as JwtService;

const mockConfig = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      JWT_SECRET: 'test-secret-key-at-least-32-chars!!',
      FRONTEND_URL: 'http://localhost:3000',
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    };
    return values[key];
  }),
};

// ─────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────

function buildService(): AuthService {
  return new AuthService(
    mockPrisma as never,
    mockRedis as never,
    mockJwtService,
    mockConfig as never,
  );
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('AuthService.verifyEmail()', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  // ────────────────────────────────────────────
  // 1. Valid token — happy path
  // ────────────────────────────────────────────

  describe('valid token', () => {
    it('activates the tenant, upserts a STARTER subscription, and returns success message', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValueOnce(validPayload);

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: mockUserId,
        tenantId: mockTenantId,
      });
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: mockTenantId,
        emailVerified: false,
        isActive: false,
      });
      mockPrisma.tenant.update.mockResolvedValueOnce({
        id: mockTenantId,
        isActive: true,
        emailVerified: true,
      });
      mockPrisma.subscription.upsert.mockResolvedValueOnce({
        tenantId: mockTenantId,
        plan: 'STARTER',
        status: 'ACTIVE',
      });

      const result = await service.verifyEmail('valid.jwt.token');

      expect(result).toEqual({
        message: 'Email verified successfully. Your account is now active.',
      });

      // Tenant should be activated
      expect(mockPrisma.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockTenantId },
          data: expect.objectContaining({ isActive: true, emailVerified: true }),
        }),
      );

      // STARTER subscription should be upserted
      expect(mockPrisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: mockTenantId },
          create: expect.objectContaining({
            tenantId: mockTenantId,
            plan: 'STARTER',
            status: 'ACTIVE',
            maxBranches: 1,
            maxLocations: 10,
            maxEmployees: 5,
            currentPeriodEnd: expect.any(Date),
          }),
        }),
      );

      // currentPeriodEnd should be ~30 days from now (within a 5-second window)
      const upsertCall = (mockPrisma.subscription.upsert as jest.Mock).mock.calls[0][0] as {
        create: { currentPeriodEnd: Date };
      };
      const diffMs = upsertCall.create.currentPeriodEnd.getTime() - Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(diffMs).toBeGreaterThan(thirtyDaysMs - 5000);
      expect(diffMs).toBeLessThan(thirtyDaysMs + 5000);
    });
  });

  // ────────────────────────────────────────────
  // 2. Expired / invalid JWT
  // ────────────────────────────────────────────

  describe('expired or invalid JWT', () => {
    it('throws UnauthorizedException when jwtService.verify throws a TokenExpiredError', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      (mockJwtService.verify as jest.Mock).mockImplementationOnce(() => {
        throw expiredError;
      });

      await expect(service.verifyEmail('expired.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Prisma should never be touched
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when jwtService.verify throws a JsonWebTokenError', async () => {
      const invalidError = new Error('invalid signature');
      invalidError.name = 'JsonWebTokenError';
      (mockJwtService.verify as jest.Mock).mockImplementationOnce(() => {
        throw invalidError;
      });

      await expect(service.verifyEmail('tampered.jwt.token')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired verification link'),
      );
    });

    it('throws UnauthorizedException when the token is a completely malformed string', async () => {
      (mockJwtService.verify as jest.Mock).mockImplementationOnce(() => {
        throw new Error('malformed token');
      });

      await expect(service.verifyEmail('not-a-jwt-at-all')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ────────────────────────────────────────────
  // 3. Wrong `purpose` claim
  // ────────────────────────────────────────────

  describe('wrong purpose claim', () => {
    it('throws UnauthorizedException when purpose is not "email-verify"', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValueOnce({
        sub: mockUserId,
        tenantId: mockTenantId,
        purpose: 'password-reset', // wrong purpose
      });

      await expect(service.verifyEmail('wrong-purpose.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when purpose is missing', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValueOnce({
        sub: mockUserId,
        tenantId: mockTenantId,
        // purpose is absent
      });

      await expect(service.verifyEmail('no-purpose.jwt.token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ────────────────────────────────────────────
  // 4. Already verified (double-verification) — idempotent
  // ────────────────────────────────────────────

  describe('double-verification (already verified)', () => {
    it('returns idempotent message without updating tenant or upserting subscription', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValueOnce(validPayload);

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: mockUserId,
        tenantId: mockTenantId,
      });
      // Tenant is already verified
      mockPrisma.tenant.findUnique.mockResolvedValueOnce({
        id: mockTenantId,
        emailVerified: true,
        isActive: true,
      });

      const result = await service.verifyEmail('valid.jwt.token');

      expect(result).toEqual({ message: 'Email already verified' });

      // No mutation should happen
      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
      expect(mockPrisma.subscription.upsert).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────
  // 5. User not found
  // ────────────────────────────────────────────

  describe('user not found', () => {
    it('throws NotFoundException when the user referenced in the token does not exist', async () => {
      (mockJwtService.verify as jest.Mock).mockReturnValueOnce(validPayload);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.verifyEmail('valid.jwt.token')).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.tenant.update).not.toHaveBeenCalled();
    });
  });
});
