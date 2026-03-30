
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';

/**
 * RouteSessionQueryDto
 * =================
 * Data Transfer Object for querying RouteSession records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class RouteSessionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for routeSession' })
  @IsOptional()
  @IsString()
  routeSessionId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by van ID' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanName?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by route ID' })
  @IsOptional()
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  totalShops?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  visitedShops?: number;

  @ApiPropertyOptional({ type: Number , description: "Supports operators: gt, gte, lt, lte", example: 10 })
  @IsOptional()
  @IsNumber()
  remainingShops?: number;

  @ApiPropertyOptional({ enum: RouteSessionStatus, description: 'Filter by status', default: RouteSessionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(RouteSessionStatus)
  status?: RouteSessionStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  startTime?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  endTime?: Date;

}