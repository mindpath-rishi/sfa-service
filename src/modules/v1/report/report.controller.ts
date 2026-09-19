import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { API_MODULE, V1 } from 'src/shared/constants/api.constants';

import { EmployeeService } from '../employee/employee.service';

import {
  ProductPerformanceReportQueryDto,
  TimelineReportQueryDto,
  VehicleBreakdownReportQueryDto,
} from './dto/timeline-report-query.dto';

import { ProductivityReportExcelQueryDto } from './dto/productivity-report-excel-query.dto';

import { ReportService } from './report.service';

@ApiTags('Reports')
@Controller({
  path: API_MODULE.REPORTS,
  version: V1,
})
export class ReportController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly reportService: ReportService,
  ) {}

  @Get('timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get field-user timeline report',
  })
  timeline(@Query() query: TimelineReportQueryDto) {
    return this.employeeService.getTimelineReport(query);
  }

  @Get('product-performance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get product performance report',
  })
  productPerformance(@Query() query: ProductPerformanceReportQueryDto) {
    return this.employeeService.getProductPerformanceReport(query);
  }

  @Get('vehicle-breakdown')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get vehicle breakdown status report',
  })
  vehicleBreakdown(@Query() query: VehicleBreakdownReportQueryDto) {
    return this.employeeService.getVehicleBreakdownReport(query);
  }

  /* ======================================================
   * PRODUCTIVITY EXCEL
   * ====================================================== */

  @Get('productivity/excel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Export productivity report',
  })
  async exportProductivityReport(
    @Query() query: ProductivityReportExcelQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reportService.getProductivityReportExcel(query);

    res.setHeader('Content-Type', file.mimeType);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );

    res.send(file.buffer);
  }
}
