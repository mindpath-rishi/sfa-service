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
  Res,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BulkUploadEmployeesDto } from './dto/bulk-upload-employees.dto';

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
import { UserPrimaryCategoryTargetQueryDto } from './dto/user-primary-category-target-query.dto';
import { UserStatus } from '../user/user.enum';

@ApiTags('Employee')
@FeatureFlag(API_MODULE_ENABLE_KEYS.EMPLOYEE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.EMPLOYEE,
  version: V1,
})
// @Public()
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
  async create(@Body() dto: CreateEmployeeDto, @Req() req: Request) {
    const isMobile = req.headers['x-client-platform'] === 'mobile';
    return this.employeeService.create({
      ...dto,
      status: isMobile ? UserStatus.PENDING : dto.status,
    });
  }

  @Permissions('EMPLOYEE_CREATE')
  @Post('/bulk-upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk upload employees' })
  @ApiBody({ type: BulkUploadEmployeesDto })
  async bulkUpload(@Body() dto: BulkUploadEmployeesDto) {
    return this.employeeService.bulkUpload(dto);
  }

  @Get('/manager/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager stats' })
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
  async getManagerStats(
    @Query() query: { date?: string; startDate?: string; endDate?: string },
  ) {
    return this.employeeService.getManagerStats(query);
  }

  @Get('/manager/target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager stats' })
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
  async getPrimaryCategoryTargetSummary(@Query() query: { date?: string }) {
    return this.employeeService.getPrimaryCategoryTargetSummary(query?.date);
  }

  @Get('/manager/user-wise-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager stats' })
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
  async getUserWiseTargetSummary(@Query() query: { date?: string }) {
    return this.employeeService.getUserWiseTargetSummary(query?.date);
  }

  @Get('/manager/ubo-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user-wise UBO target and achievement' })
  async getUboTargetSummary(@Query() query: { date?: string }) {
    return this.employeeService.getSpecialTargetSummary('UBO', query?.date);
  }

  @Get('/manager/focused-pack-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user-wise Focused Pack target and achievement',
  })
  async getFocusedPackTargetSummary(@Query() query: { date?: string }) {
    return this.employeeService.getSpecialTargetSummary(
      'FOCUSED_PACK',
      query?.date,
    );
  }

  @Get('/manager/user-primary-category-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user primary category targets' })
  async getUserPrimaryCategoryTarget(
    @Query() query: UserPrimaryCategoryTargetQueryDto,
  ) {
    return this.employeeService.getUserPrimaryCategoryTarget(query);
  }

  @Get('/manager/user-ubo-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get category-wise UBO target and achievement for a user',
  })
  async getUserUboTarget(@Query() query: UserPrimaryCategoryTargetQueryDto) {
    return this.employeeService.getUserUboTargetBreakdown(query);
  }

  @Get('/manager/user-focused-pack-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get product-wise Focused Pack target and achievement for a user',
  })
  async getUserFocusedPackTarget(
    @Query() query: UserPrimaryCategoryTargetQueryDto,
  ) {
    return this.employeeService.getUserFocusedPackTargetBreakdown(query);
  }

  @Get('/manager/order-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager stats' })
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
  async getManagerOrderSummary(
    @Query() query: { date?: string; startDate?: string; endDate?: string },
  ) {
    return this.employeeService.getManagerOrderSummary(query);
  }

  @Get('/manager/team-coverage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get team coverage' })
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
  async getTeamCoverage() {
    return this.employeeService.getTeamCoverage();
  }

  @Get('/manager/get-beat-o-meter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get team coverage' })
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
  async getBeatOMeter() {
    return this.employeeService.getBeatOMeter();
  }

  @Get('/manager/field-user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get team coverage' })
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
  async getFieldUsersSummary(@Query() query: { date?: string }) {
    return this.employeeService.getFieldUsersSummary(query?.date);
  }

  @Get('/manager/live-locations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get latest live locations for manager field users',
  })
  async getManagerLiveLocations(
    @Query() query: { date?: string; startDate?: string; endDate?: string },
  ) {
    return this.employeeService.getManagerLiveLocations(query);
  }

  @Get('/manager/user-timeline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager field user daily timeline' })
  async getManagerUserTimeline(
    @Query() query: { employeeId: string; date?: string },
  ) {
    return this.employeeService.getManagerUserTimeline(query);
  }

  @Get('/manager/user-mtd-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager field user MTD outlet summary' })
  async getManagerUserMtdSummary(
    @Query() query: { employeeId: string; date?: string },
  ) {
    return this.employeeService.getManagerUserMtdSummary(query);
  }

  @Get('/manager/user-route-plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get manager field user route plan' })
  async getManagerUserRoutePlan(
    @Query() query: { employeeId: string; date?: string },
  ) {
    return this.employeeService.getManagerUserRoutePlan(query);
  }

  @Get('/salesman/my-pocket-target')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get salesman pocket and target' })
  @ApiSuccessResponse(
    {
      target: {
        targetCases: 100,
        achievedCases: 60,
        remainingCases: 40,
        achievementPercentage: 60,
      },
      pocket: {
        tc: 20,
        avgTc: 5,
        pc: 10,
        avgPc: 2.5,
        upc: 8,
        utc: 18,
        totalLinesSold: 35,
        lpc: 3.5,
      },
    },
    EMPLOYEE.FETCHED,
  )
  async getSalesmanPocketAndTarget(
    @Query()
    query: {
      date?: string;
      startDate?: string;
      endDate?: string;
      metric?: 'cases' | 'tonnage' | 'value';
    },
  ) {
    return this.employeeService.getSalesmanPocketAndTarget(
      query?.date,
      query?.metric,
      query?.startDate,
      query?.endDate,
    );
  }

  @Get('/salesman/day-wise-summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get salesman day wise summary' })
  @ApiSuccessResponse(
    [
      {
        date: '2026-06-10',
        label: 'Wed, 10 Jun 2026',
        retailing: 1,
        officialWork: 0,
        leave: 0,
        absent: 0,
        totalActivities: 1,
        retailingDuration: '8 hrs',
        totalDuration: '8 hrs',
        tc: 10,
        pc: 5,
        upc: 4,
        netValue: 1200,
        cases: 20,
        firstCallTime: '09:30 AM',
        firstPcTime: '10:15 AM',
      },
    ],
    EMPLOYEE.FETCHED,
  )
  async getSalesmanDayWiseSummary(
    @Query()
    query: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.employeeService.getSalesmanDayWiseSummary(
      query?.date,
      query?.startDate,
      query?.endDate,
    );
  }

  @Get('/salesman/product-sales')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get salesman product sales' })
  @ApiSuccessResponse(
    {
      overview: {
        sc: 12,
        tc: 24,
        pc: 18,
        netValue: 12500,
        cases: 84.5,
        lpc: 2.4,
      },
      categories: [
        {
          id: 'CAT-123',
          name: 'Beverages',
          value: 4200,
          pcs: 180,
          cases: 15,
          growth: 34,
        },
      ],
    },
    EMPLOYEE.FETCHED,
  )
  async getSalesmanProductSales(
    @Query()
    query: {
      date?: string;
      startDate?: string;
      endDate?: string;
      groupBy?: 'PRIMARYCATEGORY' | 'SECONDARYCATEGORY' | 'SKU';
    },
  ) {
    return this.employeeService.getSalesmanProductSales(
      query?.date,
      query?.startDate,
      query?.endDate,
      query?.groupBy,
    );
  }

  @Get('/salesman/dispatch-order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get salesman dispatch orders' })
  @ApiSuccessResponse(
    [
      {
        orderId: 'SALE-12345678',
        orderNo: 'SALE-12345678',
        outletName: 'ABC Store',
        invoiceNo: 'SALE-12345678',
        status: 'Pending Dispatch',
        orderDate: '2026-06-13',
        vehicleNo: 'Van 01',
        cases: 12.5,
        pieces: 120,
        netValue: 2500,
      },
    ],
    EMPLOYEE.FETCHED,
  )
  async getSalesmanDispatchOrders(
    @Query()
    query: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.employeeService.getSalesmanDispatchOrders(
      query?.date,
      query?.startDate,
      query?.endDate,
    );
  }

  @Post('/salesman/share-mst')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare salesman MST sharing content' })
  async shareSalesmanMST(
    @Body()
    body: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.employeeService.shareSalesmanReport('MST', body);
  }

  @Post('/salesman/share-dsr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare salesman DSR sharing content' })
  async shareSalesmanDSR(
    @Body()
    body: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.employeeService.shareSalesmanReport('DSR', body);
  }

  @Post('/salesman/share-msr')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare salesman MSR sharing content' })
  async shareSalesmanMSR(
    @Body()
    body: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.employeeService.shareSalesmanReport('MSR', body);
  }

  @Get('/export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export employees' })
  async exportEmployees(
    @Query()
    query: EmployeeQueryDto & {
      fileType?: 'excel' | 'pdf';
      columns?: string;
    },
    @Res() res: Response,
  ) {
    const file = await this.employeeService.exportEmployees(query);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.buffer);
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

  @Get(':employeeId/stats')
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
  async getEmployeeStats(@Param('employeeId') employeeId: string) {
    return this.employeeService.getEmployeeStats(employeeId);
  }

  @Permissions('EMPLOYEE_UPDATE')
  @Patch(':employeeId/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset employee password' })
  @ApiParam({ name: 'employeeId', example: 'EID-1A2B3C4D' })
  @ApiSuccessResponse({ updated: true }, 'Password reset successfully')
  @ApiNotFoundResponse()
  async resetPassword(@Param('employeeId') employeeId: string) {
    return this.employeeService.resetPassword(employeeId);
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
