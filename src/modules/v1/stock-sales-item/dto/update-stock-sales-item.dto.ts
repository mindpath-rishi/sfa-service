import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateStockSalesItemDto {
/**
 * UpdateStockSalesItemDto
 * =================
 * Data Transfer Object for updating StockSalesItem records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  stockSalesId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  systemStock?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  systemStockWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  systemStockValue?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  receivedQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  physicalStock?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  returnsQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  damageQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  transferOutQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  transferInQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  salesQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  salesValue?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  salesWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  expectedClosingBalance?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  variance?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  varianceWeight?: number;

}
