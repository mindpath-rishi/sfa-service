import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SuperAdminGuard } from 'src/core/guards/super-admin.guard';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import {
  InspectQueryDto,
  RepairDto,
  ScanQueryDto,
  SyncPreviewQueryDto,
} from './dto/feature-debug.dto';
import { RepairsService } from './repairs.service';
import { SyncPreviewService } from './sync-preview.service';
import { FeatureDebugService } from './feature-debug.service';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';

/** Feature-by-feature debugging for Super Admin. Read-only: nothing is changed. */
@ApiTags('Feature Debugger')
@UseGuards(SuperAdminGuard)
@BackOfficeOnly()
@Controller({ path: API_MODULE.FEATURE_DEBUG, version: V1 })
export class FeatureDebugController {
  constructor(
    private readonly featureDebugService: FeatureDebugService,
    private readonly repairsService: RepairsService,
    private readonly syncPreviewService: SyncPreviewService,
  ) {}

  @Post('repair')
  @ApiOperation({ summary: 'Run a repair action (recorded with the reason)' })
  repair(@Body() dto: RepairDto) {
    return this.repairsService.run(dto.action, dto.id, dto.reason);
  }

  @Get('repairs')
  @ApiOperation({ summary: 'Repair history, optionally for one record' })
  repairs(@Query('targetId') targetId?: string) {
    return this.repairsService.history(targetId);
  }

  @Get('sync-preview')
  @ApiOperation({ summary: "What a salesman's phone downloads" })
  syncPreview(@Query() query: SyncPreviewQueryDto) {
    return this.syncPreviewService.preview(
      query.employeeId,
      query.entity,
      query.search,
    );
  }

  @Get('features')
  @ApiOperation({ summary: 'Features that can be inspected and scanned' })
  features() {
    return this.featureDebugService.features();
  }

  @Get('scan')
  @ApiOperation({ summary: 'Look for known problems across every feature' })
  scanAll(@Query() query: ScanQueryDto) {
    return this.featureDebugService.scan(undefined, query.days);
  }

  @Get(':feature/scan')
  @ApiOperation({ summary: 'Look for known problems in one feature' })
  scan(@Param('feature') feature: string, @Query() query: ScanQueryDto) {
    return this.featureDebugService.scan(feature, query.days);
  }

  @Get(':feature/inspect')
  @ApiOperation({ summary: 'Checks, related records and logs for one record' })
  inspect(@Param('feature') feature: string, @Query() query: InspectQueryDto) {
    return this.featureDebugService.inspect(feature, query);
  }
}
