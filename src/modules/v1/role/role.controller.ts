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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';

import { RoleService } from './role.service';
import { ROLE } from './role.constants';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { API_MODULE, API_MODULE_ENABLE_KEYS, V1 } from 'src/shared/constants/api.constants';

import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiInternalErrorResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';

// OPTIONAL (recommended): If Roles API should be protected
// import { JwtAuthGuard } from 'src/core/guards/jwt.guard';

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
   * Create a new role.
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
   * Fetch roles with optional pagination and filters.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all roles' })
  @ApiQuery({ name: 'status', required: false, example: 'ACTIVE' })
  @ApiQuery({
    name: 'searchText',
    required: false,
    example: 'admin',
    description: 'Search by role name or roleId',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
    description: 'Default: 1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
    description: 'Default: 20',
  })
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
   * Fetch role details by roleId.
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
   * Update role properties (permissions/status/name).
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
   * Soft delete a role (disables role without removing from DB).
   */
  @Delete(':roleId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete role (soft delete)' })
  @ApiParam({ name: 'roleId', example: 'RID-001' })
  @ApiSuccessResponse(null, ROLE.DELETED)
  async remove(@Param('roleId') roleId: string) {
    return this.roleService.delete(roleId);
  }
}
