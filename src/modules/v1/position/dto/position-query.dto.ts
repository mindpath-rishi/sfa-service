import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { PositionStatus } from 'src/shared/enums/position.enums';

export class PositionQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'search text' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  searchText?: string;

  @ApiPropertyOptional({
    example: PositionStatus.ACTIVE,
    enum: PositionStatus,
  })
  @IsOptional()
  @IsEnum(PositionStatus)
  status?: PositionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentCategoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by application role ID' })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provinceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  marketId?: string;

  @ApiPropertyOptional({ description: 'Filter by mapped employee ID' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    description: 'Filter by the one-based depth from the root position',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hierarchyDepth?: number;
}
