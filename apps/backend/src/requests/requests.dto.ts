import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { ServiceType, SourceType } from '@smartserve/types';

export class CreateRequestDto {
  @IsNotEmpty()
  @IsEnum(SourceType)
  source_type!: SourceType;

  @IsNotEmpty()
  @IsString()
  location_id!: string;

  @IsNotEmpty()
  @IsEnum(ServiceType)
  service_type!: ServiceType;

  @IsNotEmpty()
  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AssignRequestDto {
  @IsNotEmpty()
  @IsString()
  employeeId!: string;
}

export class UpdateRequestStatusDto {
  @IsNotEmpty()
  @IsEnum(['IN_PROGRESS', 'COMPLETED'])
  status!: 'IN_PROGRESS' | 'COMPLETED';
}

export class AddRequestNoteDto {
  @IsNotEmpty()
  @IsString()
  note!: string;
}
