/**
 * Province Create DTO
 * -------------------
 * Purpose : Create new province
 * Used by : BACK_OFFICE / ADMIN
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateProvinceDto {
  @ApiProperty({ example: 'Tamil Nadu' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'CID-0001' })
  @IsString()
  countryId: string;
}
