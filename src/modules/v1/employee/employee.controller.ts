/**
 * Employee Controller
 * -------------------
 * Purpose : Exposes APIs for managing employee lifecycle and profiles
 * Used by : ADMIN PANEL / HR MANAGEMENT / INTERNAL TOOLS
 *
 * Responsibilities:
 * - Create employee profiles
 * - Fetch employee lists with filters & pagination
 * - Retrieve individual employee details
 * - Update employee profiles
 * - Deactivate employee accounts
 *
 * Notes:
 * - Authentication & authorization are handled via guards and permissions
 * - Business logic is delegated to EmployeeService
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
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

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
import { Permissions } from 'src/core/decorators/permission.decorator';
import { EmployeeQueryDto } from './dto/employee.query.dto';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Employee')
@FeatureFlag(API_MODULE_ENABLE_KEYS.EMPLOYEE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.EMPLOYEE,
  version: V1,
})
@Public()
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  /**
   * Create Employee
   * ---------------
   * Purpose : Create a new employee profile
   * Used by : ADMIN / HR ONBOARDING FLOWS
   *
   * Notes:
   * - Authentication credentials are managed separately
   * - Role & permission assignment is handled during creation
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
   * Get Employees
   * -------------
   * Purpose : Retrieve a paginated list of employees
   * Used by : EMPLOYEE LIST / ADMIN MANAGEMENT SCREENS
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all employees' })
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
  async findAll(@Query() query: EmployeeQueryDto) {
    return this.employeeService.findAll(query);
  }

  /**
   * Get Employee by ID
   * ------------------
   * Purpose : Retrieve a single employee profile
   * Used by : EMPLOYEE DETAIL / PROFILE VIEW
   *
   * Params:
   * - employeeId : Unique employee identifier
   */
  @Get(':employeeId')
  @HttpCode(HttpStatus.OK)
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
   * Update Employee
   * ---------------
   * Purpose : Update employee profile information
   * Used by : ADMIN EDIT / PROFILE UPDATE FLOWS
   *
   * Notes:
   * - Only editable fields are updated
   * - Employee identity remains unchanged
   */
  @Patch(':employeeId')
  @HttpCode(HttpStatus.OK)
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
   * Deactivate Employee
   * -------------------
   * Purpose : Deactivate an employee profile (soft delete)
   * Used by : ADMIN / HR OFFBOARDING FLOWS
   *
   * Notes:
   * - Employee data is retained for audit purposes
   * - Access is revoked but record remains
   */
  @Delete(':employeeId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate employee' })
  @ApiParam({ name: 'employeeId', example: 'EID-1A2B3C4D' })
  @ApiSuccessResponse(null, EMPLOYEE.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('employeeId') employeeId: string) {
    return this.employeeService.delete(employeeId);
  }
}
