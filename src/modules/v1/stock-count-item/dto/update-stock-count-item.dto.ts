import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateStockCountItemDto {
/**
 * UpdateStockCountItemDto
 * =================
 * Data Transfer Object for updating StockCountItem records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  stockCountId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  stock?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  price?: number;

}
