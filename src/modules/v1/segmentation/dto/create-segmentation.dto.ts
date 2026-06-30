import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SegmentationStatus } from 'src/shared/enums/segmentation.enums';

export class CreateSegmentationDto {
  @ApiProperty({ example: 'Premium' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ enum: SegmentationStatus })
  @IsOptional()
  @IsEnum(SegmentationStatus)
  status?: SegmentationStatus;
}
