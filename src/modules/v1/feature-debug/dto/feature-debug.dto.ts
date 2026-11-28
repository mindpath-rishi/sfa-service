import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REPAIR_ACTIONS, type RepairAction } from '../feature-debug.types';

export class InspectQueryDto {
  @ApiProperty({ description: 'Record ID for the chosen feature' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;

  @ApiPropertyOptional({
    description: 'Day to inspect (features that accept a date)',
  })
  @IsOptional()
  @IsISO8601()
  date?: string;
}

export class ScanQueryDto {
  @ApiPropertyOptional({ default: 7, maximum: 90 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;
}

export class RepairDto {
  @ApiProperty({ enum: REPAIR_ACTIONS })
  @IsIn(REPAIR_ACTIONS)
  action!: RepairAction;

  @ApiProperty({
    description:
      'Record the action applies to (sale, work session or employee ID)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  id!: string;

  @ApiProperty({
    description: 'Why this is being done; kept in the repair history',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class SyncPreviewQueryDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(64) employeeId!: string;
  @ApiPropertyOptional({ example: 'outlets' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
