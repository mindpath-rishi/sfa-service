import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateTargetDto } from './create-target.dto';

/**
 * UpdateTargetDto
 * =================
 * DTO for updating Target
 */
export class UpdateTargetDto extends PartialType(
  OmitType(CreateTargetDto, [] as const),
) {}
