import { StockCountStatus } from 'src/shared/enums/stock-count.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * StockCountQueryDto
 * =================
 * Data Transfer Object for querying StockCount records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class StockCountQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for stockCount' })
  @IsOptional()
  @IsString()
  stockCountId?: string;

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
  totalQuantity?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalWeight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  @ApiPropertyOptional({ type: String , description: 'Filter by updatedBy ID' })
  @IsOptional()
  @IsString()
  updatedById?: string;

  @ApiPropertyOptional({ enum: StockCountStatus, description: 'Filter by status', default: StockCountStatus.DRAFT })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;

}