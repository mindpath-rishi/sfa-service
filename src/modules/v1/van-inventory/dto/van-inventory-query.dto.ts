import { VanInventoryStatus } from 'src/shared/enums/van-inventory.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * VanInventoryQueryDto
 * =================
 * Data Transfer Object for querying VanInventory records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class VanInventoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for inventory' })
  @IsOptional()
  @IsString()
  inventoryId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  quantity?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  reservedQuantity?: number;

  @ApiPropertyOptional({ type: Date , description: "Filter by date range (supports operators: gt, gte, lt, lte)", example: "2024-01-01T00:00:00.000Z" })
  @IsOptional()
  @IsDate()
  settlementDate?: Date;

  @ApiPropertyOptional({ enum: VanInventoryStatus, description: 'Filter by status', default: VanInventoryStatus.ACTIVE })
  @IsOptional()
  @IsEnum(VanInventoryStatus)
  status?: VanInventoryStatus;

}