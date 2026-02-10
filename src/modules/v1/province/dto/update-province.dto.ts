/**
 * Province Update DTO
 * -------------------
 * Purpose : Update existing province
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ProvinceStatus } from 'src/shared/enums/province.enums';

export class UpdateProvinceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: ProvinceStatus.ACTIVE, enum: ProvinceStatus })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'Country ID reference' })
  @IsOptional()
  @IsString()
  countryId?: string;
}
