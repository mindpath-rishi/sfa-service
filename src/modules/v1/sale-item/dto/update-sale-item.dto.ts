import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateSaleItemDto {
/**
 * UpdateSalesItemDto
 * =================
 * Data Transfer Object for updating SalesItem records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  saleId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  caseQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  pieceQty?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  returnCaseQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  returnPieceQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  returnQuantity?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  piecePrice?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  casePrice?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  pieceNetWeight?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  caseNetWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  /**
   * TotalValue
   * ----------
   * 🔥 Base (source of truth)
   */
  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  /**
   * UnitQtyInCase
   * -------------
   * 🔥 Derived snapshot
   */
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  unitQtyInCase?: number;

}
