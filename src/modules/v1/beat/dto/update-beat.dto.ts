import { BeatStatus } from 'src/shared/enums/beat.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';

export class UpdateBeatDto {
/**
 * Beat Update DTO
 * ====================
 * Data Transfer Object for updating Beat records
 * 
 * All fields are optional for partial updates
 */
  /**
   * Name
   * ----
   * Display name of beat
   */

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
  /**
   * Status
   * ------
   * Beat availability status
   */

  @ApiPropertyOptional({ example: BeatStatus.ACTIVE, enum: BeatStatus })
  @IsOptional()
  @IsEnum(BeatStatus)
  status?: BeatStatus;

}
