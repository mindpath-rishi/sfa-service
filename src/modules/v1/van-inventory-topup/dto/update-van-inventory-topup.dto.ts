import { VanInventoryTopupStatus } from 'src/shared/enums/van-inventory-topup.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateVanInventoryTopupDto {
  /**
   * UpdateVanInventoryTopupDto
   * =================
   * Data Transfer Object for updating VanInventoryTopup records
   *
   * All fields are optional for partial updates
   * Supports partial updates - omitted fields will retain their existing values
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalRequestedQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalRequestedWeight?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalRequestedValue?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalApprovedQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalApprovedWeight?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalApprovedValue?: number;

  /**
   * Remark
   * ------
   * Business date of top-up (UTC)
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    enum: VanInventoryTopupStatus,
    default: VanInventoryTopupStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(VanInventoryTopupStatus)
  status?: VanInventoryTopupStatus;
}
