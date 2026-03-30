import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateActivityDto {
  /**
   * CreateActivityDto
   */

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  workSessionId: string;

  /**
   * ✅ Required only if activityName = Retailing
   */
  @ApiPropertyOptional({ type: String })
  @ValidateIf((o) => o.activityName === 'Retailing')
  @IsNotEmpty({ message: 'routeId is required for Retailing activity' })
  @IsString()
  routeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * ✅ Required only if activityName = Retailing
   */
  @ApiPropertyOptional({ type: Number })
  @ValidateIf((o) => o.activityName === 'Retailing')
  @IsNotEmpty({ message: 'totalShops is required for Retailing activity' })
  @IsNumber({}, { message: 'totalShops must be a number' })
  totalShops?: number;
}
