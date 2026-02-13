import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateStockCountItemDto {
/**
 * CreateStockCountItemDto
 * =================
 * Data Transfer Object for creating new StockCountItem records
 */
  @ApiProperty({ type: String, description: 'Business identifier for stockCount' })
  @IsNotEmpty()
  @IsString()
  stockCountId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  stock: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  weight: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  value: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  price: number;

}
