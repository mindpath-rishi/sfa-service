import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LocationPointDto } from 'src/shared/dto/location-point.dto';

export class CreateWorkSessionDto {
  /**
   * CreateWorkSessionDto
   */

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  activityName!: string;

  /**
   * ✅ Required only if activityName = Retailing
   */
  @ApiPropertyOptional({ type: String })
  // @ValidateIf((o) => o.activityName === 'Retailing')
  // @IsNotEmpty({ message: 'routeId is required for Retailing activity' })
  @IsOptional()
  routeId?: string;

  @ApiPropertyOptional({ type: String })
  @ValidateIf((o) => o.activityName === 'Retailing')
  @IsNotEmpty({ message: 'routeId is required for Retailing activity' })
  @IsString()
  vanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  customerCategoryId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * ✅ Required only if activityName = Retailing
   */
  @ApiPropertyOptional({ type: Number })
  // @ValidateIf((o) => o.activityName === 'Retailing')
  // @IsNotEmpty({ message: 'totalShops is required for Retailing activity' })
  @IsOptional()
  totalShops?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  dayStartImageMediaId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  dayStartImageUrl?: string;

  @ApiPropertyOptional({ type: LocationPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationPointDto)
  dayStartLocation?: LocationPointDto;
}
