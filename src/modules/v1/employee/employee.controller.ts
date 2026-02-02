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
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeService } from './employee.service';
import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiInternalErrorResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from 'src/core/swagger/api-error.response.swagger';

import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { EMPLOYEE } from './employee.constants';
import { Permissions } from 'src/core/decorators/permissioin.decorator';

/**
 * Employee API (v1)
 *
 * Handles Employee CRUD operations.
 * Authentication is required for all endpoints.
 */
@ApiTags('Employee')
@FeatureFlag(API_MODULE_ENABLE_KEYS.EMPLOYEE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.EMPLOYEE,
  version: V1,
})
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  /**
   * Create a new employee.
   */
  @Permissions('EMPLOYEE_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create employee' })
  @ApiBody({ type: CreateEmployeeDto })
  @ApiSuccessResponse(
    {
      employeeId: 'EID-1A2B3C4D',
      name: 'John Doe',
      mobile: '9876543210',
    },
    EMPLOYEE.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  /**
   * Fetch employees with optional search and pagination.
   */
  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  @ApiQuery({ name: 'status', required: false, example: 'ACTIVE' })
  @ApiQuery({
    name: 'searchText',
    required: false,
    description: 'Search by employeeId, name, mobile, or email',
    example: 'john',
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
          employeeId: 'EID-1A2B3C4D',
          name: 'John Doe',
          mobile: '9876543210',
        },
      ],
      meta: {
        total: 50,
        page: 1,
        limit: 20,
        totalPages: 3,
      },
    },
    EMPLOYEE.FETCHED,
  )
  async findAll(
    @Query('status') status?: string,
    @Query('searchText') searchText?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.employeeService.findAll({
      status,
      searchText,
      page: Number(page) || 1,
      limit: Number(limit) || 20,
    });
  }

  /**
   * Fetch employee details by employeeId.
   */
  @Get(':employeeId')
  @ApiOperation({ summary: 'Get employee by employeeId' })
  @ApiParam({ name: 'employeeId', example: 'EID-1A2B3C4D' })
  @ApiSuccessResponse(
    {
      employeeId: 'EID-1A2B3C4D',
      name: 'John Doe',
      mobile: '9876543210',
    },
    EMPLOYEE.FETCHED,
  )
  @ApiNotFoundResponse()
  async findOne(@Param('employeeId') employeeId: string) {
    return this.employeeService.findByEmployeeId(employeeId);
  }

  /**
   * Update employee details by employeeId.
   */
  @Patch(':employeeId')
  @ApiOperation({ summary: 'Update employee' })
  @ApiParam({ name: 'employeeId', example: 'EID-1A2B3C4D' })
  @ApiBody({ type: UpdateEmployeeDto })
  @ApiSuccessResponse(null, EMPLOYEE.UPDATED)
  @ApiNotFoundResponse()
  async update(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeeService.update(employeeId, dto);
  }

  /**
   * Deactivate employee (soft delete).
   */
  @Delete(':employeeId')
  @ApiOperation({ summary: 'Deactivate employee' })
  @ApiParam({ name: 'employeeId', example: 'EID-1A2B3C4D' })
  @ApiSuccessResponse(null, EMPLOYEE.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('employeeId') employeeId: string) {
    return this.employeeService.delete(employeeId);
  }
}
