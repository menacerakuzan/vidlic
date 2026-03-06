import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiPropertyOptional({ example: 'Департамент інформаційних технологій' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Департамент інформаційних технологій' })
  @IsString()
  nameUk: string;

  @ApiPropertyOptional({ example: 'IT' })
  @IsString()
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  directorId?: string;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameUk?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  managerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  directorId?: string;
}

export class DepartmentTeamQueryDto {}

export class UpdateDepartmentTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titlePattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headerPattern?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  sectionSchema?: any;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  aiPrompt?: string;
}
