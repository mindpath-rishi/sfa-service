import { ActivityStatus } from 'src/shared/enums/activity.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * ActivityQueryDto
 * =================
 * Data Transfer Object for querying Activity records
 *
 * All fields are optional - supports partial matching and range queries
 * Extends PaginationDto for pagination support
 */
export class ActivityQueryDto extends PaginationDto {
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
    description: 'Business identifier for activity',
  })
  @IsOptional()
  @IsString()
  activityId?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Business identifier for work session',
  })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String, description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    enum: ActivityStatus,
    description: 'Filter by status',
    default: ActivityStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  startTime?: Date;

  /**
   * EndTime
   * -------
   * Activity name (e.g., "Meeting", "Development", "Break")
   */
  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  endTime?: Date;
}
