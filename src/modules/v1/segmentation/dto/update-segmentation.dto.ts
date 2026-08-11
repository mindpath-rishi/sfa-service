import { PartialType } from '@nestjs/swagger';
import { CreateSegmentationDto } from './create-segmentation.dto';

export class UpdateSegmentationDto extends PartialType(CreateSegmentationDto) {}
