import { PartialType, OmitType } from '@nestjs/swagger';
import { CreatePriceDto } from './create-price.dto';

/**
 * UpdatePriceDto
 * =================
 * DTO for updating Price
 */
export class UpdatePriceDto extends PartialType(
  OmitType(CreatePriceDto, [] as const),
) {}
