import { PartialType } from '@nestjs/swagger';
import { CreateLiveLocationDto } from './create-live-location.dto';

export class UpdateLiveLocationDto extends PartialType(CreateLiveLocationDto) {}
