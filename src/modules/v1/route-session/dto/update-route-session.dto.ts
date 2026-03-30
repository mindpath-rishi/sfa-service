import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';

export class UpdateRouteSessionDto {
  /**
   * UpdateRouteSessionDto
   * =================
   * Data Transfer Object for updating RouteSession records
   *
   * All fields are optional for partial updates
   * Supports partial updates - omitted fields will retain their existing values
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userName?: string;

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
  routeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalShops?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  visitedShops?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  remainingShops?: number;

  @ApiPropertyOptional({
    enum: RouteSessionStatus,
    default: RouteSessionStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(RouteSessionStatus)
  status?: RouteSessionStatus;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  startTime?: Date;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  endTime?: Date;
}
