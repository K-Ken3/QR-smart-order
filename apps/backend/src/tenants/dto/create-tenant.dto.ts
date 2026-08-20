import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  businessName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
