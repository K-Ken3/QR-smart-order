import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as rTracer from 'cls-rtracer';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RateLimitMiddleware } from './common/middleware/rate-limit.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ──────────────────────────────────────────────
  // 1. HTTPS redirect (production only, must come first)
  // ──────────────────────────────────────────────
  // Applied at Express adapter level so it runs before any NestJS middleware.
  const expressApp = app.getHttpAdapter().getInstance();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expressApp.use((req: any, res: any, next: any) => {
    const isProduction = process.env['NODE_ENV'] === 'production';
    if (isProduction) {
      const proto = req.headers['x-forwarded-proto'];
      const protoValue = Array.isArray(proto) ? proto[0] : proto;
      if (protoValue && protoValue.toLowerCase() !== 'https') {
        const httpsUrl = `https://${req.headers['host'] ?? ''}${req.originalUrl as string}`;
        res.redirect(301, httpsUrl);
        return;
      }
    }
    next();
  });

  // ──────────────────────────────────────────────
  // 2. Request ID tracking (cls-rtracer)
  // ──────────────────────────────────────────────
  app.use(rTracer.expressMiddleware({ useHeader: true, headerName: 'x-request-id' }));

  // ──────────────────────────────────────────────
  // 3. Helmet — HTTP security headers
  // ──────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      crossOriginEmbedderPolicy: false, // Allow embedding in iframes for guest QR pages
    }),
  );

  // ──────────────────────────────────────────────
  // 4. CORS — per-tenant allowed origins
  // ──────────────────────────────────────────────
  const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  // Always include the frontend dev URL as a fallback
  const defaultOrigin = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
  if (!allowedOrigins.includes(defaultOrigin)) {
    allowedOrigins.unshift(defaultOrigin);
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, Postman, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS policy: origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  });

  // ──────────────────────────────────────────────
  // 5. Global API prefix
  // ──────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ──────────────────────────────────────────────
  // 6. Global ValidationPipe
  // ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,           // Strip properties not in DTO
      forbidNonWhitelisted: true, // Throw on extra properties
      transform: true,           // Auto-transform payloads to DTO instances
      transformOptions: {
        enableImplicitConversion: true, // Coerce primitives (e.g. "1" → 1)
      },
    }),
  );

  // ──────────────────────────────────────────────
  // 7. Global Exception Filter
  // ──────────────────────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ──────────────────────────────────────────────
  // 8. Global Logging Interceptor
  // ──────────────────────────────────────────────
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ──────────────────────────────────────────────
  // 9. Rate-limiting middleware
  //    Bypass the /api/health endpoint so health
  //    checks never consume a rate-limit slot.
  // ──────────────────────────────────────────────
  const rateLimiter = new RateLimitMiddleware();
  const healthPath = '/api/health';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expressApp.use((req: any, res: any, next: any) => {
    if ((req.path as string) === healthPath || (req.originalUrl as string) === healthPath) {
      return next();
    }
    rateLimiter.use(req, res, next);
  });

  // ──────────────────────────────────────────────
  // 10. Start
  // ──────────────────────────────────────────────
  const port = process.env['PORT'] ?? 3001;
  await app.listen(port);
  console.warn(`SmartServe QR Backend running on http://localhost:${port}/api`);
}

bootstrap();
