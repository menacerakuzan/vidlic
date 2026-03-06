import { IsString, IsEnum, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ExportFormat } from '@prisma/client';

export class ExportDto {
  @ApiProperty({ enum: ['report', 'task'], example: 'report' })
  @IsEnum(['report', 'task'])
  entityType: 'report' | 'task';

  @ApiProperty()
  @IsUUID()
  entityId: string;

  @ApiProperty({ enum: ExportFormat, example: 'pdf' })
  @IsEnum(ExportFormat)
  format: ExportFormat;
}
