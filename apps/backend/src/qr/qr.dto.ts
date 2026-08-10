import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { QrValidity } from '@smartserve/types';

export class GenerateQrDto {
  @IsOptional()
  @IsEnum(QrValidity)
  validityPeriod?: QrValidity;
}

export class QrValidateDto {
  @IsNotEmpty()
  @IsString()
  token!: string;
}
