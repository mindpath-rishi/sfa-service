import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';


export class UpdateShopVisitDto {
/**
 * UpdateShopVisitDto
 * =================
 * Data Transfer Object for updating ShopVisit records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  employeeName?: string;

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
  outletId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  outletName?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  sequence?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  checkInTime?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  checkOutTime?: Date;

  @ApiPropertyOptional({ enum: ShopVisitStatus, default: ShopVisitStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ShopVisitStatus)
  status?: ShopVisitStatus;

}
