import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * VanInventoryTopupItemQueryDto
 * =================
 * Data Transfer Object for querying VanInventoryTopupItem records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class VanInventoryTopupItemQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by vanInventoryTopup ID' })
  @IsOptional()
  @IsString()
  vanInventoryTopupId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  requestedQty?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  requestedWeight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  requestedValue?: number;

  /**
   * ApprovedQty
   * -----------
   * Van Inventory Top-Up reference (van_inventory_topup.vanInventoryTopupId)
   */
  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedQty?: number;

  /**
   * ApprovedWeight
   * --------------
   * Product reference (product_master.productId)
   */
  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  approvedWeight?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  approvedValue?: number;

  /**
   * ProductPrice
   * ------------
   * Requested weight = requestedQty * product_master.netWeight
   */
  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  productPrice?: number;

  /**
   * ProductNetWeight
   * ----------------
   * Requested value = requestedQty * product_master.price
   */
  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  productNetWeight?: number;

  /**
   * Remark
   * ------
   * Approved quantity
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

}