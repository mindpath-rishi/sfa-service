/**
 * Update Van Inventory Top-Up Items DTO
 * -------------------------------------
 * Purpose : Replace the item list of a submitted (requested) top-up
 * Used by : BACK_OFFICE / ADMIN before approval
 *
 * Supports:
 * - Changing requested case / piece quantity
 * - Adding new products
 * - Removing products (omit them from the list)
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateVanInventoryTopupItemQtyDto {
  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requestedCaseQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  requestedPieceQty?: number;
}

export class UpdateVanInventoryTopupItemsDto {
  @ApiProperty({ type: [UpdateVanInventoryTopupItemQtyDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateVanInventoryTopupItemQtyDto)
  items!: UpdateVanInventoryTopupItemQtyDto[];

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
