import { NonSaleStatus } from 'src/shared/enums/non-sale.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';


export class UpdateNonSaleDto {
/**
 * UpdateNonSaleDto
 * =================
 * Data Transfer Object for updating NonSale records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  visitId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  outletId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String, description: 'Array of Reference IDs' })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reasonCategory?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  reasonCode?: string;

  /**
   * Remark
   * ------
   * 🔗 Link with ShopVisit (single source of truth)
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  /**
   * Status
   * ------
   * Salesman / User
   */
  @ApiPropertyOptional({ enum: NonSaleStatus, default: NonSaleStatus.COMPLETED, description: 'Salesman / User' })
  @IsOptional()
  @IsEnum(NonSaleStatus)
  status?: NonSaleStatus;

}
