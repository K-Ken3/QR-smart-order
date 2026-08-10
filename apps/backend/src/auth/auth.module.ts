import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * AuthModule
 *
 * Provides local (email/password) and Google OAuth authentication:
 *  - POST /auth/register  — create Tenant + BUSINESS_OWNER, send verification email
 *  - POST /auth/login     — verify credentials, issue JWT + RefreshToken
 *  - POST /auth/logout    — revoke RefreshToken in Redis + DB
 *  - POST /auth/refresh   — rotate refresh token, issue new JWT
 *  - GET  /auth/google    — initiate Google OAuth flow
 *  - GET  /auth/google/callback — handle Google OAuth callback
 *  - PATCH /auth/password — change password, revoke all sessions
 *
 * Both PrismaModule and RedisModule are @Global(), so their services
 * are available here without explicit re-import.
 */
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
