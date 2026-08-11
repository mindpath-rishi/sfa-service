import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVanChangeRequestDto {
  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  workSessionId!: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  requestedVanId!: string;

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
