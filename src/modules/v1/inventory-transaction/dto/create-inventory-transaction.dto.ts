import {
  InventoryTransactionStatus,
  TransactionType,
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

export class CreateInventoryTransactionDto {
  /**
   * CreateInventoryTransactionDto
   * =================
   * Data Transfer Object for creating new InventoryTransaction records
   */
  @ApiProperty({ type: String, description: 'Business identifier for product' })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({ type: String, description: 'Business identifier for van' })
  @IsNotEmpty()
  @IsString()
  vanId: string;

  @ApiProperty({
    type: String,
    description: 'Business identifier for employee',
  })
  @IsNotEmpty()
  @IsString()
  employeeId: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiProperty({ enum: TransactionType })
  @IsNotEmpty()
  @IsEnum(TransactionType)
  transactionType: TransactionType;

  @ApiProperty({ type: Number })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  cases?: number;

  @ApiPropertyOptional({ type: Number, default: 0 })
  @IsOptional()
  @IsNumber()
  pieces?: number;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: Date, default: Date.now })
  @IsOptional()
  @IsDate()
  transactionDate?: Date;

  @ApiPropertyOptional({
    enum: InventoryTransactionStatus,
    example: InventoryTransactionStatus.POSTED,
    default: InventoryTransactionStatus.POSTED,
  })
  @IsOptional()
  @IsEnum(InventoryTransactionStatus)
  status?: InventoryTransactionStatus;
}
