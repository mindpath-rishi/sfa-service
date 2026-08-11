import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVanChangeRequestDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  requestedVanId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  requestedVanName?: string;

  @ApiPropertyOptional({ type: String, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
