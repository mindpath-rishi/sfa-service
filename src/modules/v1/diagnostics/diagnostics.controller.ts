import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import {
  CompleteCommandDto,
  DiagnosticReportDto,
  HeartbeatDto,
  MobileErrorsDto,
} from './dto/diagnostics.dto';
import { DiagnosticsService } from './diagnostics.service';

/** Endpoints the mobile app calls for any signed-in user. */
@ApiTags('Diagnostics (app)')
@Controller({ path: API_MODULE.DIAGNOSTICS, version: V1 })
export class DiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  @Post('heartbeat')
  @ApiOperation({
    summary:
      'Phone health check-in; returns update status and pending commands',
  })
  heartbeat(
    @Body() dto: HeartbeatDto,
    @Headers('x-app-version') appVersion?: string,
  ) {
    return this.diagnosticsService.heartbeat(dto, appVersion);
  }

  @Post('errors')
  @ApiOperation({ summary: 'Errors and crashes caught in the app' })
  errors(@Body() dto: MobileErrorsDto) {
    return this.diagnosticsService.reportErrors(dto);
  }

  @Post('reports')
  @ApiOperation({
    summary: 'Diagnostic report (app logs + sync queue) requested from MIS',
  })
  report(@Body() dto: DiagnosticReportDto) {
    return this.diagnosticsService.saveReport(dto);
  }

  @Post('commands/:commandId/complete')
  @ApiOperation({ summary: 'The app finished (or failed) a command' })
  complete(
    @Param('commandId') commandId: string,
    @Body() dto: CompleteCommandDto,
  ) {
    return this.diagnosticsService.completeCommand(commandId, dto);
  }
}
