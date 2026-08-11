import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateVanErpClosingDto } from './create-van-erp-closing.dto';

/**
 * UpdateVanErpClosingDto
 * =================
 * DTO for updating VanErpClosing
 */
export class UpdateVanErpClosingDto extends PartialType(
  OmitType(CreateVanErpClosingDto, [] as const),
) {}
