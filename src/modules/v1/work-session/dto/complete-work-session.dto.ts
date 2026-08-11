import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { LocationPointDto } from 'src/shared/dto/location-point.dto';

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
