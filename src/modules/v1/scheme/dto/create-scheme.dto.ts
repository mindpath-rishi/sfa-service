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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  SchemeFreeUnit,
  SchemeStatus,
  SchemeType,
} from 'src/shared/enums/scheme.enums';

/** COMBO_FREE_QTY: a product of the combo and its required quantity */
export class SchemeComboItemDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiProperty({
    type: Number,
    description: 'Quantity of this product required',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  qty!: number;

  @ApiPropertyOptional({ enum: SchemeFreeUnit, default: SchemeFreeUnit.CASE })
  @IsOptional()
  @IsEnum(SchemeFreeUnit)
  unit?: SchemeFreeUnit;
}

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

  @ApiPropertyOptional({
    type: Number,
    description:
      'Group schemes: combined cases across all products in scope for one benefit (repeats per multiple)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  groupMinCases?: number;

  @ApiPropertyOptional({
    type: Number,
    description:
      'GROUP_FREE_PERCENT: % of each qualifying line quantity given free',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  freePercent?: number;

  @ApiPropertyOptional({ enum: SchemeFreeUnit, default: SchemeFreeUnit.CASE })
  @IsOptional()
  @IsEnum(SchemeFreeUnit)
  freeUnit?: SchemeFreeUnit;

  @ApiPropertyOptional({
    type: [SchemeComboItemDto],
    description:
      'COMBO_FREE_QTY: products and quantities that must all be bought (e.g. A x3 + B x1)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SchemeComboItemDto)
  comboItems?: SchemeComboItemDto[];

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
