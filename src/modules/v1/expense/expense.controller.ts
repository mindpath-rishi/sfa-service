/**
 * Expense Controller
 * ------------------
 * Purpose : Advance expense automation (weekly Mon–Sat cycle)
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
  CreateExpenseDto,
  ExpenseQueryDto,
  ReplaceWithdrawalChargesDto,
  UpdateExpenseStatusDto,
  UpsertExpenseRatesDto,
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
  async preview(@Query('beatIds') beatIds?: string | string[]) {
    const ids = Array.isArray(beatIds)
      ? beatIds
      : (beatIds ?? '').split(',').filter(Boolean);
    return this.service.preview(ids);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Raise current-week advance expense request' })
  @ApiBody({ type: CreateExpenseDto })
  async create(@Body() dto: CreateExpenseDto) {
    return this.service.create(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'My expense requests' })
  async findMine(@Query() query: ExpenseQueryDto) {
    return this.service.findMine(query);
  }

  /* ================= REFERENCE TABLES ================= */

  @Get('config/rates')
  @ApiOperation({ summary: 'Per day value by employee tag' })
  async getRates() {
    return this.service.getRates();
  }

  @BackOfficeOnly()
  @Put('config/rates')
  @ApiOperation({ summary: 'Upsert per day value by employee tag' })
  @ApiBody({ type: UpsertExpenseRatesDto })
  async upsertRates(@Body() dto: UpsertExpenseRatesDto) {
    return this.service.upsertRates(dto);
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
