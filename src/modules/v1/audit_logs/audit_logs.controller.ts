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
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';

import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { AuditLogsService } from './audit_logs.service';
import { API_MODULE, API_MODULE_ENABLE_KEYS, V1 } from 'src/shared/constants/api.constants';
import { AUDIT_LOGS } from './audit_logs.constants';

@ApiTags('Audit Logs')
@FeatureFlag(API_MODULE_ENABLE_KEYS.AUDIT_LOGS)
@Controller({
  path: API_MODULE.AUDIT_LOGS,
  version: V1,
})
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  /* ======================================================
   * GET ALL AUDIT LOGS (FILTER + PAGINATION + SEARCH)
   * ====================================================== */

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get audit logs' })
  @ApiQuery({ name: 'entity', required: false, example: 'Customer' })
  @ApiQuery({ name: 'entityId', required: false, example: 'CID-1A2B3C4D' })
  @ApiQuery({ name: 'action', required: false, example: 'UPDATE' })
  @ApiQuery({
    name: 'performedBy',
    required: false,
    description: 'Employee ID who performed the action',
    example: 'EID-9F8E7D6C',
  })
  @ApiQuery({
    name: 'searchText',
    required: false,
    description: 'Search by entityId or performer',
    example: 'CID',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Start date (ISO)',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'End date (ISO)',
    example: '2026-01-31',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
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
  async findAll(
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('performedBy') performedBy?: string,
    @Query('searchText') searchText?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.auditLogsService.findAll({
      entity,
      entityId,
      action,
      performedBy,
      searchText,
      from,
      to,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  /* ======================================================
   * GET AUDIT LOG BY ID
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
