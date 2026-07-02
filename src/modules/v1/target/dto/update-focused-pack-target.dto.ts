import { PartialType } from '@nestjs/swagger';
import { CreateFocusedPackTargetDto } from './create-focused-pack-target.dto';

export class UpdateFocusedPackTargetDto extends PartialType(
  CreateFocusedPackTargetDto,
) {}
