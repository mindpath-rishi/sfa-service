import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ProductivityReportExcelQueryDto {
  /**
   * Inclusive UTC start date.
   *
   * Example:
   * 2026-08-01
   */
  @IsDateString()
  startDate!: string;

  /**
   * Inclusive UTC end date.
   *
   * Example:
   * 2026-08-31
   */
  @IsDateString()
  endDate!: string;

  /**
   * Optional Employee.employeeId filter.
   */
  @IsOptional()
  @IsString()
  employeeId?: string;
}
