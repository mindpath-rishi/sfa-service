import { RouteStatus } from 'src/shared/enums/route.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class RouteQueryDto extends PaginationDto {
  /**
   * SearchText
   * ----------
   * Search by name, code, or identifier
   */
  @ApiPropertyOptional({ description: "Search by name, code, or identifier", example: "search term" })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  beatId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  distance?: number;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(RouteStatus)
  status?: RouteStatus;

}