import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SuperAdminGuard } from 'src/core/guards/super-admin.guard';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { AlertsService } from './alerts.service';
import { HealthService } from './health.service';
import { ReconciliationService } from './reconciliation.service';

class AlertsQueryDto {
  @IsOptional() @IsIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ALL']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

class AckDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

class ReportsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

/** System health, alerts and nightly reconciliation, for Super Admin. */
@ApiTags('Monitoring')
@UseGuards(SuperAdminGuard)
@Controller({ path: API_MODULE.MONITORING, version: V1 })
export class MonitoringController {
  constructor(
    private readonly health: HealthService,
    private readonly alerts: AlertsService,
    private readonly reconciliation: ReconciliationService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Databases, ERP, process, disk, traffic, sync and phones' })
  getHealth() {
    return this.health.health();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Open (default), acknowledged or resolved alerts' })
  listAlerts(@Query() query: AlertsQueryDto) {
    return this.alerts.list(query.status, query.page, query.limit);
  }

  @Post('alerts/run')
  @ApiOperation({ summary: 'Run the alert check now' })
  async runAlerts() {
    return { statusCode: 200, message: 'Alert check complete', data: await this.alerts.evaluate('manual') };
  }

  @Post('alerts/:alertId/ack')
  @ApiOperation({ summary: 'Acknowledge an alert (it still resolves on its own)' })
  ack(@Param('alertId') alertId: string, @Body() dto: AckDto) {
    return this.alerts.acknowledge(alertId, dto.note);
  }

  @Get('reconciliation')
  @ApiOperation({ summary: 'Nightly reconciliation reports (trend)' })
  reports(@Query() query: ReportsQueryDto) {
    return this.reconciliation.list(query.days);
  }

  @Post('reconciliation/run')
  @ApiOperation({ summary: 'Run reconciliation now over the last day' })
  async runReconciliation() {
    const report = await this.reconciliation.run('manual');
    return { statusCode: 200, message: 'Reconciliation complete', data: { ...report, findings: undefined } };
  }

  @Get('reconciliation/:reportId')
  @ApiOperation({ summary: 'One reconciliation report with its findings' })
  report(@Param('reportId') reportId: string) {
    return this.reconciliation.get(reportId);
  }
}
