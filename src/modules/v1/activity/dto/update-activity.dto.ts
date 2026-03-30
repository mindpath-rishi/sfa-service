import { ActivityStatus } from 'src/shared/enums/activity.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';


export class UpdateActivityDto {
/**
 * UpdateActivityDto
 * =================
 * Data Transfer Object for updating Activity records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
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

  @ApiPropertyOptional({ enum: ActivityStatus, default: ActivityStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ActivityStatus)
  status?: ActivityStatus;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  subCategory?: string;

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
