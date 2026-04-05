import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * ShopVisitQueryDto
 * =================
 * Data Transfer Object for querying ShopVisit records
 *
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class ShopVisitQueryDto extends PaginationDto {
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
    description: 'Business identifier for visit',
  })
  @IsOptional()
  @IsString()
  visitId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by routeSession ID',
  })
  @IsOptional()
  @IsString()
  routeSessionId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by workSession ID',
  })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanName?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by outlet ID' })
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  outletName?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  sequence?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  checkInTime?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  checkOutTime?: Date;

  @ApiPropertyOptional({
    enum: ShopVisitStatus,
    description: 'Filter by status',
    default: ShopVisitStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ShopVisitStatus)
  status?: ShopVisitStatus;
}

export class ShopVisitStatusQueryDto{
  @ApiPropertyOptional({
    type: String,
    description: 'Filter by routeSession ID',
  })
  @IsOptional()
  @IsString()
  routeSessionId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by workSession ID',
  })
  @IsNotEmpty()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by van ID' })
  @IsNotEmpty()
  @IsString()
  vanId?: string;
}
