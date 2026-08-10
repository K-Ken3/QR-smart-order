import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { LocationType, ServiceType } from '@smartserve/types';

export class UpdateCatalogDto {
  @IsArray()
  services!: { id?: string; name: string; category: ServiceType; displayOrder: number; isActive: boolean }[];

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;
}
