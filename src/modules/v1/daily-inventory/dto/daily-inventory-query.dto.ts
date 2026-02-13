import { DailyInventoryStatus } from 'src/shared/enums/daily-inventory.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * DailyInventoryQueryDto
 * =================
 * Data Transfer Object for querying DailyInventory records
 *
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class DailyInventoryQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description:
      'Search by name, code, or identifier (supports partial matching)',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for dailyInventory',
  })
  @IsOptional()
  @IsString()
  dailyInventoryId?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ type: String, description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingQty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inQty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outQty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  adjustmentQty?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  closingQty?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    enum: DailyInventoryStatus,
    description: 'Filter by status',
    default: DailyInventoryStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(DailyInventoryStatus)
  status?: DailyInventoryStatus;
}
