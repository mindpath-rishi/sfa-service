import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { SuperAdminGuard } from 'src/core/guards/super-admin.guard';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { PERMISSIONS } from 'src/shared/constants/permissions.constants';
import {
  SystemLogsDownloadDto,
  SystemLogsQueryDto,
  SystemLogsSummaryDto,
} from './dto/system-logs-query.dto';
import { SystemLogsService } from './system-logs.service';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';

/**
 * Application logs for the MIS System Logs page. Live entries are pushed
 * over the `/system-logs` socket namespace (SystemLogsGateway).
 * Super Admin only: logs expose every user's activity.
 */
@ApiTags('System Logs')
@UseGuards(SuperAdminGuard)
@Permissions(PERMISSIONS.SYSTEM_LOG_VIEW)
@BackOfficeOnly()
@Controller({ path: API_MODULE.SYSTEM_LOGS, version: V1 })
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Search logs (defaults to the last 24 hours)' })
  findAll(@Query() query: SystemLogsQueryDto) {
    return this.systemLogsService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Errors, failing flows and slow requests' })
  summary(@Query() query: SystemLogsSummaryDto) {
    return this.systemLogsService.summary(query.hours);
  }

  @Get('filters')
  @ApiOperation({ summary: 'Flows and contexts seen in the last 7 days' })
  filters() {
    return this.systemLogsService.flows();
  }

  @Get('download')
  @ApiOperation({ summary: 'Download matching logs as .log or .ndjson' })
  download(@Query() query: SystemLogsDownloadDto, @Res() res: Response) {
    return this.systemLogsService.download(query, res);
  }

  @Get('request/:reqId')
  @ApiOperation({ summary: 'All log lines for one request id' })
  trace(@Param('reqId') reqId: string) {
    return this.systemLogsService.trace(reqId);
  }
}
