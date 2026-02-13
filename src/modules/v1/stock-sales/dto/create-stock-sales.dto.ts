import { ErpSyncStatus, StockSalesStatus } from 'src/shared/enums/stock-sales.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateStockSalesDto {
/**
 * CreateStockSalesDto
 * =================
 * Data Transfer Object for creating new StockSales records
 */
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  stockSalesNumber: string;

  @ApiProperty({ type: String, description: 'Business identifier for physicalCount' })
  @IsNotEmpty()
  @IsString()
  physicalCountId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for employee' })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalPhysicalStock?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalPhysicalStockWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalPhysicalStockValue?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalSalesQuantity?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalSalesValue?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalSalesWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalVariance?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalVarianceWeight?: number;

  @ApiPropertyOptional({ type: Boolean , default: false })
  @IsOptional()
  @IsBoolean()
  hasVariance?: boolean;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalSystemStock?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalSystemStockWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalSystemStockValue?: number;

  @ApiPropertyOptional({ enum: StockSalesStatus, example: StockSalesStatus.DRAFT, default: StockSalesStatus.DRAFT })
  @IsOptional()
  @IsEnum(StockSalesStatus)
  status?: StockSalesStatus;

  @ApiPropertyOptional({ enum: ErpSyncStatus, example: ErpSyncStatus.PENDING, default: ErpSyncStatus.PENDING })
  @IsOptional()
  @IsEnum(ErpSyncStatus)
  erpSyncStatus?: ErpSyncStatus;

}
