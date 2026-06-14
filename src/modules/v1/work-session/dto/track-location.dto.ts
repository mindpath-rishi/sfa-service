import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { LocationPointDto } from 'src/shared/dto/location-point.dto';

export class TrackLocationDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  workSessionId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ type: LocationPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationPointDto)
  location?: LocationPointDto;
}

export class CompleteWorkSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  carryForwardStock?: any;

  @ApiPropertyOptional({ type: LocationPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationPointDto)
  dayEndLocation?: LocationPointDto;
}
