import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateChannelDto } from './create-channel.dto';

/**
 * UpdateChannelDto
 * =================
 * DTO for updating Channel
 */
export class UpdateChannelDto extends PartialType(
  OmitType(CreateChannelDto, [] as const),
) {}
