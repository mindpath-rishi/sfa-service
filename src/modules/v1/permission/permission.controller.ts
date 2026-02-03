/**
 * Permission Controller
 * ---------------------
 * Purpose : Expose APIs to retrieve system permissions
 * Used by : ROLE MANAGEMENT / ACCESS CONTROL SCREENS
 *
 * Responsibilities:
 * - Provide list of all permissions
 * - Support basic search functionality
 *
 * Notes:
 * - Read-only controller
 * - No create/update/delete endpoints exposed
 */

import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiQuery,
} from '@nestjs/swagger';

import { PermissionService } from './permission.service';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { ApiInternalErrorResponse } from 'src/core/swagger/api-error.response.swagger';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { Public } from 'src/core/decorators/public.decorator';
import { PermissionsQueryDto } from './dto/permission-query.dto';

@ApiTags('Permission')
@FeatureFlag(API_MODULE_ENABLE_KEYS.PERMISSION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.PERMISSION,
  version: V1,
})
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  /**
   * Get Permissions
   * ---------------
   * Purpose : Retrieve all system permissions
   * Used by : ROLE CONFIGURATION / PERMISSION SELECTION UI
   *
   * Supports:
   * - Free-text search by permission code, name, or module
   *
   * Notes:
   * - Endpoint is public (no authentication required)
   * - Results are read-only
   */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiQuery({
    type: PermissionsQueryDto,
  })
  findAll(@Query() query: PermissionsQueryDto) {
    return this.permissionService.findAll(query);
  }
}
