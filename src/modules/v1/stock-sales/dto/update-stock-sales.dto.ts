import { ErpSyncStatus, StockSalesStatus } from 'src/shared/enums/stock-sales.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateStockSalesDto {
/**
 * UpdateStockSalesDto
 * =================
 * Data Transfer Object for updating StockSales records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  stockSalesNumber?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  physicalCountId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeId?: string;

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
