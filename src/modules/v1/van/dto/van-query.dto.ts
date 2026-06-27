/**
 * Van Query DTO
 * -------------
 * Purpose : Filter and paginate van records
 * Used by : VAN LISTING / ADMIN SCREENS
 */

import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VanStatus } from 'src/shared/enums/van.enums';

export class VanQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'delivery' })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ example: 'delivery' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: VanStatus.ACTIVE, enum: VanStatus })
  @IsOptional()
  @IsEnum(VanStatus)
  status?: VanStatus;

  @ApiPropertyOptional({ example: 'name' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
