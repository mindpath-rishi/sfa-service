import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateStockSalesItemDto {
/**
 * CreateStockSalesItemDto
 * =================
 * Data Transfer Object for creating new StockSalesItem records
 */
  @ApiProperty({ type: String, description: 'Business identifier for stockSales' })
  @IsNotEmpty()
  @IsString()
  stockSalesId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  price: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  weight: number;

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
