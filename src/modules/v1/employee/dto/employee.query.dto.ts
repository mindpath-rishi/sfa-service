/**
 * Employee Query DTO
 * ------------------
 * Purpose : Filter and paginate employee records
 * Used by : EMPLOYEE LIST / ADMIN MANAGEMENT SCREENS
 *
 * Supports:
 * - Status-based filtering
 * - Role-based filtering
 * - Reporting manager filtering
 * - Free-text search
 * - Pagination (via PaginationDto)
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
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
   * Role ID
   * -------
   * Purpose : Filter employees by assigned role
   */
  @ApiPropertyOptional({
    example: 'ROLE_MANAGER',
    description: 'Filter employees by role ID',
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    example: 'DESIG-001',
    description: 'Filter employees by designation ID',
  })
  @IsOptional()
  @IsString()
  designationId?: string;

  /**
   * Reports To
   * ----------
   * Purpose : Filter employees by direct reporting manager
   */
  @ApiPropertyOptional({
    example: 'EMP00001',
    description: 'Filter employees by reporting manager employee ID',
  })
  @IsOptional()
  @IsString()
  reportingEmployeeId?: string;

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

  @ApiPropertyOptional({
    example: 'primary',
    description: 'Sort column key from the listing UI',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    example: 'asc',
    description: 'Sort direction: asc or desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
