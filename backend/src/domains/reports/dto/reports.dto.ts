import { IsString, IsOptional, IsEnum, IsDateString, IsObject, IsUUID, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReportType, ReportStatus } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ enum: ReportType, example: 'weekly' })
  @IsEnum(ReportType)
  reportType: ReportType;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ example: '2024-01-07' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({ example: 'Тижневий звіт за 1-7 січня' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: {} })
  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class UpdateReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  content?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}

export class ReportQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportType })
  @IsOptional()
  @IsEnum(ReportType)
  type?: ReportType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  authorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;

  @ApiPropertyOptional({ description: 'Пошук за назвою або автором' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class SubmitReportDto {
  @ApiPropertyOptional({ description: 'Коментар при відправці' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class ApproveReportDto {
  @ApiPropertyOptional({ description: 'Коментар при погодженні' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class RejectReportDto {
  @ApiProperty({ description: 'Причина відхилення' })
  @IsString()
  comment: string;
}

export class AddReportCommentDto {
  @ApiProperty({ description: 'Ключ секції звіту', example: 'workDone' })
  @IsString()
  sectionKey: string;

  @ApiPropertyOptional({ description: 'Назва секції', example: 'Виконана робота' })
  @IsOptional()
  @IsString()
  sectionLabel?: string;

  @ApiProperty({ description: 'Текст коментаря' })
  @IsString()
  text: string;
}

export class ResolveReportCommentDto {
  @ApiPropertyOptional({ description: 'Коментар при закритті зауваження' })
  @IsOptional()
  @IsString()
  note?: string;
}
