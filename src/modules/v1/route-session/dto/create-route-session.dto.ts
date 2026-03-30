
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
  workSessionId: String;

  @ApiProperty({ type: String, description: 'Business identifier for route' })
  @IsNotEmpty()
  @IsString()
  routeId: String;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  routeName?: String;

  @ApiPropertyOptional({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  totalShops?: Number;
}
