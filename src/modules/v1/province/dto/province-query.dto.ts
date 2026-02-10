/**
 * Province Query DTO
 * ------------------
 * Purpose : Filter and paginate provinces
 * Used by : PROVINCE LISTING / ADMIN SCREENS
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ProvinceStatus } from 'src/shared/enums/province.enums';

export class ProvinceQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'Madhya Pradesh',
    description: 'Search text for province name',
  })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ example: 'Country ID reference' })
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional({
    example: ProvinceStatus.ACTIVE,
    description: 'Filter by province status',
    enum: ProvinceStatus,
  })
  @IsOptional()
  @IsString()
  status?: string;
}
