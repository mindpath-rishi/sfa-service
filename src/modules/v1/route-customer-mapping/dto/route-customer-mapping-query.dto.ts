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
import {
  Days,
  RouteCustomerMappingStatus,
} from 'src/shared/enums/route-customer-mapping.enums';

/**
 * RouteCustomerMappingQueryDto
 * =================
 * Data Transfer Object for querying RouteCustomerMapping records
 *
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class RouteCustomerMappingQueryDto extends PaginationDto {
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
    description: 'Business identifier for mapping',
  })
  @IsOptional()
  @IsString()
  mappingId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    type: Number,
    description: 'Supports operators: gt, gte, lt, lte',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  sequence?: number;

  @ApiPropertyOptional({ enum: Days, description: 'Filter by day' })
  @IsOptional()
  day?: Days;

  @ApiPropertyOptional({
    enum: RouteCustomerMappingStatus,
    description: 'Filter by status',
    default: RouteCustomerMappingStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RouteCustomerMappingStatus)
  status?: RouteCustomerMappingStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveFrom?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  effectiveTo?: Date;
}
