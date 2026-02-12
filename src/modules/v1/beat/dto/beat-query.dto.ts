import { BeatStatus } from 'src/shared/enums/beat.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

/**
 * Beat Query DTO
 * ===================
 * Data Transfer Object for querying Beat records
 * 
 * Extends PaginationDto for pagination support
 */
export class BeatQueryDto extends PaginationDto {
  /**
   * SearchText
   * ----------
   * Search by name, code, or identifier
   */

  @ApiPropertyOptional({ description: "Search by name, code, or identifier" })
  @IsOptional()
  @IsString()
  searchText?: string;
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
