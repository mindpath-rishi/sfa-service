/**
 * Role Query DTO
 * --------------
 * Purpose : Filter and paginate role records
 * Used by : ROLE LIST / ACCESS CONTROL MANAGEMENT SCREENS
 *
 * Supports:
 * - Status-based filtering
 * - Free-text search
 * - Pagination (via PaginationDto)
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Status } from 'src/shared/enums/app.enums';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class RoleQueryDto extends PaginationDto {
  /**
   * Role Status
   * -----------
   * Purpose : Filter roles by current status
   * Example : ACTIVE, INACTIVE
   */
  @ApiPropertyOptional({
    enum: Status,
    description: 'Filter roles by status',
  })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /**
   * Search Text
   * -----------
   * Purpose : Perform free-text search across role fields
   *
   * Searches:
   * - role name
   * - role description
   *
   * Constraints:
   * - Max length : 50 characters
   */
  @ApiPropertyOptional({
    example: 'admin',
    description: 'Search by role name or description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  searchText?: string;

  @ApiPropertyOptional({
    example: 'name',
    description: 'Sort field',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string;

  @ApiPropertyOptional({
    example: 'asc',
    enum: ['asc', 'desc'],
    description: 'Sort direction',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
