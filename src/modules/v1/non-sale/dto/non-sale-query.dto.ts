import { NonSaleStatus } from 'src/shared/enums/non-sale.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * NonSaleQueryDto
 * =================
 * Data Transfer Object for querying NonSale records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class NonSaleQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for nonSale' })
  @IsOptional()
  @IsString()
  nonSaleId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  visitId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reasonCategory?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  /**
   * Remark
   * ------
   * 🔗 Link with ShopVisit (single source of truth)
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  /**
   * Status
   * ------
   * Salesman / User
   */
  @ApiPropertyOptional({ enum: NonSaleStatus, description: 'Filter by status', default: NonSaleStatus.COMPLETED })
  @IsOptional()
  @IsEnum(NonSaleStatus)
  status?: NonSaleStatus;

}