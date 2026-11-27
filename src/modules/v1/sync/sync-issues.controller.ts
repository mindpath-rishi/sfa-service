import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from 'src/core/decorators/permission.decorator';
import { SuperAdminGuard } from 'src/core/guards/super-admin.guard';
import { API_MODULE, V1 } from 'src/shared/constants/api.constants';
import { PERMISSIONS } from 'src/shared/constants/permissions.constants';
import { ResolveSyncIssueDto, SyncIssuesQueryDto } from './dto/sync-issues.dto';
import { SyncIssuesService } from './sync-issues.service';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';

/** Offline sync conflicts and failures, for Super Admin in MIS. */
@ApiTags('Offline Sync Issues')
@UseGuards(SuperAdminGuard)
@BackOfficeOnly()
@Controller({ path: API_MODULE.SYNC_ISSUES, version: V1 })
export class SyncIssuesController {
  constructor(private readonly syncIssuesService: SyncIssuesService) {}

  @Get()
  @Permissions(PERMISSIONS.SYNC_ISSUE_VIEW)
  @ApiOperation({ summary: 'Operations whose latest sync attempt failed' })
  findAll(@Query() query: SyncIssuesQueryDto) {
    return this.syncIssuesService.findAll(query);
  }

  @Get(':auditId')
  @Permissions(PERMISSIONS.SYNC_ISSUE_VIEW)
  @ApiOperation({ summary: "Salesman's change vs server record, with history" })
  findOne(@Param('auditId') auditId: string) {
    return this.syncIssuesService.findOne(auditId);
  }

  @Post(':auditId/resolve')
  @Permissions(PERMISSIONS.SYNC_ISSUE_RESOLVE)
  @ApiOperation({ summary: 'Decide how the device should clear this item' })
  resolve(@Param('auditId') auditId: string, @Body() dto: ResolveSyncIssueDto) {
    return this.syncIssuesService.resolve(auditId, dto);
  }

  @Delete(':auditId/resolve')
  @Permissions(PERMISSIONS.SYNC_ISSUE_RESOLVE)
  @ApiOperation({ summary: 'Cancel a decision the device has not applied yet' })
  cancel(@Param('auditId') auditId: string) {
    return this.syncIssuesService.cancel(auditId);
  }
}
