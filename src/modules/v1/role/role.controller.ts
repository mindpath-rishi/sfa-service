/**
 * Role Controller
 * ---------------
 * Purpose : Expose APIs for managing roles and permissions
 * Used by : ROLE MANAGEMENT / ACCESS CONTROL ADMIN SCREENS
 *
 * Responsibilities:
 * - Create new roles
 * - Retrieve role lists with filters & pagination
 * - Fetch role details
 * - Update role configuration
 * - Soft delete roles
 *
 * Notes:
 * - Business logic is delegated to RoleService
 * - Role permissions control access across the system
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';

import { RoleService } from './role.service';
import { ROLE } from './role.constants';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';

import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiInternalErrorResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';

@ApiTags('Roles')
@FeatureFlag(API_MODULE_ENABLE_KEYS.ROLE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.ROLE,
  version: V1,
})
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  /**
   * Create Role
   * -----------
   * Purpose : Create a new role with permissions
   * Used by : ADMIN / ACCESS CONTROL SETUP
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create role' })
  @ApiBody({ type: CreateRoleDto })
  @ApiSuccessResponse(
    {
      roleId: 'RID-001',
      name: 'ADMIN',
      permissions: ['USER_CREATE', 'ORDER_VIEW'],
      status: 'ACTIVE',
    },
    ROLE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  /**
   * Get Roles
   * ---------
   * Purpose : Retrieve roles using filters and pagination
   * Used by : ROLE LIST / ACCESS CONTROL SCREENS
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Van limit filters
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all roles' })
  @ApiSuccessResponse(
    {
      items: [
        {
          roleId: 'RID-001',
          name: 'ADMIN',
          permissions: ['USER_CREATE', 'ORDER_VIEW'],
          status: 'ACTIVE',
        },
      ],
      meta: {
        page: 1,
        limit: 20,
        total: 5,
        totalPages: 1,
      },
    },
    ROLE.FETCHED,
  )
  async findAll(@Query() query: RoleQueryDto) {
    return this.roleService.findAll(query);
  }

  /**
   * Get Role by ID
   * --------------
   * Purpose : Retrieve role details
   * Used by : ROLE DETAIL / PERMISSION REVIEW
   */
  @Get(':roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get role by roleId' })
  @ApiParam({ name: 'roleId', example: 'RID-001' })
  @ApiSuccessResponse(
    {
      roleId: 'RID-001',
      name: 'ADMIN',
      permissions: ['USER_CREATE'],
      status: 'ACTIVE',
    },
    ROLE.FETCHED,
  )
  async findOne(@Param('roleId') roleId: string) {
    return this.roleService.findByRoleId(roleId);
  }

  /**
   * Update Role
   * -----------
   * Purpose : Update role configuration and permissions
   * Used by : ADMIN / ACCESS CONTROL MAINTENANCE
   */
  @Patch(':roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role' })
  @ApiParam({ name: 'roleId', example: 'RID-001' })
  @ApiBody({ type: UpdateRoleDto })
  @ApiSuccessResponse(
    {
      roleId: 'RID-001',
      permissions: ['USER_VIEW'],
      status: 'INACTIVE',
    },
    ROLE.UPDATED,
  )
  async update(@Param('roleId') roleId: string, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(roleId, dto);
  }

  /**
   * Delete Role (Soft Delete)
   * -------------------------
   * Purpose : Deactivate a role
   * Used by : ADMIN / ACCESS CONTROL CLEANUP
   *
   * Notes:
   * - Role data is preserved for audit purposes
   */
  @Delete(':roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete role' })
  @ApiParam({ name: 'roleId', example: 'RID-001' })
  @ApiSuccessResponse(null, ROLE.DELETED)
  async remove(@Param('roleId') roleId: string) {
    return this.roleService.delete(roleId);
  }
}
