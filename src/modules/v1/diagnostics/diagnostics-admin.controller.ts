import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdminGuard } from 'src/core/guards/super-admin.guard';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { AppConfigDto, CreateCommandDto, DebugLoggingDto, DevicesQueryDto } from './dto/diagnostics.dto';
import { DiagnosticsService } from './diagnostics.service';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';

/** Devices, app versions and remote controls, for Super Admin in MIS. */
@ApiTags('Diagnostics (admin)')
@UseGuards(SuperAdminGuard)
@BackOfficeOnly()
@Controller({ path: `${API_MODULE.DIAGNOSTICS}/admin`, version: V1 })
export class DiagnosticsAdminController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Get('devices')
  @ApiOperation({ summary: 'Phones with their latest health, filterable by problem' })
  devices(@Query() query: DevicesQueryDto) {
    return this.diagnosticsService.devices(query);
  }

  @Get('devices/:userId')
  @ApiOperation({ summary: "One user's phones, commands and diagnostic reports" })
  device(@Param('userId') userId: string) {
    return this.diagnosticsService.deviceDetail(userId);
  }

  @Get('reports/:reportId')
  @ApiOperation({ summary: 'A diagnostic report with app logs and sync queue' })
  report(@Param('reportId') reportId: string) {
    return this.diagnosticsService.report(reportId);
  }

  @Post('commands')
  @ApiOperation({ summary: 'Ask a phone to send diagnostics, re-download data or log out' })
  command(@Body() dto: CreateCommandDto) {
    return this.diagnosticsService.createCommand(dto);
  }

  @Delete('commands/:commandId')
  @ApiOperation({ summary: 'Cancel a command the phone has not picked up' })
  cancel(@Param('commandId') commandId: string) {
    return this.diagnosticsService.cancelCommand(commandId);
  }

  @Get('app-config')
  @ApiOperation({ summary: 'Minimum and latest app version' })
  appConfig() {
    return this.diagnosticsService.getAppConfig();
  }

  @Put('app-config')
  @ApiOperation({ summary: 'Set minimum / latest app version and the update message' })
  updateAppConfig(@Body() dto: AppConfigDto) {
    return this.diagnosticsService.updateAppConfig(dto);
  }

  @Get('debug-logging')
  @ApiOperation({ summary: 'Users with debug logging switched on' })
  debugUsers() {
    return this.diagnosticsService.debugLoggingUsers();
  }

  @Post('debug-logging')
  @ApiOperation({ summary: 'Store debug-level logs for one user for a while' })
  enableDebug(@Body() dto: DebugLoggingDto) {
    return this.diagnosticsService.enableDebugLogging(dto);
  }

  @Delete('debug-logging/:userId')
  @ApiOperation({ summary: 'Stop debug logging for a user' })
  disableDebug(@Param('userId') userId: string) {
    return this.diagnosticsService.disableDebugLogging(userId);
  }
}
