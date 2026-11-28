import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from 'src/shared/dto/pagination.dto';
import { ExpenseStatus, ExpenseTag } from 'src/shared/enums/expense.enums';

export class ExpenseQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search by expenseId / name / man number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: ExpenseStatus, enumName: 'ExpenseStatus' })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional({ description: 'Requested date from (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'Requested date to (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;
}

export class UpdateExpenseStatusDto {
  @ApiProperty({ enum: ExpenseStatus, enumName: 'ExpenseStatus' })
  @IsEnum(ExpenseStatus)
  status!: ExpenseStatus;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class ExpenseRateItemDto {
  @ApiProperty({ enum: ExpenseTag, enumName: 'ExpenseTag' })
  @IsEnum(ExpenseTag)
  expenseTag!: ExpenseTag;

  @ApiProperty({ type: Number, example: 150 })
  @IsNumber()
  @Min(0)
  perDayValue!: number;
}

export class UpsertExpenseRatesDto {
  @ApiProperty({ type: [ExpenseRateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpenseRateItemDto)
  rates!: ExpenseRateItemDto[];
}

export class WithdrawalChargeItemDto {
  @ApiProperty({ type: Number, example: 0 })
  @IsNumber()
  @Min(0)
  minAmount!: number;

  @ApiProperty({ type: Number, example: 500 })
  @IsNumber()
  @Min(0)
  maxAmount!: number;

  @ApiProperty({
    type: Number,
    example: 2.5,
    description: 'Charge as a percentage of the base amount (0-100)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  chargePercent!: number;
}

export class ReplaceWithdrawalChargesDto {
  @ApiProperty({ type: [WithdrawalChargeItemDto] })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => WithdrawalChargeItemDto)
  slabs!: WithdrawalChargeItemDto[];
}
