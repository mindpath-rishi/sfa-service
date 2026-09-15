import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { V1 } from 'src/shared/constants/api.constants';
import { EmployeeService } from '../employee/employee.service';
// import {
//   ProductPerformanceReportQueryDto,
//   TimelineReportQueryDto,
//   VehicleBreakdownReportQueryDto,
// } from './dto/timeline-report-query.dto';
import { Public } from 'src/core/decorators/public.decorator';
import { ScriptService } from './script.service';

@ApiTags('Scripts')
@Controller({
  path: 'scripts',
  version: V1,
})
export class ScriptController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly scriptService: ScriptService,
  ) {}

  @Public()
  @Get('productivity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare productivity reports' })
  prepareProductivityReports() {
    return this.scriptService.prepareProductivityReports();
  }
}
