import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { LocationPointDto } from 'src/shared/dto/location-point.dto';

export class TrackLiveLocationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: LocationPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationPointDto)
  location?: LocationPointDto;

  @ApiPropertyOptional({ type: [LocationPointDto], maxItems: 1000 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => LocationPointDto)
  locations?: LocationPointDto[];

  @ApiPropertyOptional({
    description: 'Phone battery % (0-100) when the point was sent',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCharging?: boolean;

  @ApiPropertyOptional({
    description:
      'Stationary keep-alive: marks the user online and refreshes the live marker; not stored as a route point',
  })
  @IsOptional()
  @IsBoolean()
  ping?: boolean;
}
