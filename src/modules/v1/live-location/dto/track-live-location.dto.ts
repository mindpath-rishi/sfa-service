import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
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
}
