import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManagementDto {
  @ApiProperty({ example: 'Управління цифровізації' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'Управління цифровізації' })
  @IsString()
  @MinLength(2)
  nameUk: string;

  @ApiProperty()
  @IsString()
  departmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  headId?: string;
}

export class UpdateManagementDto {
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
  headId?: string | null;
}

export class SectionIdsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  sectionIds: string[];
}
