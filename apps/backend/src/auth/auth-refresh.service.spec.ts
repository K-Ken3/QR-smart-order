/**
 * auth-refresh.service.spec.ts
 *
 * Unit tests for the new AuthService methods introduced in Task 7:
 *   - refreshTokens()
 *   - findOrCreateGoogleUser()
 *   - changePassword()
 *
 * All dependencies are mocked so no database or Redis connection is needed.
 */

// Prevent Jest from attempting to resolve the generated Prisma client
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class MockPrismaService {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

// ─────────────────────────────────────────────────────────────
// Shared fixtures
// ─────────────────────────────────────────────────────────────

const mockUserId = 'user-refresh-001';
const mockTenantId = 'tenant-refresh-001';
const mockTokenId = 'rt-id-001';

function makeMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: mockUserId,
    tenantId: mockTenantId,
    email: 'owner@example.com',
    passwordHash: null as string | null,
    role: 'BUSINESS_OWNER',
    firstName: 'Jane',
    lastName: 'Doe',
    failedLogins: 0,
    lockedUntil: null,
    isActive: true,
    googleId: null as string | null,
    ...overrides,
  };
}

function makeMockRefreshToken(overrides: Record<string, unknown> = {}) {
  return {
    id: mockTokenId,
    userId: mockUserId,
    token: 'raw-refresh-token',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    revokedAt: null as Date | null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Mock dependencies
// ─────────────────────────────────────────────────────────────

const mockRedisClient = {
  keys: jest.fn(),
  del: jest.fn(),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  tenant: {
    create: jest.fn(),
  },
  refreshToken: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockRedis = {
  setex: jest.fn(),
  del: jest.fn(),
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-access-token'),
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

function buildService(): AuthService {
  return new AuthService(
    mockPrisma as never,
    mockRedis as never,
    mockJwtService,
    mockConfig as never,
  );
}

// ─────────────────────────────────────────────────────────────
// Test suites
// ─────────────────────────────────────────────────────────────

describe('AuthService — refreshTokens()', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset getClient mock every time
    mockRedis.getClient.mockReturnValue(mockRedisClient);
    service = buildService();
  });

  it('issues new token pair and revokes old token for a valid refresh token', async () => {
    const record = makeMockRefreshToken();
    const user = makeMockUser();

    mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(record);
    mockPrisma.user.findUnique.mockResolvedValueOnce(user);
    mockPrisma.refreshToken.update.mockResolvedValueOnce({
      ...record,
      revokedAt: new Date(),
    });
    mockRedis.del.mockResolvedValueOnce(1);
    mockRedis.setex.mockResolvedValueOnce('OK');
    mockPrisma.refreshToken.create.mockResolvedValueOnce({});

    const result = await service.refreshTokens(mockUserId, 'raw-refresh-token');

    expect(result.accessToken).toBe('mock-jwt-access-token');
    expect(result.refreshToken).toBeTruthy();
    // Old token must be revoked in DB
    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: mockTokenId },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
    // Old token must be removed from Redis
    expect(mockRedis.del).toHaveBeenCalledWith(`rt:${mockUserId}:${mockTokenId}`);
    // New token stored in Redis and DB
    expect(mockRedis.setex).toHaveBeenCalledTimes(1);
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
  });

  it('throws 401 when the token has already been revoked', async () => {
    const revokedRecord = makeMockRefreshToken({ revokedAt: new Date() });
    mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(revokedRecord);

    await expect(
      service.refreshTokens(mockUserId, 'raw-refresh-token'),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
  });

  it('throws 401 when the token has expired', async () => {
    const expiredRecord = makeMockRefreshToken({
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    });
    mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(expiredRecord);

    await expect(
      service.refreshTokens(mockUserId, 'raw-refresh-token'),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPrisma.refreshToken.update).not.toHaveBeenCalled();
  });

  it('throws 401 when the token record is not found', async () => {
    mockPrisma.refreshToken.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.refreshTokens(mockUserId, 'non-existent-token'),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('AuthService — findOrCreateGoogleUser()', () => {
  let service: AuthService;

  const googleProfile = {
    googleId: 'google-123',
    email: 'google@example.com',
    firstName: 'John',
    lastName: 'Google',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.getClient.mockReturnValue(mockRedisClient);
    service = buildService();
  });

  it('creates a new Tenant + BUSINESS_OWNER user when no matching user exists', async () => {
    // findFirst by googleId → not found
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);
    // findUnique by email → not found
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    const newUser = makeMockUser({
      id: 'new-user-id',
      email: googleProfile.email,
      googleId: googleProfile.googleId,
    });
    const mockTenant = {
      id: 'new-tenant-id',
      employees: [newUser],
    };
    mockPrisma.tenant.create.mockResolvedValueOnce(mockTenant);
    mockRedis.setex.mockResolvedValueOnce('OK');
    mockPrisma.refreshToken.create.mockResolvedValueOnce({});

    const result = await service.findOrCreateGoogleUser(googleProfile);

    expect(result.accessToken).toBe('mock-jwt-access-token');
    expect(result.refreshToken).toBeTruthy();
    expect(mockPrisma.tenant.create).toHaveBeenCalledTimes(1);

    // Tenant created with correct Google fields
    const createArgs = mockPrisma.tenant.create.mock.calls[0][0] as {
      data: { employees: { create: Record<string, unknown> } };
    };
    expect(createArgs.data.employees.create).toMatchObject({
      googleId: googleProfile.googleId,
      emailVerified: true,
      isActive: true,
      role: 'BUSINESS_OWNER',
    });
  });

  it('returns tokens for an existing user found by googleId', async () => {
    const existingUser = makeMockUser({ googleId: 'google-123' });
    // findFirst by googleId → found
    mockPrisma.user.findFirst.mockResolvedValueOnce(existingUser);
    mockRedis.setex.mockResolvedValueOnce('OK');
    mockPrisma.refreshToken.create.mockResolvedValueOnce({});

    const result = await service.findOrCreateGoogleUser(googleProfile);

    expect(result.accessToken).toBe('mock-jwt-access-token');
    expect(result.refreshToken).toBeTruthy();
    // Should not attempt to create a new user
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('links googleId and returns tokens for existing user found by email', async () => {
    // findFirst by googleId → not found
    mockPrisma.user.findFirst.mockResolvedValueOnce(null);
    // findUnique by email → found (existing user without googleId)
    const existingUser = makeMockUser({ googleId: null });
    mockPrisma.user.findUnique.mockResolvedValueOnce(existingUser);
    // update to link googleId
    const updatedUser = { ...existingUser, googleId: 'google-123' };
    mockPrisma.user.update.mockResolvedValueOnce(updatedUser);
    mockRedis.setex.mockResolvedValueOnce('OK');
    mockPrisma.refreshToken.create.mockResolvedValueOnce({});

    const result = await service.findOrCreateGoogleUser(googleProfile);

    expect(result.accessToken).toBe('mock-jwt-access-token');
    expect(result.refreshToken).toBeTruthy();
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleId: 'google-123',
          emailVerified: true,
          isActive: true,
        }),
      }),
    );
    expect(mockPrisma.tenant.create).not.toHaveBeenCalled();
  });
});

describe('AuthService — changePassword()', () => {
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.getClient.mockReturnValue(mockRedisClient);
    service = buildService();
  });

  it('hashes the new password and revokes all active refresh tokens', async () => {
    mockPrisma.user.update.mockResolvedValueOnce({});

    const activeTokens = [
      makeMockRefreshToken({ id: 'rt-001' }),
      makeMockRefreshToken({ id: 'rt-002' }),
    ];
    mockPrisma.refreshToken.findMany.mockResolvedValueOnce(activeTokens);
    mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 2 });

    mockRedisClient.keys.mockResolvedValueOnce([
      `rt:${mockUserId}:rt-001`,
      `rt:${mockUserId}:rt-002`,
    ]);
    mockRedisClient.del.mockResolvedValueOnce(2);

    await service.changePassword(mockUserId, 'NewSecure1');

    // Password should be updated with a bcrypt hash
    const updateCall = mockPrisma.user.update.mock.calls[0][0] as {
      data: { passwordHash: string };
    };
    const isValidHash = await bcrypt.compare('NewSecure1', updateCall.data.passwordHash);
    expect(isValidHash).toBe(true);

    // All active tokens should be revoked in DB
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUserId, revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );

    // All Redis keys should be deleted
    expect(mockRedisClient.keys).toHaveBeenCalledWith(`rt:${mockUserId}:*`);
    expect(mockRedisClient.del).toHaveBeenCalledWith(
      `rt:${mockUserId}:rt-001`,
      `rt:${mockUserId}:rt-002`,
    );
  });

  it('updates password hash even when there are no active refresh tokens', async () => {
    mockPrisma.user.update.mockResolvedValueOnce({});
    mockPrisma.refreshToken.findMany.mockResolvedValueOnce([]);

    await expect(
      service.changePassword(mockUserId, 'NewSecure1'),
    ).resolves.toBeUndefined();

    expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(mockRedisClient.keys).not.toHaveBeenCalled();
  });
});
