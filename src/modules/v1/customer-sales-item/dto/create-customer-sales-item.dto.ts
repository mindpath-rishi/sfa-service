import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class CreateCustomerSalesItemDto {
/**
 * CreateCustomerSalesItemDto
 * =================
 * Data Transfer Object for creating new CustomerSalesItem records
 */
  @ApiProperty({ type: String, description: 'Business identifier for sale' })
  @IsNotEmpty()
  @IsString()
  saleId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0001)
  returnQuantity: number;

  /**
   * NetWeight
   * ---------
   * Customer sales reference (customer_sales.customerSalesId)
   */
  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  netWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  price: number;

}
