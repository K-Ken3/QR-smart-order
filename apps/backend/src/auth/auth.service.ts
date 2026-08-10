import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
const REFRESH_TOKEN_TTL_DAYS = 30;
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
const ACCESS_TOKEN_EXPIRY = '15m';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    // @ts-ignore — PrismaClient is generated at build time
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────
  // Register
  // ─────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Unique email check
    // @ts-ignore
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    

    // 2. Hash password
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // 3. Create Tenant + User in a transaction
    // @ts-ignore
    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.businessName,
        email: normalizedEmail,
        isActive: false,
        emailVerified: false,
        employees: {
            create: {
              email: normalizedEmail,
              passwordHash,
              // Use string literal — enum is generated at runtime by prisma generate
              role: 'BUSINESS_OWNER',
              firstName: '',
              lastName: '',
            },
          },
      },
      include: {
        employees: true,
      },
    });

    const user = (tenant as any).employees[0];

    // 4. Build and send verification email (fire-and-forget — never blocks registration)
    const verificationToken = this.jwtService.sign(
      { sub: user.id, tenantId: tenant.id, purpose: 'email-verify' },
      { secret: this.config.get<string>('JWT_SECRET'), expiresIn: '24h' },
    );

    this.sendVerificationEmail(normalizedEmail, verificationToken).catch(
      (err: unknown) =>
        this.logger.warn(
          `Verification email failed (non-fatal): ${(err as Error).message}`,
        ),
    );

    return { message: 'Verification email sent' };
  }

  // ─────────────────────────────────────────────
  // Login
  // ─────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ip: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      role: string;
      firstName: string;
      lastName: string;
    };
  }> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Find user
    // @ts-ignore
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Check lockout
    if (
      user.lockedUntil &&
      new Date(user.lockedUntil as Date) > new Date()
    ) {
      throw new UnauthorizedException(
        'Account is temporarily locked due to too many failed login attempts. Please try again later.',
      );
    }

    // 3. Verify password
    const passwordValid =
      user.passwordHash
        ? await bcrypt.compare(dto.password, user.passwordHash as string)
        : false;

    if (!passwordValid) {
      await this.handleFailedLogin(user as { id: string; failedLogins: number; email: string }, ip);
      throw new UnauthorizedException('Invalid credentials');
    }

    // 4. Reset failed login counter on success
    // @ts-ignore
    await this.prisma.user.update({
      where: { id: user.id as string },
      data: { failedLogins: 0, lockedUntil: null },
    });

    // 5. Issue tokens
    const tokenId = crypto.randomUUID();
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    );

    // 6. Store hash in Redis  key: rt:{userId}:{tokenId}
    const redisKey = `rt:${user.id as string}:${tokenId}`;
    await this.redis.setex(redisKey, REFRESH_TOKEN_TTL_SECONDS, refreshTokenHash);

    // 7. Persist RefreshToken record in DB (store the raw token for rotation lookup)
    // @ts-ignore
    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id as string,
        token: refreshToken,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id as string,
        email: user.email as string,
        role: user.role as string,
        firstName: user.firstName as string,
        lastName: user.lastName as string,
      },
    };
  }

  // ─────────────────────────────────────────────
  // Logout
  // ─────────────────────────────────────────────

  async logout(userId: string, refreshToken: string): Promise<void> {
    // 1. Find the refresh token record
    // @ts-ignore
    const record = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        token: refreshToken,
        revokedAt: null,
      },
    });

    if (!record) {
      // Token already revoked or not found — treat as success (idempotent)
      return;
    }

    // 2. Revoke in DB
    // @ts-ignore
    await this.prisma.refreshToken.update({
      where: { id: record.id as string },
      data: { revokedAt: new Date() },
    });

    // 3. Remove from Redis
    const redisKey = `rt:${userId}:${record.id as string}`;
    await this.redis.del(redisKey);
  }

  // ─────────────────────────────────────────────
  // Refresh Tokens
  // ─────────────────────────────────────────────

  /**
   * Convenience method used by the controller: looks up the userId from the
   * raw token and delegates to refreshTokens().
   */
  async refreshTokensByRawToken(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // @ts-ignore
    const record = await this.prisma.refreshToken.findFirst({
      where: { token: rawRefreshToken },
      select: { userId: true },
    });

    if (!record) {
      throw new UnauthorizedException('Refresh token not found');
    }

    return this.refreshTokens(record.userId as string, rawRefreshToken);
  }

  async refreshTokens(
    userId: string,
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // 1. Find the token record
    // @ts-ignore
    const record = await this.prisma.refreshToken.findFirst({
      where: { userId, token: rawRefreshToken },
    });

    if (!record) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // 2. Check revocation
    if (record.revokedAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // 3. Check expiry
    if (new Date(record.expiresAt as Date) < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // 4. Fetch the user for payload
    // @ts-ignore
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 5. Issue new tokens
    const newTokenId = crypto.randomUUID();
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    const newRefreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    // 6. Revoke the old token in DB
    // @ts-ignore
    await this.prisma.refreshToken.update({
      where: { id: record.id as string },
      data: { revokedAt: new Date() },
    });

    // 7. Remove old token from Redis
    const oldRedisKey = `rt:${userId}:${record.id as string}`;
    await this.redis.del(oldRedisKey);

    // 8. Store new token in Redis
    const newRedisKey = `rt:${userId}:${newTokenId}`;
    await this.redis.setex(newRedisKey, REFRESH_TOKEN_TTL_SECONDS, newRefreshToken);

    // 9. Persist new token in DB
    // @ts-ignore
    await this.prisma.refreshToken.create({
      data: {
        id: newTokenId,
        userId,
        token: newRefreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ─────────────────────────────────────────────
  // Google OAuth — find or create user
  // ─────────────────────────────────────────────

  async findOrCreateGoogleUser(profile: {
    googleId: string;
    email: string;
    firstName: string;
    lastName: string;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const normalizedEmail = profile.email.toLowerCase().trim();

    // 1. Try to find by googleId
    // @ts-ignore
    let user = await this.prisma.user.findFirst({
      where: { googleId: profile.googleId },
    });

    if (!user) {
      // 2. Try to find by email and link googleId
      // @ts-ignore
      user = await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

        if (user) {
        // Link the Google identity
        // @ts-ignore
        user = await this.prisma.user.update({
          where: { id: user.id as string },
            data: ({ googleId: profile.googleId, isActive: true, emailVerified: true } as any),
        });
      } else {
        // 3. Create a new Tenant + BUSINESS_OWNER user
        // @ts-ignore
        const tenant = await this.prisma.tenant.create({
          data: {
            name: `${profile.firstName} ${profile.lastName}`.trim() || normalizedEmail,
            email: normalizedEmail,
            isActive: true,
            emailVerified: true,
            employees: {
              create: ({
                email: normalizedEmail,
                googleId: profile.googleId,
                role: 'BUSINESS_OWNER',
                firstName: profile.firstName,
                  lastName: profile.lastName,
                  emailVerified: true,
                  isActive: true,
              } as any),
            },
          },
          include: { employees: true },
        });
        user = (tenant as any).employees[0];
      }
    }

    // Ensure user exists before issuing tokens
    if (!user) {
      throw new UnauthorizedException('Failed to create or locate user');
    }

    // 4. Issue tokens using the same logic as login()
    const tokenId = crypto.randomUUID();
    const accessToken = this.jwtService.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    );

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    const redisKey = `rt:${user.id as string}:${tokenId}`;
    await this.redis.setex(redisKey, REFRESH_TOKEN_TTL_SECONDS, refreshToken);

    // @ts-ignore
    await this.prisma.refreshToken.create({
      data: {
        id: tokenId,
        userId: user.id as string,
        token: refreshToken,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  // ─────────────────────────────────────────────
  // Change Password
  // ─────────────────────────────────────────────

  async changePassword(userId: string, newPassword: string): Promise<void> {
    // 1. Hash new password
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // 2. Update user record
    // @ts-ignore
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 3. Revoke ALL active refresh tokens in DB
    // @ts-ignore
    const activeTokens = await this.prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
    });

    if ((activeTokens as Array<{ id: string }>).length > 0) {
      // @ts-ignore
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 4. Delete all rt:{userId}:* keys from Redis
      const redisClient = this.redis.getClient();
      const keys = await redisClient.keys(`rt:${userId}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
  }

  // ─────────────────────────────────────────────
  // Verify Email
  // ─────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    // 1. Validate the JWT — any error means the link is invalid or expired
    let payload: { sub: string; tenantId: string; purpose: string };
    try {
      payload = this.jwtService.verify<{
        sub: string;
        tenantId: string;
        purpose: string;
      }>(token, { secret: this.config.get<string>('JWT_SECRET') });
    } catch {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    // 2. Check the token purpose
    if (payload.purpose !== 'email-verify') {
      throw new UnauthorizedException('Invalid or expired verification link');
    }

    // 3. Find the user
    // @ts-ignore
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 4. Find the tenant
    // @ts-ignore
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: payload.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // 5. Idempotent — already verified
    if ((tenant as { emailVerified: boolean }).emailVerified) {
      return { message: 'Email already verified' };
    }

    // 6. Activate the tenant
    // @ts-ignore
    await this.prisma.tenant.update({
      where: { id: payload.tenantId },
      data: { isActive: true, emailVerified: true },
    });

    // 7. Provision default STARTER subscription (upsert for idempotency)
    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    // @ts-ignore
    await this.prisma.subscription.upsert({
      where: { tenantId: payload.tenantId },
      create: {
        tenantId: payload.tenantId,
        plan: 'STARTER',
        status: 'ACTIVE',
        maxBranches: 1,
        maxLocations: 10,
        maxEmployees: 5,
        currentPeriodEnd,
      },
      update: {},
    });

    return { message: 'Email verified successfully. Your account is now active.' };
  }

  // ─────────────────────────────────────────────
  // Send Verification Email
  // ─────────────────────────────────────────────

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<number>('SMTP_PORT') ?? 587;
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';

    // Graceful degradation: skip sending if SMTP is not configured
    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn(
        'SMTP not configured — skipping verification email (dev mode)',
      );
      return;
    }

    const verificationUrl = `${frontendUrl}/auth/verify?token=${token}`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"SmartServe QR" <${smtpUser}>`,
      to: email,
      subject: 'Verify your SmartServe QR account',
      html: `
        <h2>Welcome to SmartServe QR!</h2>
        <p>Click the link below to verify your email address. This link expires in 24 hours.</p>
        <p><a href="${verificationUrl}" style="padding:12px 24px;background:#4F46E5;color:#fff;text-decoration:none;border-radius:6px;">
          Verify Email
        </a></p>
        <p>Or copy this URL into your browser:<br>${verificationUrl}</p>
      `,
    });

    this.logger.log(`Verification email sent to ${email}`);
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private async handleFailedLogin(
    user: { id: string; failedLogins: number; email: string },
    _ip: string,
  ): Promise<void> {
    const newCount = (user.failedLogins ?? 0) + 1;
    const shouldLock = newCount >= MAX_FAILED_LOGINS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : null;

    // @ts-ignore
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLogins: newCount,
        ...(lockedUntil !== null ? { lockedUntil } : {}),
      },
    });

    if (shouldLock) {
      this.logger.warn(
        `Account ${user.email} locked for ${LOCKOUT_MINUTES} min after ${newCount} failed login attempts`,
      );
      // Send lockout notification email (fire-and-forget)
      this.sendLockoutEmail(user.email).catch((err: unknown) =>
        this.logger.warn(
          `Lockout email failed (non-fatal): ${(err as Error).message}`,
        ),
      );
    }
  }

  private async sendLockoutEmail(email: string): Promise<void> {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const smtpPort = this.config.get<number>('SMTP_PORT') ?? 587;

    if (!smtpHost || !smtpUser || !smtpPass) {
      return; // Silent in dev
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: `"SmartServe QR" <${smtpUser}>`,
      to: email,
      subject: 'Your SmartServe QR account has been temporarily locked',
      html: `
        <h2>Account Locked</h2>
        <p>Your account has been temporarily locked for ${LOCKOUT_MINUTES} minutes 
        due to ${MAX_FAILED_LOGINS} consecutive failed login attempts.</p>
        <p>If this wasn't you, please reset your password immediately.</p>
      `,
    });
  }
}
