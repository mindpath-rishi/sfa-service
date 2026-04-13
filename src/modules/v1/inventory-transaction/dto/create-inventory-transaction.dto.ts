import {
  InventoryTransactionStatus,
  TransactionType,
  Direction,
} from 'src/shared/enums/inventory-transaction.enums';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateInventoryTransactionDto {
  /**
   * CreateInventoryTransactionDto
   * =================
   * DTO for creating Inventory Transactions
   */

  /* ======================================================
   * REFERENCES
   * ====================================================== */

  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId!: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
  })
  @IsNotEmpty()
  @IsString()
  employeeId!: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  /* ======================================================
   * TRANSACTION DETAILS
   * ====================================================== */

  @ApiProperty({ enum: TransactionType })
  @IsNotEmpty()
  @IsEnum(TransactionType)
  transactionType!: TransactionType;

  // ✅ NEW FIELD (MISSING EARLIER)
  @ApiProperty({ enum: Direction, description: 'IN or OUT' })
  @IsNotEmpty()
  @IsEnum(Direction)
  direction!: Direction;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  cases?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  pieces?: number;

  /* ======================================================
   * BUSINESS META
   * ====================================================== */

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({
    type: Date,
    default: Date.now,
  })
  @IsOptional()
  @Type(() => Date) // ✅ important for transformation
  @IsDate()
  transactionDate?: Date;

  /* ======================================================
   * STATUS
   * ====================================================== */

  @ApiPropertyOptional({
    enum: InventoryTransactionStatus,
    example: InventoryTransactionStatus.POSTED,
    default: InventoryTransactionStatus.POSTED,
  })
  @IsOptional()
  @IsEnum(InventoryTransactionStatus)
  status?: InventoryTransactionStatus;
}
