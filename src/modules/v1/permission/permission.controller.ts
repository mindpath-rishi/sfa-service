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

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all permissions' })
  @ApiQuery({
    name: 'searchText',
    required: false,
    example: 'customer',
    description: 'Search permissions by code, name, or module',
  })
  findAll(@Query('searchText') searchText?: string) {
    return this.permissionService.findAll(searchText);
  }
}
