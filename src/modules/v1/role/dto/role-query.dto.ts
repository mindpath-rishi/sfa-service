/**
 * Role Query DTO
 * --------------
 * Purpose : Filter and paginate role records
 * Used by : ROLE LIST / ACCESS CONTROL MANAGEMENT SCREENS
 *
 * Supports:
 * - Status-based filtering
 * - Free-text search
 * - Van association limit filters
 * - Pagination (via PaginationDto)
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
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

  /**
   * Exact Van Limit
   * ---------------
   * Purpose : Match roles with an exact van association limit
   *
   * Rules:
   * - -1 = Unlimited
   * -  0 = No vans allowed
   * - >0 = Exact number of vans
   */
  @ApiPropertyOptional({
    example: 1,
    description: 'Exact van limit (-1 = unlimited, 0 = none, N = max N vans)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxAssociatedVans?: number;

  /**
   * Max Van Limit (LTE)
   * ------------------
   * Purpose : Filter roles with van limit less than or equal to a value
   *
   * Example:
   * - 3 → roles allowing up to 3 vans
   */
  @ApiPropertyOptional({
    example: 3,
    description: 'Filter roles with van limit less than or equal to this value',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxAssociatedVansLte?: number;

  /**
   * Min Van Limit (GTE)
   * ------------------
   * Purpose : Filter roles with van limit greater than or equal to a value
   *
   * Example:
   * - 1 → roles allowing at least 1 van
   */
  @ApiPropertyOptional({
    example: 1,
    description:
      'Filter roles with van limit greater than or equal to this value',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-1)
  maxAssociatedVansGte?: number;
}
