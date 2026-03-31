import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateUserDto {
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
  password: string;

  @ApiProperty({ enum: UserRole, example: 'specialist' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  positionId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Куровані підрозділи (для заступника директора)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeDepartmentIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Іван' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Петренко' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Іванович' })
  @IsOptional()
  @IsString()
  patronymic?: string;

  @ApiPropertyOptional({ enum: UserRole })
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

  @ApiPropertyOptional({ type: [String], description: 'Куровані підрозділи (для заступника директора)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopeDepartmentIds?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UserQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Пошук за прізвищем, іменем, email' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class UpdateUserPasswordDto {
  @ApiProperty({ example: 'N3wStrongP@ssw0rd!' })
  @IsString()
  @MinLength(12)
  password: string;
}
