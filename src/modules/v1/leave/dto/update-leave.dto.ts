import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateLeaveDto } from './create-leave.dto';

/**
 * UpdateLeaveDto
 * =================
 * DTO for updating Leave
 */
export class UpdateLeaveDto extends PartialType(
  OmitType(CreateLeaveDto, [] as const),
) {}
