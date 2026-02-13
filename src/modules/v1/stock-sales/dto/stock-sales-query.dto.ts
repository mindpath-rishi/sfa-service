import { ErpSyncStatus, StockSalesStatus } from 'src/shared/enums/stock-sales.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * StockSalesQueryDto
 * =================
 * Data Transfer Object for querying StockSales records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class StockSalesQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for stockSales' })
  @IsOptional()
  @IsString()
  stockSalesId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  stockSalesNumber?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by physicalCount ID' })
  @IsOptional()
  @IsString()
  physicalCountId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalPhysicalStock?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalPhysicalStockWeight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalPhysicalStockValue?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalSalesQuantity?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalSalesValue?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalSalesWeight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalVariance?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalVarianceWeight?: number;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  hasVariance?: boolean;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalSystemStock?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalSystemStockWeight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalSystemStockValue?: number;

  @ApiPropertyOptional({ enum: StockSalesStatus, description: 'Filter by status', example: StockSalesStatus.DRAFT, default: StockSalesStatus.DRAFT })
  @IsOptional()
  @IsEnum(StockSalesStatus)
  status?: StockSalesStatus;

  @ApiPropertyOptional({ enum: ErpSyncStatus, description: 'Filter by erpSyncStatus', example: ErpSyncStatus.PENDING, default: ErpSyncStatus.PENDING })
  @IsOptional()
  @IsEnum(ErpSyncStatus)
  erpSyncStatus?: ErpSyncStatus;

}