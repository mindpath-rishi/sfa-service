
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateRouteSessionDto {
  @ApiProperty({
    type: String,
    description: 'Business identifier for work session',
  })
  @IsNotEmpty()
  @IsString()
  workSessionId: string;

  @ApiProperty({ type: String, description: 'Business identifier for route' })
  @IsNotEmpty()
  @IsString()
  routeId: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeName?: string;

  @ApiPropertyOptional({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  totalShops?: number;
}
