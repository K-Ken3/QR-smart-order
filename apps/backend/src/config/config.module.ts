import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import * as Joi from 'joi';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validationSchema: Joi.object({
        // Database
        DATABASE_URL: Joi.string().required(),

        // Redis
        REDIS_URL: Joi.string().default('redis://localhost:6379'),

        // JWT
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),

        // QR encryption
        QR_HMAC_ENCRYPTION_KEY: Joi.string()
          .length(64)
          .pattern(/^[0-9a-fA-F]{64}$/)
          .required()
          .messages({
            'string.length': 'QR_HMAC_ENCRYPTION_KEY must be exactly 64 hex characters',
            'string.pattern.base': 'QR_HMAC_ENCRYPTION_KEY must be a valid 64-character hex string',
          }),

        // Supabase (optional)
        SUPABASE_URL: Joi.string().uri().optional(),
        SUPABASE_SERVICE_KEY: Joi.string().optional(),

        // Firebase (optional)
        FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().optional(),

        // Stripe (optional)
        STRIPE_SECRET_KEY: Joi.string().optional(),
        STRIPE_WEBHOOK_SECRET: Joi.string().optional(),

        // Flutterwave (optional)
        FLUTTERWAVE_SECRET_KEY: Joi.string().optional(),

        // Google OAuth (optional)
        GOOGLE_CLIENT_ID: Joi.string().optional(),
        GOOGLE_CLIENT_SECRET: Joi.string().optional(),

        // SMTP (all optional)
        SMTP_HOST: Joi.string().optional(),
        SMTP_PORT: Joi.number().integer().optional(),
        SMTP_USER: Joi.string().optional(),
        SMTP_PASS: Joi.string().optional(),

        // App
        FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().integer().default(3001),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
  ],
})
export class AppConfigModule {}
