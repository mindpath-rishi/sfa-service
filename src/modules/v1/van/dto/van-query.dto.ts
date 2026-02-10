/**
 * Van Query DTO
 * -------------
 * Purpose : Filter and paginate van records
 * Used by : VAN LISTING / ADMIN SCREENS
 */

import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class VanQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  searchText?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
