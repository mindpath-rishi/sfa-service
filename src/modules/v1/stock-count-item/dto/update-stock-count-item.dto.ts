import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateStockCountItemDto } from './create-stock-count-item.dto';

/**
 * UpdateStockCountItemDto
 * =================
 * DTO for updating StockCountItem
 */
export class UpdateStockCountItemDto extends PartialType(
  OmitType(CreateStockCountItemDto, [] as const),
) {}
