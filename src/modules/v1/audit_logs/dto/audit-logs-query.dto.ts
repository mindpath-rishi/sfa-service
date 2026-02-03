/**
 * Audit Logs Query DTO
 * -------------------
 * Purpose : Filter and paginate audit log records
 * Used by : AUDIT LOG LISTING / ADMIN ACTIVITY SCREENS
 *
 * Supports:
 * - Entity-based filtering
 * - Action-based filtering
 * - Performer-based filtering
 * - Date range filtering
 * - Text search
 * - Pagination
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';

export class AuditLogsQueryDto {
  /**
   * Entity Name
   * -----------
   * Purpose : Filter logs by entity type
   * Example : Customer, Order, Product
   */
  @ApiPropertyOptional({ example: 'Customer' })
  @IsOptional()
  @IsString()
  entity?: string;

  /**
   * Entity ID
   * ---------
   * Purpose : Filter logs by specific entity ID
   * Example : CID-1A2B3C4D
   */
  @ApiPropertyOptional({ example: 'CID-1A2B3C4D' })
  @IsOptional()
  @IsString()
  entityId?: string;

  /**
   * Action Type
   * -----------
   * Purpose : Filter logs by action performed
   * Example : CREATE, UPDATE, DELETE
   */
  @ApiPropertyOptional({ example: 'UPDATE' })
  @IsOptional()
  @IsString()
  action?: string;

  /**
   * Performed By
   * ------------
   * Purpose : Filter logs by the user who performed the action
   * Example : EID-9F8E7D6C
   */
  @ApiPropertyOptional({
    example: 'EID-9F8E7D6C',
    description: 'Employee ID who performed the action',
  })
  @IsOptional()
  @IsString()
  performedBy?: string;

  /**
   * Search Text
   * -----------
   * Purpose : Search across entityId or performer ID
   * Example : CID, EID
   */
  @ApiPropertyOptional({
    example: 'CID',
    description: 'Search by entityId or performer',
  })
  @IsOptional()
  @IsString()
  searchText?: string;

  /**
   * From Date
   * ---------
   * Purpose : Start date for audit log filtering
   * Format  : YYYY-MM-DD
   */
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  from?: string;

  /**
   * To Date
   * -------
   * Purpose : End date for audit log filtering
   * Format  : YYYY-MM-DD
   */
  @ApiPropertyOptional({ example: '2026-01-31' })
  @IsOptional()
  @IsString()
  to?: string;

  /**
   * Page Number
   * -----------
   * Purpose : Pagination page index
   * Default : 1
   */
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumberString()
  page?: number;

  /**
   * Page Size
   * ---------
   * Purpose : Number of records per page
   * Default : 20
   */
  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: number;
}
