import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * RouteQueryDto
 */
export class RouteQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search by name, code, or identifier',
    example: 'search term',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for route',
    example: 'ROUTE-001',
  })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({
    type: String,
    example: 'Main Route',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by beat ID',
    example: 'BEAT-001',
  })
  @IsOptional()
  @IsString()
  beatId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Day of route',
    example: 'MON',
  })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @Type(() => Number) // ✅ FIX
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({
    enum: RouteStatus,
    description: 'Filter by status',
    default: RouteStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;
}

/**
 * RouteCustomerQueryDto
 */
export class RouteCustomerQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search by outlet name, phone, owner',
    example: 'ABC Store',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({
    description: 'Filter by customer status',
    example: 'ACTIVE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Filter by customer IDs',
    example: ['CUST-001', 'CUST-002'],
  })
  @IsOptional()
  customerIds?: string[];
}