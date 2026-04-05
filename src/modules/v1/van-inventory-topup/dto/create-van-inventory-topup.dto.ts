import { VanInventoryTopupStatus } from 'src/shared/enums/van-inventory-topup.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVanInventoryTopupItemDto } from '../../van-inventory-topup-item/dto/create-van-inventory-topup-item.dto';

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

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  vanName: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for warehouse',
  })
  @IsNotEmpty()
  @IsString()
  warehouseId: string;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

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

  /**
   * Items
   */
  @ApiProperty({
    type: [CreateVanInventoryTopupItemDto],
    description: 'List of products for top-up',
    default: [],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVanInventoryTopupItemDto)
  items: CreateVanInventoryTopupItemDto[];
}
