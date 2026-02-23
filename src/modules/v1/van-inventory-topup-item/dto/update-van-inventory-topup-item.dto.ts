import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class UpdateVanInventoryTopupItemDto {
/**
 * UpdateVanInventoryTopupItemDto
 * =================
 * Data Transfer Object for updating VanInventoryTopupItem records
 * 
 * All fields are optional for partial updates
 * Supports partial updates - omitted fields will retain their existing values
 */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  vanInventoryTopupId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  requestedQty?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  requestedValue?: number;

  /**
   * ApprovedQty
   * -----------
   * Van Inventory Top-Up reference (van_inventory_topup.vanInventoryTopupId)
   */
  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  approvedQty?: number;

  /**
   * ApprovedWeight
   * --------------
   * Product reference (product_master.productId)
   */
  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedWeight?: number;

  @ApiPropertyOptional({ type: Number , default: 0 })
  @IsOptional()
  @IsNumber()
  approvedValue?: number;

  /**
   * ProductPrice
   * ------------
   * Requested weight = requestedQty * product_master.netWeight
   */
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  productPrice?: number;

  /**
   * ProductNetWeight
   * ----------------
   * Requested value = requestedQty * product_master.price
   */
  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  productNetWeight?: number;

  /**
   * Remark
   * ------
   * Approved quantity
   */
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

}
