import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { V1 } from 'src/shared/constants/api.constants';
import { EmployeeService } from '../employee/employee.service';
import {
  ProductPerformanceReportQueryDto,
  TimelineReportQueryDto,
  VehicleBreakdownReportQueryDto,
} from './dto/timeline-report-query.dto';
import { Public } from 'src/core/decorators/public.decorator';
import { ReportService } from './report.service';

@ApiTags('Reports')
@Controller({
  path: 'reports',
  version: V1,
})
export class ReportController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly reportService: ReportService,
  ) {}

  @Get('timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get field-user timeline report' })
  timeline(@Query() query: TimelineReportQueryDto) {
    return this.employeeService.getTimelineReport(query);
  }

  @Get('product-performance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product performance report' })
  productPerformance(@Query() query: ProductPerformanceReportQueryDto) {
    return this.employeeService.getProductPerformanceReport(query);
  }

  @Get('vehicle-breakdown')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get vehicle breakdown status report' })
  vehicleBreakdown(@Query() query: VehicleBreakdownReportQueryDto) {
    return this.employeeService.getVehicleBreakdownReport(query);
  }

  @Public()
  @Get('productivity/d1')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare D-1 productivity report' })
  prepareD1ProductivityReport() {
    return this.reportService.prepareD1ProductivityReport();
  }
  @Public()
  @Get('productivity/d-day')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare D-Day productivity report' })
  prepareDDayProductivityReport() {
    return this.reportService.prepareDDayProductivityReport();
  }
}
