import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSaleItemDto {
  /**
   * CreateSalesItemDto
   * =================
   * Data Transfer Object for creating new SalesItem records
   */
  // @ApiProperty({ type: String, description: 'Business identifier for sale' })
  // @IsNotEmpty()
  // @IsString()
  // saleId!: string;

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiProperty({ type: String, description: 'Company code' })
  @IsNotEmpty()
  @IsString()
  compCode!: string;

  @ApiProperty({ type: String, description: 'Child categoryId' })
  @IsNotEmpty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ type: String, description: 'Parent categoryId' })
  @IsNotEmpty()
  @IsString()
  parentCategoryId!: string;

  @ApiProperty({ type: String, description: 'Customer categoryId' })
  @IsNotEmpty()
  @IsString()
  customerCategoryId!: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['Y', 'N'],
    description: 'Focused-pack snapshot from the product master',
  })
  @IsOptional()
  @IsString()
  isFocusedPack?: string;

  @ApiProperty({ type: String })
  @IsNotEmpty()
  @IsString()
  productName!: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  caseQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  pieceQty?: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  quantity!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  casePrice!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  piecePrice!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  caseNetWeight!: number;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  pieceNetWeight!: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalNetWeight?: number;

  @ApiPropertyOptional({
    type: Number,
    description: 'Gross line value before scheme discount',
  })
  @IsOptional()
  @IsNumber()
  grossValue?: number;

  /**
   * TotalValue
   * ----------
   * 🔥 Base (source of truth)
   */
  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  totalValue?: number;

  /**
   * UnitQtyInCase
   * -------------
   * 🔥 Derived snapshot
   */
  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  unitQtyInCase!: number;

  @ApiPropertyOptional({
    type: String,
    description: 'Applied scheme business identifier',
  })
  @IsOptional()
  @IsString()
  schemeId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  schemeName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  schemeType?: string;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  schemeMinimumQuantity?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  schemeDiscountPercent?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  schemeDiscountValue?: number;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @IsNumber()
  schemeBuyQty?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  schemeDiscountAmount?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  schemeFreeQty?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  schemeFreeProductId?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  schemeFreeProductName?: string;
}
