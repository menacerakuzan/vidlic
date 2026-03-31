import { IsString, IsOptional, IsEnum, IsDateString, IsUUID, IsInt, Min, Max, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus, TaskPriority } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTaskDto {
  @ApiProperty({ example: 'Підготувати звіт' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Детальний опис задачі' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority, default: 'medium' })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reportId?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 8, description: 'Орієнтовний час виконання (години)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  executionHours?: number;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Встановити null для видалення дати' })
  @IsOptional()
  @IsString()
  dueDateClear?: boolean;

  @ApiPropertyOptional({ example: 6, description: 'Орієнтовний час виконання (години)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  executionHours?: number;
}

export class TaskQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TaskPriority })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reporterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDateTo?: string;
}

export class UpdateTaskStatusDto {
  @ApiProperty({ enum: TaskStatus, example: 'in_progress' })
  @IsEnum(TaskStatus)
  status: TaskStatus;
}

export class CreateTaskCommentDto {
  @ApiProperty({ example: 'Коментар до задачі' })
  @IsString()
  content: string;
}
