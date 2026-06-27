import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { DesignationStatus } from 'src/shared/enums/designation.enums';

export class DesignationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ example: 'search text' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  searchText?: string;

  @ApiPropertyOptional({ example: DesignationStatus.ACTIVE, enum: DesignationStatus })
  @IsOptional()
  @IsEnum(DesignationStatus)
  status?: DesignationStatus;

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
}
