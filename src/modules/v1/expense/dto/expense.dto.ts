import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
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
import { ExpenseOption, ExpenseStatus } from 'src/shared/enums/expense.enums';

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

export class CreateExpenseRateDto {
  @ApiProperty({ type: String, example: 'Metro' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @ApiProperty({ enum: ExpenseOption, enumName: 'ExpenseOption' })
  @IsEnum(ExpenseOption)
  expenseOption!: ExpenseOption;

  @ApiProperty({ type: Number, example: 150 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  perDayValue!: number;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Use for employees without a mapping',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateExpenseRateDto extends PartialType(CreateExpenseRateDto) {}

export class EmployeeRateQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search by employeeId / name / man number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchText?: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Filter by rateId; "NONE" for unmapped employees',
  })
  @IsOptional()
  @IsString()
  expenseRateId?: string;
}

export class AssignEmployeeRateDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  employeeIds!: string[];

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'rateId to map; null clears the mapping (default rate applies)',
  })
  @IsOptional()
  @IsString()
  expenseRateId?: string | null;
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
