import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * WorkSessionQueryDto
 * =================
 * Data Transfer Object for querying WorkSession records
 * 
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class WorkSessionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Search by name, code, or identifier (supports partial matching)", example: "search term" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String, description: 'Business identifier for workSession' })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String , description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  dayStartTime?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  dayEndTime?: Date;

  @ApiPropertyOptional({ enum: WorkSessionStatus, description: 'Filter by status', default: WorkSessionStatus.ACTIVE })
  @IsOptional()
  @IsEnum(WorkSessionStatus)
  status?: WorkSessionStatus;

}