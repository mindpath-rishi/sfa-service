/**
 * Employee Query DTO
 * ------------------
 * Purpose : Filter and paginate employee records
 * Used by : EMPLOYEE LIST / ADMIN MANAGEMENT SCREENS
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
import { Type } from 'class-transformer';
import { Status } from 'src/shared/enums/app.enums';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class EmployeeQueryDto extends PaginationDto {
  /**
   * Employee Status
   * ---------------
   * Purpose : Filter employees by current status
   * Example : ACTIVE, INACTIVE, BLOCKED
   */
  @ApiPropertyOptional({
    enum: Status,
    description: 'Filter employees by status',
  })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /**
   * Search Text
   * -----------
   * Purpose : Perform free-text search across employee fields
   *
   * Searches:
   * - employeeId
   * - name
   * - mobile
   * - email
   *
   * Constraints:
   * - Max length : 50 characters
   */
  @ApiPropertyOptional({
    example: 'john',
    description: 'Search by employeeId, name, mobile, or email',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  searchText?: string;
}
