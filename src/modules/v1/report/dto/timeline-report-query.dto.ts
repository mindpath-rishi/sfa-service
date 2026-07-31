import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class TimelineReportQueryDto {
  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({
    enum: ['Day Start', 'VanSales Activity', 'Day End (Normal)'],
  })
  @IsOptional()
  @IsIn(['Day Start', 'VanSales Activity', 'Day End (Normal)'])
  type?: 'Day Start' | 'VanSales Activity' | 'Day End (Normal)';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  user?: string;
}

export class ProductPerformanceReportQueryDto {
  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  territory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fieldUser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  primaryCategory?: string;
}

export class VehicleBreakdownReportQueryDto {
  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-07-22' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ enum: ['Yes', 'No'] })
  @IsOptional()
  @IsIn(['Yes', 'No'])
  breakdownStatus?: 'Yes' | 'No';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  surveyZone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  employee?: string;
}
