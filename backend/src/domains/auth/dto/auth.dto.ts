import { IsEmail, IsString, MinLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class LoginDto {
  @ApiProperty({ example: 'user@org.gov.ua' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd123!' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'user@org.gov.ua' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'EMP001' })
  @IsString()
  employeeId: string;

  @ApiProperty({ example: 'Іван' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Петренко' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'Іванович' })
  @IsOptional()
  @IsString()
  patronymic?: string;

  @ApiProperty({ example: 'P@ssw0rd123!' })
  @IsString()
  @MinLength(12)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message: 'Пароль повинен містити велику літеру, малу літеру, цифру та спеціальний символ',
  })
  password: string;

  @ApiPropertyOptional({ enum: UserRole, default: 'specialist' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token' })
  @IsString()
  refreshToken: string;
}

export class LogoutDto {
  @ApiProperty({ description: 'Access token' })
  @IsString()
  accessToken: string;
}

export class MeDto {}
