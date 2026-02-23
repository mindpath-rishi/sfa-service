import { VanInventoryTopupStatus } from 'src/shared/enums/van-inventory-topup.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateVanInventoryTopupDto {
/**
 * CreateVanInventoryTopupDto
 * =================
 * Data Transfer Object for creating new VanInventoryTopup records
 */
  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for warehouse' })
  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalRequestedQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalRequestedWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalRequestedValue?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalApprovedQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  totalApprovedWeight?: number;

  /**
   * TotalApprovedValue
   * ------------------
   * Van reference (vans.vanId)
   */
  @ApiPropertyOptional({ type: Number , default: 0 })
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

  @ApiPropertyOptional({ enum: VanInventoryTopupStatus, default: VanInventoryTopupStatus.DRAFT })
  @IsOptional()
  @IsEnum(VanInventoryTopupStatus)
  status?: VanInventoryTopupStatus;

}
