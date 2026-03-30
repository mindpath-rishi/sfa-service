import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';


export class CreateShopVisitDto {
/**
 * CreateShopVisitDto
 * =================
 * Data Transfer Object for creating new ShopVisit records
 */
  @ApiProperty({ type: String, description: 'Business identifier for routeSession' })
  @IsNotEmpty()
  @IsString()
  routeSessionId: string;

  @ApiProperty({ type: String, description: 'Business identifier for user' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanName?: string;

  @ApiProperty({ type: String, description: 'Business identifier for shop' })
  @IsNotEmpty()
  @IsString()
  shopId: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  shopName?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  sequence?: number;

  @ApiProperty({ type: Date })
  @IsNotEmpty()
  @IsDate()
  checkInTime: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  checkOutTime?: Date;

  @ApiPropertyOptional({ enum: ShopVisitStatus, default: ShopVisitStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ShopVisitStatus)
  status?: ShopVisitStatus;

}
