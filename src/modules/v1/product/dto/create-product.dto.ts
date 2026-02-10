/**
 * Product Create DTO
 * ------------------
 * Purpose : Create new product master record
 * Used by : BACK_OFFICE / ADMIN
 *
 * Supports:
 * - Product identity
 * - Category association
 * - Pricing and weight
 * - Unit configuration
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { PriceType } from 'src/shared/enums/product.enums';


export class ProductCreateDto {
  /**
   * Product ID
   * ----------
   * Purpose : Unique business identifier for product
   * Example : PID-001
   */
  @ApiProperty({ example: 'PID-001' })
  @IsString()
  productId: string;

  /**
   * Product Name
   * ------------
   * Purpose : Display name of product
   * Example : Milk 1L
   */
  @ApiProperty({ example: 'Milk 1L' })
  @IsString()
  name: string;

  /**
   * Category ID
   * -----------
   * Purpose : Product category reference
   * Example : CAT-123
   */
  @ApiProperty({ example: 'CAT-123' })
  @IsString()
  categoryId: string;

  /**
   * System Code
   * -----------
   * Purpose : Internal system product code
   * Example : SYS-0001
   */
  @ApiProperty({ example: 'SYS-0001' })
  @IsString()
  productSysCode: string;

  /**
   * Price
   * -----
   * Purpose : Product selling price
   * Example : 50
   */
  @ApiProperty({ example: 50 })
  @IsNumber()
  price: number;

  /**
   * Net Weight
   * ----------
   * Purpose : Product net weight
   * Example : 1
   */
  @ApiProperty({ example: 1 })
  @IsNumber()
  netWeight: number;

  /**
   * Price Type
   * ----------
   * Purpose : Pricing classification
   * Example : STANDARD
   */
  @ApiProperty({ enum: PriceType, example: PriceType.STANDARD })
  @IsEnum(PriceType)
  priceType: PriceType;

  /**
   * Unit Type
   * ---------
   * Purpose : Product unit type
   * Example : Bottle
   */
  @ApiProperty({ example: 'Bottle', required: false })
  @IsOptional()
  @IsString()
  unitType?: string;

  /**
   * Unit Size
   * ---------
   * Purpose : Size of unit
   * Example : 1L
   */
  @ApiProperty({ example: '1L', required: false })
  @IsOptional()
  @IsString()
  unitSize?: string;

  /**
   * Quantity Per Case
   * -----------------
   * Purpose : Units per case
   * Example : 12
   */
  @ApiProperty({ example: '12', required: false })
  @IsOptional()
  @IsString()
  unitQtyInCase?: string;
}
