import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiUnauthorizedResponse } from 'src/core/swagger/api-error.response.swagger';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@ApiUnauthorizedResponse()
@Controller({
  path: API_MODULE.DASHBOARD,
  version: V1,
})
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get MIS dashboard summary' })
  getSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getSummary(query);
  }

  @Get('executive')
  @ApiOperation({ summary: 'Get executive MIS dashboard data' })
  getExecutive(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getExecutive(query);
  }
}
