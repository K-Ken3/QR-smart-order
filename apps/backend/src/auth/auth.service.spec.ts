/**
 * auth.service.spec.ts
 *
 * Unit tests for AuthService. PrismaService and RedisService are fully mocked
 * so these tests run without a real database or Redis connection, and without
 * requiring `prisma generate` to have been run.
 */

// Mock the PrismaService module before any imports so Jest replaces the
// @prisma/client import chain entirely.
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

// ─────────────────────────────────────────────────────────────
// Shared test data
// ─────────────────────────────────────────────────────────────

const mockTenantId = 'tenant-001';
const mockUserId = 'user-001';

function makeMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: mockUserId,
    tenantId: mockTenantId,
    email: 'owner@example.com',
    passwordHash: null as string | null,
    role: 'BUSINESS_OWNER',
    firstName: '',
    lastName: '',
    failedLogins: 0,
    lockedUntil: null as Date | null,
    isActive: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Mock dependencies
// ─────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  tenant: {
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

const mockRedis = {
  setex: jest.fn(),
  del: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
} as unknown as JwtService;

const mockConfig = {
  get: jest.fn((key: string) => {
    const values: Record<string, unknown> = {
      JWT_SECRET: 'test-secret-key-at-least-32-chars!!',
      FRONTEND_URL: 'http://localhost:3000',
      // SMTP intentionally unset → graceful degradation
      SMTP_HOST: undefined,
      SMTP_USER: undefined,
      SMTP_PASS: undefined,
    };
    return values[key];
  }),
};

// ─────────────────────────────────────────────────────────────
// Helper: build service with mocked dependencies
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
// Test suite
// ─────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = buildService();
  });

  // ────────────────────────────────────────────
  // register()
  // ────────────────────────────────────────────

  describe('register()', () => {
    const dto: RegisterDto = {
      businessName: 'Awesome Restaurant',
      email: 'owner@example.com',
      password: 'SecurePass1',
    };

    it('creates tenant + user and resolves with a success message', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.tenant.create.mockResolvedValueOnce({
        id: mockTenantId,
        name: 'Awesome Restaurant',
        email: 'owner@example.com',
        employees: [{ id: mockUserId }],
      });

      const sendSpy = jest
        .spyOn(service, 'sendVerificationEmail')
        .mockResolvedValue(undefined);

      const result = await service.register(dto);

      expect(result).toEqual({ message: 'Verification email sent' });
      expect(mockPrisma.tenant.create).toHaveBeenCalledTimes(1);

      // Let the fire-and-forget Promise settle
      await new Promise(r => setTimeout(r, 20));
      expect(sendSpy).toHaveBeenCalledWith(
        'owner@example.com',
        'mock-jwt-token',
      );
    });

    it('throws ConflictException when the email is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        makeMockUser({ email: 'owner@example.com' }),
      );

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
      expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────
  // login()
  // ────────────────────────────────────────────

  describe('login()', () => {
    const dto: LoginDto = {
      email: 'owner@example.com',
      password: 'SecurePass1',
    };
    const ip = '127.0.0.1';

    it('returns accessToken, refreshToken, and user snapshot on valid credentials', async () => {
      const hash = await bcrypt.hash('SecurePass1', 10);
      mockPrisma.user.findUnique.mockResolvedValueOnce(makeMockUser({ passwordHash: hash }));
      mockPrisma.user.update.mockResolvedValueOnce({});
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});
      mockRedis.setex.mockResolvedValueOnce('OK');

      const result = await service.login(dto, ip);

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.user).toMatchObject({
        email: 'owner@example.com',
        role: 'BUSINESS_OWNER',
      });
    });

    it('throws UnauthorizedException when the user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(service.login(dto, ip)).rejects.toThrow(UnauthorizedException);
    });

    it('increments failedLogins and throws on an incorrect password', async () => {
      const hash = await bcrypt.hash('CorrectPassword1', 10);
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        makeMockUser({ passwordHash: hash, failedLogins: 0 }),
      );
      mockPrisma.user.update.mockResolvedValueOnce({});

      await expect(service.login(dto, ip)).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ failedLogins: 1 }),
        }),
      );
    });

    it('sets lockedUntil after 5 consecutive failed logins', async () => {
      const hash = await bcrypt.hash('CorrectPassword1', 10);
      // 4 prior failures → this attempt is the 5th
      mockPrisma.user.findUnique.mockResolvedValueOnce(
        makeMockUser({ passwordHash: hash, failedLogins: 4 }),
      );
      mockPrisma.user.update.mockResolvedValueOnce({});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, 'sendLockoutEmail').mockResolvedValue(undefined as never);

      await expect(service.login(dto, ip)).rejects.toThrow(UnauthorizedException);

      const updateArgs = mockPrisma.user.update.mock.calls[0] as Array<{
        data: Record<string, unknown>;
      }>;
      expect(updateArgs[0].data).toHaveProperty('lockedUntil');
      expect(updateArgs[0].data.lockedUntil).toBeInstanceOf(Date);
    });

    it('throws UnauthorizedException with a lockout message when the account is locked', async () => {
      const lockedUser = makeMockUser({
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      });
      mockPrisma.user.findUnique.mockResolvedValueOnce(lockedUser);

      let caught: UnauthorizedException | null = null;
      try {
        await service.login(dto, ip);
      } catch (e) {
        caught = e as UnauthorizedException;
      }

      expect(caught).toBeInstanceOf(UnauthorizedException);
      expect(caught?.message).toContain('locked');
    });
  });

  // ────────────────────────────────────────────
  // logout()
  // ────────────────────────────────────────────

  describe('logout()', () => {
    it('revokes the refresh token in DB and removes it from Redis', async () => {
      const record = {
        id: 'rt-id-001',
        userId: mockUserId,
        token: 'raw-refresh-token',
        revokedAt: null,
      };
      mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(record);
      mockPrisma.refreshToken.update.mockResolvedValueOnce({
        ...record,
        revokedAt: new Date(),
      });
      mockRedis.del.mockResolvedValueOnce(1);

      await service.logout(mockUserId, 'raw-refresh-token');

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-id-001' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`rt:${mockUserId}:rt-id-001`);
    });

    it('is idempotent when the token record is not found', async () => {
      mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.logout(mockUserId, 'non-existent-token'),
      ).resolves.toBeUndefined();

      expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});
