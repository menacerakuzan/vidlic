import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AttachmentEntityType } from '@prisma/client';

export class CreateAttachmentDto {
  @ApiProperty({ enum: AttachmentEntityType })
  @IsEnum(AttachmentEntityType)
  entityType: AttachmentEntityType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  reportId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  taskId?: string;

  @ApiProperty()
  @IsString()
  fileName: string;

  @ApiProperty()
  @IsString()
  mimeType: string;

  @ApiProperty({ description: 'Base64 without data: prefix' })
  @IsString()
  contentBase64: string;
}
