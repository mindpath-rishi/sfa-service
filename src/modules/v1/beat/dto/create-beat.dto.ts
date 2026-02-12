import { BeatStatus } from 'src/shared/enums/beat.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';

export class CreateBeatDto {
/**
 * Beat Create DTO
 * ====================
 * Data Transfer Object for creating new Beat records
 */
  /**
   * Name
   * ----
   * Display name of beat
   */

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  name: string;
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
