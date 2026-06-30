import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { SegmentationStatus } from 'src/shared/enums/segmentation.enums';

export class SegmentationQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Search by ID or name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ enum: SegmentationStatus })
  @IsOptional()
  @IsEnum(SegmentationStatus)
  status?: SegmentationStatus;
}
