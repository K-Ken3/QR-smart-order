import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QrValidity } from '@smartserve/types';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

const VALIDITY_MAP: Record<QrValidity, number> = {
  HOURS_24: 24 * 60 * 60,
  DAYS_7: 7 * 24 * 60 * 60,
  DAYS_30: 30 * 24 * 60 * 60,
  NON_EXPIRING: 0,
};

@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateQr(locationId: string, validityPeriod: QrValidity = QrValidity.HOURS_24) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { branch: true },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const branch = location.branch;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: branch.tenantId },
    });
    if (!tenant || !tenant.hmacSecret) {
      throw new NotFoundException('Tenant HMAC secret not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAtSeconds =
      VALIDITY_MAP[validityPeriod] > 0
        ? now + VALIDITY_MAP[validityPeriod]
        : undefined;

    const payload = {
      sub: location.id,
      tid: tenant.id,
      bid: branch.id,
      lid: location.id,
      iat: now,
      exp: expiresAtSeconds,
    } as Record<string, unknown>;

    const token = this.signToken(payload, tenant.hmacSecret, expiresAtSeconds);

    // Generate QR code pointing to the scan URL
    const appUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const scanUrl = `${appUrl}/scan/${token}`;
    const pngDataUrl = await QRCode.toDataURL(scanUrl, { width: 400, margin: 2, color: { dark: '#000000', light: '#ffffff' } });

    const qr = await this.prisma.qrCode.create({
      data: {
        locationId,
        token,
        pngUrl: pngDataUrl,
        svgUrl: scanUrl,
        validityPeriod,
        expiresAt: expiresAtSeconds ? new Date(expiresAtSeconds * 1000) : null,
      },
    });

    return { ...qr, scanUrl };
  }

  private signToken(payload: Record<string, unknown>, secret: string, expiresAtSeconds?: number) {
    const header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
    const encodedHeader = this.base64UrlEncode(Buffer.from(header, 'utf8'));

    if (expiresAtSeconds) {
      payload.exp = expiresAtSeconds;
    }

    const encodedPayload = this.base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signature = crypto
      .createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const encodedSignature = this.base64UrlEncode(signature);

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  private base64UrlEncode(data: Buffer) {
    return data.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  private base64UrlDecode(value: string) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64 + '=='.slice((2 - (base64.length * 3) % 4) % 4), 'base64');
  }

  async validateQr(token: string) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid QR token');
    }

    const payload = JSON.parse(this.base64UrlDecode(parts[1]).toString('utf8')) as Record<string, unknown>;
    const tenantId = payload.tid as string;
    if (!tenantId) {
      throw new UnauthorizedException('Invalid QR token payload');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant || !tenant.hmacSecret) {
      throw new NotFoundException('Tenant HMAC secret not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', Buffer.from(tenant.hmacSecret, 'hex'))
      .update(`${parts[0]}.${parts[1]}`)
      .digest();
    const signature = this.base64UrlDecode(parts[2]);

    if (!crypto.timingSafeEqual(expectedSignature, signature)) {
      throw new UnauthorizedException('Invalid QR token signature');
    }

    if (payload.exp && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('QR token has expired');
    }

    return payload;
  }

  async resolveQrContext(token: string) {
    const payload = await this.validateQr(token);
    const locationId = payload.lid as string;
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { branch: true, qrCodes: true },
    });
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    const serviceCatalog = await this.prisma.serviceCatalog.findUnique({
      where: {
        branchId_locationType: {
          branchId: location.branchId,
          locationType: location.locationType,
        },
      },
      include: { services: true },
    });

    return {
      location,
      serviceCatalog: serviceCatalog?.services ?? [],
    };
  }

  async getMenuByToken(token: string) {
    const context = await this.resolveQrContext(token);
    const menu = await this.prisma.menu.findFirst({
      where: { branchId: context.location.branchId },
      include: {
        menuItems: {
          where: { status: 'AVAILABLE' },
          orderBy: { displayOrder: 'asc' as const },
        },
      },
    });
    return menu ?? { menuItems: [] };
  }
}
