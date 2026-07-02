import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional } from 'class-validator';

export class LocationPointDto {
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  accuracy?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  altitude?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ type: Number, description: 'Direction in degrees from true north' })
  @IsOptional()
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  capturedAt?: Date;
}
