import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { SchemeStatus, SchemeType } from 'src/shared/enums/scheme.enums';

/**
 * CreateSchemeDto
 * =================
 * DTO for creating Scheme
 */
export class CreateSchemeDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: SchemeStatus, default: SchemeStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SchemeStatus)
  status?: SchemeStatus;

  /* ======================================================
   * APPLICABILITY
   * ====================================================== */

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategoryIds?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  provinceIds?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  routeIds?: string[];

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vanIds?: string[];

  /* ======================================================
   * BENEFIT
   * ====================================================== */

  @ApiProperty({ enum: SchemeType })
  @IsNotEmpty()
  @IsEnum(SchemeType)
  schemeType!: SchemeType;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  buyQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeQty?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  freeProductId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  freeProductName?: string;

  /* ======================================================
   * VALIDITY
   * ====================================================== */

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  endDate!: Date;
}
