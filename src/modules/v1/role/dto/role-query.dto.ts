import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Status } from 'src/shared/enums/app.enum';

export class RoleQueryDto {
  /* ================= STATUS FILTER ================= */

  @ApiPropertyOptional({
    enum: Status,
    description: 'Filter roles by status',
  })
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /* ================= SEARCH ================= */

  @ApiPropertyOptional({
    example: 'admin',
    description: 'Search by role name or description',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  searchText?: string;

  /* ================= PAGINATION ================= */

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number (starts from 1)',
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 20,
    description: 'Number of records per page',
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
