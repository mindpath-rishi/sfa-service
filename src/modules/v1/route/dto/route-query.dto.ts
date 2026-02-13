import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * RouteQueryDto
 * =================
 * Data Transfer Object for querying Route records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class RouteQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for route' })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by beat ID' })
  @IsOptional()
  @IsString()
  beatId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({ enum: RouteStatus, description: 'Filter by status', default: RouteStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}