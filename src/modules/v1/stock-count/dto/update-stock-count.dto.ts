import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateStockCountDto } from './create-stock-count.dto';

/**
 * UpdateStockCountDto
 * =================
 * DTO for updating StockCount
 */
export class UpdateStockCountDto extends PartialType(
  OmitType(CreateStockCountDto, [] as const),
) {}
