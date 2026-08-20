import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
  };
  body: {
    refreshToken?: string;
  } & Record<string, unknown>;
}

interface GoogleOAuthRequest extends Request {
  user: {
    accessToken: string;
    refreshToken: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /auth/register
   * Creates a new Tenant + Business Owner user, sends verification email.
   * SUPER_ADMIN only — public registration removed.
   */
  @Roles('SUPER_ADMIN')
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
  ): Promise<{ success: true; message: string }> {
    const result = await this.authService.register(dto);
    return { success: true, message: result.message };
  }

  /**
   * POST /auth/verify-otp
   * Verifies the 6-digit OTP code and activates the tenant account.
   */
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() body: { email: string; otpCode: string },
  ): Promise<{ success: true; message: string }> {
    const result = await this.authService.verifyOtp(body.email, body.otpCode);
    return { success: true, message: result.message };
  }

  /**
   * POST /auth/resend-otp
   * Generates a new OTP code and sends it to the registered email.
   */
  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(
    @Body('email') email: string,
  ): Promise<{ success: true; message: string }> {
    const result = await this.authService.resendOtp(email);
    return { success: true, message: result.message };
  }

  /**
   * POST /auth/login
   * Verifies credentials, issues JWT access token + refresh token.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<{
    success: true;
    data: {
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
        role: string;
        firstName: string;
        lastName: string;
      };
    };
  }> {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      '0.0.0.0';

    const result = await this.authService.login(dto, ip);
    return { success: true, data: result };
  }

  /**
   * POST /auth/logout
   * Revokes the provided refresh token. Requires a valid JWT.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async logout(
    @Req() req: AuthenticatedRequest,
  ): Promise<{ success: true; message: string }> {
    const { userId } = req.user;
    const { refreshToken } = req.body;

    if (refreshToken) {
      await this.authService.logout(userId, refreshToken);
    }

    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * POST /auth/refresh
   * Validates the provided refresh token, issues a new JWT + rotated refresh token.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
  ): Promise<{ success: true; data: { accessToken: string; refreshToken: string } }> {
    // We need the userId from the refresh token record — since the refresh token
    // contains the userId in the DB, we first look it up directly in the service.
    // The service accepts (userId, rawToken) but since we only have the raw token
    // here we rely on the service to find the record by token alone.
    // We call a findFirst-by-token approach exposed via a thin wrapper.
    const tokens = await this.authService.refreshTokensByRawToken(dto.refreshToken);
    return { success: true, data: tokens };
  }

  /**
   * GET /auth/google
   * Initiates the Google OAuth 2.0 flow.
   */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth(): void {
    // Passport redirects to Google — no body needed.
  }

  /**
   * GET /auth/google/callback
   * Google redirects here after the user authorises the app.
   * Redirects the browser to the frontend with token params.
   */
  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(
    @Req() req: GoogleOAuthRequest,
    @Res() res: Response,
  ): void {
    const { accessToken, refreshToken } = req.user;
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    res.redirect(
      `${frontendUrl}/auth/callback?accessToken=${accessToken}&refreshToken=${refreshToken}`,
    );
  }

  /**
   * POST /auth/forgot-password
   * Sends a reset code to the user's email (or returns it in dev mode).
   */
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body('email') email: string,
  ): Promise<{ success: true; message: string }> {
    const result = await this.authService.forgotPassword(email);
    return { success: true, message: result.message };
  }

  /**
   * POST /auth/reset-password
   * Verifies the OTP and sets a new password.
   */
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() body: { email: string; otpCode: string; newPassword: string },
  ): Promise<{ success: true; message: string }> {
    const result = await this.authService.resetPassword(body.email, body.otpCode, body.newPassword);
    return { success: true, message: result.message };
  }

  /**
   * PATCH /auth/password
   * Changes the authenticated user's password and revokes all sessions.
   */
  @Patch('password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true; message: string }> {
    await this.authService.changePassword(req.user.userId, dto.newPassword);
    return {
      success: true,
      message: 'Password changed. Please log in again.',
    };
  }
}
