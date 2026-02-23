import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';


export class CreateVanInventoryTopupItemDto {
/**
 * CreateVanInventoryTopupItemDto
 * =================
 * Data Transfer Object for creating new VanInventoryTopupItem records
 */
  @ApiProperty({ type: String, description: 'Business identifier for vanInventoryTopup' })
  @IsNotEmpty()
  @IsString()
  vanInventoryTopupId: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0001)
  requestedQty: number;

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
  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  productPrice: number;

  /**
   * ProductNetWeight
   * ----------------
   * Requested value = requestedQty * product_master.price
   */
  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  productNetWeight: number;

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
