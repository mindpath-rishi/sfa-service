import { InventoryStatus } from 'src/shared/enums/inventory.enums';

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';

export class InventoryQueryDto extends PaginationDto {
  /**
   * SearchText
   * ----------
   * Search by name, code, or identifier
   */
  @ApiPropertyOptional({ description: "Search by name, code, or identifier", example: "search term" })
  @IsOptional()
  @IsString()
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  quantity?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  reservedQuantity?: number;

  @ApiPropertyOptional({ type: Date })
  @IsOptional()
  @IsDate()
  settlementDate?: Date;

  @ApiPropertyOptional({ description: "Filter by status" })
  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

}