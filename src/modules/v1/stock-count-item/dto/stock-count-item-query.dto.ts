import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * StockCountItemQueryDto
 * =================
 * Data Transfer Object for querying StockCountItem records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class StockCountItemQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by stockCount ID' })
  @IsOptional()
  @IsString()
  stockCountId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  stock?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  price?: number;

}