import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Business name must be at least 2 characters' })
  businessName!: string;

  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  /**
   * Must be at least 8 characters, contain at least one uppercase letter
   * and at least one digit.
   */
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'Password must contain at least one uppercase letter and one digit',
  })
  password!: string;
}
