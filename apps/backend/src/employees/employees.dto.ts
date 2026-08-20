import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsNotEmpty()
  @IsString()
  firstName!: string;

  @IsNotEmpty()
  @IsString()
  lastName!: string;

  @IsNotEmpty()
  @IsEnum(['RECEPTIONIST', 'KITCHEN_STAFF', 'BRANCH_MANAGER', 'EMPLOYEE'])
  role!: 'RECEPTIONIST' | 'KITCHEN_STAFF' | 'BRANCH_MANAGER' | 'EMPLOYEE';
}

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEnum(['RECEPTIONIST', 'KITCHEN_STAFF', 'BRANCH_MANAGER', 'EMPLOYEE'])
  role?: 'RECEPTIONIST' | 'KITCHEN_STAFF' | 'BRANCH_MANAGER' | 'EMPLOYEE';

  @IsOptional()
  @IsString()
  branchId?: string;
}
