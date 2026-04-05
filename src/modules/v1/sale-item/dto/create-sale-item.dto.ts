import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSaleItemDto {
  /**
   * CreateSalesItemDto
   * =================
   * Data Transfer Object for creating new SalesItem records
   */
  @ApiProperty({ type: String, description: 'Business identifier for sale' })
  @IsNotEmpty()
  @IsString()
  saleId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productName: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  caseQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  pieceQty?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  quantity: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  casePrice: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  caseNetWeight: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  /**
   * TotalValue
   * ----------
   * 🔥 Base (source of truth)
   */
  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  /**
   * UnitQtyInCase
   * -------------
   * 🔥 Derived snapshot
   */
  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  unitQtyInCase: number;
}
