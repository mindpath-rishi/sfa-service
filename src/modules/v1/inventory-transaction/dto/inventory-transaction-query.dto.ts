import { InventoryTransactionStatus, TransactionType } from 'src/shared/enums/inventory-transaction.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * InventoryTransactionQueryDto
 * =================
 * Data Transfer Object for querying InventoryTransaction records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class InventoryTransactionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for transaction' })
  @IsOptional()
  @IsString()
  transactionId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by warehouse ID' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: TransactionType, description: 'Filter by transactionType' })
  @IsOptional()
  @IsEnum(TransactionType)
  transactionType?: TransactionType;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantity?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ enum: InventoryTransactionStatus, description: 'Filter by status', example: InventoryTransactionStatus.POSTED, default: InventoryTransactionStatus.POSTED })
  @IsOptional()
  @IsEnum(InventoryTransactionStatus)
  status?: InventoryTransactionStatus;

}