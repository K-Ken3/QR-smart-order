import { QrValidity } from '../enums/qr-validity.enum';

export interface GenerateQrDto {
  validityPeriod?: QrValidity;
}

export interface QrValidateDto {
  token: string;
}

export interface LocationContextDto {
  tenantId: string;
  branchId: string;
  locationId: string;
}

export interface QrValidateResponseDto {
  valid: boolean;
  location?: {
    id: string;
    name: string;
    locationType: string;
  };
  serviceCatalog?: ServiceCatalogItemDto[];
  error?: string;
}

export interface ServiceCatalogItemDto {
  id: string;
  name: string;
  category: string;
  displayOrder: number;
  isActive: boolean;
}

export interface QrCodeDto {
  id: string;
  locationId: string;
  pngUrl: string;
  svgUrl: string;
  validityPeriod: QrValidity;
  expiresAt: Date | null;
  isActive: boolean;
  createdAt: Date;
}
