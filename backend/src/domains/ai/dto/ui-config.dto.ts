import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class UiSpanDto {
  @IsInt()
  @Min(1)
  @Max(12)
  col: number;

  @IsInt()
  @Min(1)
  @Max(6)
  row: number;
}

class UiWidgetDto {
  @IsString()
  id: string;

  @IsString()
  type: string;

  @IsString()
  title: string;

  @ValidateNested()
  @Type(() => UiSpanDto)
  span: UiSpanDto;

  @IsOptional()
  @IsString()
  dataSource?: string;

  @IsOptional()
  @IsString()
  variant?: string;
}

class UiGridDto {
  @IsInt()
  @Min(1)
  @Max(24)
  columns: number;

  @IsInt()
  @Min(0)
  @Max(64)
  gap: number;

  @IsInt()
  @Min(60)
  @Max(240)
  rowHeight: number;
}

export class UiLayoutDto {
  @IsString()
  id: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UiWidgetDto)
  widgets: UiWidgetDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UiGridDto)
  grid?: UiGridDto;
}
