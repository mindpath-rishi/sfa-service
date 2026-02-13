import { DailyInventoryStatus } from 'src/shared/enums/daily-inventory.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateDailyInventoryDto {
  /**
   * CreateDailyInventoryDto
   * =================
   * Data Transfer Object for creating new DailyInventory records
   */
  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  date: Date;

  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  adjustmentQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  closingQty?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    enum: DailyInventoryStatus,
    default: DailyInventoryStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(DailyInventoryStatus)
  status?: DailyInventoryStatus;
}
