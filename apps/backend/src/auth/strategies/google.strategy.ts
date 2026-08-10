import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const apiUrl =
      configService.get<string>('API_URL') ?? 'http://localhost:3001/api';
    const callbackUrl =
      configService.get<string>('GOOGLE_CALLBACK_URL') ??
      `${apiUrl}/auth/google/callback`;

    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') ?? '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') ?? '',
      callbackURL: callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const { id: googleId, emails, name } = profile;
    const email = emails?.[0]?.value ?? '';
    const firstName = name?.givenName ?? '';
    const lastName = name?.familyName ?? '';

    try {
      const tokens = await this.authService.findOrCreateGoogleUser({
        googleId,
        email,
        firstName,
        lastName,
      });
      done(null, tokens);
    } catch (err) {
      done(err as Error, undefined);
    }
  }
}
