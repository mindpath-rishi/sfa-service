/**
 * Expense Controller
 * ------------------
 * Purpose : Expense request automation (weekly Mon–Sat cycle)
 * Used by : MOBILE (request) / ADMIN PANEL (approval, config) / ERP (export)
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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { BackOfficeOnly } from 'src/core/decorators/back-office-only.decorator';
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

import { ExpenseService } from './expense.service';
import {
  AssignEmployeeRateDto,
  CreateExpenseRateDto,
  EmployeeRateQueryDto,
  ExpenseQueryDto,
  ReplaceWithdrawalChargesDto,
  UpdateExpenseRateDto,
  UpdateExpenseStatusDto,
} from './dto/expense.dto';

@ApiTags('Expense')
@FeatureFlag(API_MODULE_ENABLE_KEYS.EXPENSE)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({ path: API_MODULE.EXPENSE, version: V1 })
export class ExpenseController {
  constructor(private readonly service: ExpenseService) {}

  /* ================= APP ================= */

  @Get('preview')
  @ApiOperation({ summary: 'Preview current-week expense request (no save)' })
  async preview() {
    return this.service.preview();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise current-week expense request' })
  async create() {
    return this.service.create();
  }

  @Get('me')
  @ApiOperation({ summary: 'My expense requests' })
  async findMine(@Query() query: ExpenseQueryDto) {
    return this.service.findMine(query);
  }

  /* ================= REFERENCE TABLES ================= */

  @Get('config/rates')
  @ApiOperation({ summary: 'Per day values (with mapped employee count)' })
  async getRates() {
    return this.service.getRates();
  }

  @BackOfficeOnly()
  @Post('config/rates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a per day value' })
  @ApiBody({ type: CreateExpenseRateDto })
  async createRate(@Body() dto: CreateExpenseRateDto) {
    return this.service.createRate(dto);
  }

  @BackOfficeOnly()
  @Patch('config/rates/:rateId')
  @ApiOperation({ summary: 'Update a per day value' })
  @ApiNotFoundResponse()
  @ApiParam({ name: 'rateId' })
  @ApiBody({ type: UpdateExpenseRateDto })
  async updateRate(
    @Param('rateId') rateId: string,
    @Body() dto: UpdateExpenseRateDto,
  ) {
    return this.service.updateRate(rateId, dto);
  }

  @BackOfficeOnly()
  @Delete('config/rates/:rateId')
  @ApiOperation({ summary: 'Delete an unmapped per day value' })
  @ApiNotFoundResponse()
  @ApiParam({ name: 'rateId' })
  async deleteRate(@Param('rateId') rateId: string) {
    return this.service.deleteRate(rateId);
  }

  @BackOfficeOnly()
  @Get('config/employee-rates')
  @ApiOperation({ summary: 'Employees with their per day value mapping' })
  async getEmployeeRates(@Query() query: EmployeeRateQueryDto) {
    return this.service.getEmployeeRates(query);
  }

  @BackOfficeOnly()
  @Put('config/employee-rates')
  @ApiOperation({ summary: 'Map employees to a per day value' })
  @ApiBody({ type: AssignEmployeeRateDto })
  async assignEmployeeRate(@Body() dto: AssignEmployeeRateDto) {
    return this.service.assignEmployeeRate(dto);
  }

  @Get('config/withdrawal-charges')
  @ApiOperation({ summary: 'Withdrawal charge slabs' })
  async getWithdrawalCharges() {
    return this.service.getWithdrawalCharges();
  }

  @BackOfficeOnly()
  @Put('config/withdrawal-charges')
  @ApiOperation({ summary: 'Replace withdrawal charge slabs' })
  @ApiBody({ type: ReplaceWithdrawalChargesDto })
  async replaceWithdrawalCharges(@Body() dto: ReplaceWithdrawalChargesDto) {
    return this.service.replaceWithdrawalCharges(dto);
  }

  /* ================= ADMIN / ERP ================= */

  @BackOfficeOnly()
  @Get('erp-export')
  @ApiOperation({ summary: 'ERP field-mapped export (default: APPROVED)' })
  async erpExport(@Query() query: ExpenseQueryDto) {
    return this.service.erpExport(query);
  }

  @BackOfficeOnly()
  @Get()
  @ApiOperation({ summary: 'List expense requests' })
  async findAll(@Query() query: ExpenseQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':expenseId')
  @ApiNotFoundResponse()
  @ApiParam({ name: 'expenseId' })
  async findOne(@Param('expenseId') expenseId: string) {
    return this.service.findByExpenseId(expenseId);
  }

  @BackOfficeOnly()
  @Patch(':expenseId/status')
  @ApiOperation({ summary: 'Approve / reject / mark synced to ERP' })
  @ApiParam({ name: 'expenseId' })
  @ApiBody({ type: UpdateExpenseStatusDto })
  async updateStatus(
    @Param('expenseId') expenseId: string,
    @Body() dto: UpdateExpenseStatusDto,
  ) {
    return this.service.updateStatus(expenseId, dto);
  }

  @BackOfficeOnly()
  @Delete(':expenseId')
  @ApiParam({ name: 'expenseId' })
  async delete(@Param('expenseId') expenseId: string) {
    return this.service.delete(expenseId);
  }
}
