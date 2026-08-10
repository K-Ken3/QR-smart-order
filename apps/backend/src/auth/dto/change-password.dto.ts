import { IsString, Matches, MinLength } from 'class-validator';

/**
 * DTO for PATCH /auth/password
 * newPassword must be at least 8 characters, contain at least one
 * uppercase letter and at least one digit.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'newPassword must contain at least one uppercase letter and one digit',
  })
  newPassword!: string;
}
