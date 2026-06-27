import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  @ApiPropertyOptional({ type: String, description: 'Filter by country ID' })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by province ID' })
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by market ID' })
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by customer category ID' })
  @IsOptional()
  @IsString()
  customerCategoryId?: string;

  @ApiPropertyOptional({
    enum: RouteStatus,
    description: 'Filter by status',
    default: RouteStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

  @ApiPropertyOptional({ example: 'name' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
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
    description: 'Route session id',
    example: 'ROUID98989898',
  })
  @IsOptional()
  @IsString()
  routeSessionId?: string;

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
