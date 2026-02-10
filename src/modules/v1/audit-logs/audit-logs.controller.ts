import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { AuditLogsService } from './audit-logs.service';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { AUDIT_LOGS } from './audit-logs.constants';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto';

/**
 * Audit log endpoints.
 * Provides read-only access to system audit trails.
 */
@ApiTags('Audit Logs')
@FeatureFlag(API_MODULE_ENABLE_KEYS.AUDIT_LOGS)
@Controller({
  path: API_MODULE.AUDIT_LOGS,
  version: V1,
})
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  /* ======================================================
   * GET ALL AUDIT LOGS
   * Supports filtering, search, date range, and pagination.
   * ====================================================== */

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get audit logs' })
  @ApiSuccessResponse(
    {
      items: [],
      meta: {
        total: 100,
        page: 1,
        limit: 20,
        totalPages: 5,
      },
    },
    AUDIT_LOGS.FETCH,
  )
  async findAll(@Query() query: AuditLogsQueryDto) {
    return this.auditLogsService.findAll(query);
  }

  /* ======================================================
   * GET AUDIT LOG BY ID
   * Returns a single audit log entry.
   * ====================================================== */

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get audit log by id' })
  @ApiParam({ name: 'id', description: 'Audit log document ID' })
  @ApiSuccessResponse({}, AUDIT_LOGS.FETCH_ONE)
  async findOne(@Param('id') id: string) {
    return this.auditLogsService.findById(id);
  }
}
