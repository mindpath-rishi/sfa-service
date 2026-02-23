import { CustomerSalesStatus } from 'src/shared/enums/customer-sales.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateCustomerSalesDto {
/**
 * CreateCustomerSalesDto
 * =================
 * Data Transfer Object for creating new CustomerSales records
 */
  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for customer' })
  @IsNotEmpty()
  @IsString()
  customerId: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  customerName: string;

  @ApiProperty({ type: String, description: 'Business identifier for employee' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  /**
   * TotalReturnQuantity
   * -------------------
   * Van reference (vans.vanId)
   */
  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalReturnQuantity?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ enum: CustomerSalesStatus, default: CustomerSalesStatus.DRAFT })
  @IsOptional()
  @IsEnum(CustomerSalesStatus)
  status?: CustomerSalesStatus;

}
