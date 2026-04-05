/**
 * InventoryTransaction Controller
 * --------------------------------
 * Purpose : Exposes APIs for managing inventory-transactions
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create inventory-transactions
 * - Fetch inventory-transactions with filters & pagination
 * - Retrieve individual inventory-transaction details
 * - Update inventory-transaction
 * - Soft delete inventory-transactions
 *
 * Notes:
 * - InventoryTransactions act as master reference data
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

import { Permissions } from 'src/core/decorators/permission.decorator';

import { InventoryTransactionService } from './inventory-transaction.service';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { UpdateInventoryTransactionDto } from './dto/update-inventory-transaction.dto';
import { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto';
import { INVENTORY_TRANSACTION } from './inventory-transaction.constants';

@ApiTags('Inventory-transaction')
@FeatureFlag(API_MODULE_ENABLE_KEYS.INVENTORY_TRANSACTION)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.INVENTORY_TRANSACTION,
  version: V1,
})
export class InventoryTransactionController {
  constructor(private readonly service: InventoryTransactionService) {}

  /**
   * Create InventoryTransaction
   * ---------------------------
   */
  @Permissions('INVENTORY_TRANSACTION_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create inventory-transaction' })
  @ApiBody({ type: CreateInventoryTransactionDto })
  @ApiSuccessResponse(
    { transactionId: 'INVE-001' },
    INVENTORY_TRANSACTION.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateInventoryTransactionDto) {
    return this.service.create(dto);
  }

  /**
   * Get InventoryTransactions
   * -------------------------
   */
  @Get()
  @Permissions('INVENTORY_TRANSACTION_VIEW')
  async findAll(@Query() query: InventoryTransactionQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get InventoryTransaction by ID
   * ------------------------------
   */
  @Permissions('INVENTORY_TRANSACTION_VIEW')
  @Get(':transactionId')
  @ApiParam({ name: 'transactionId', description: 'InventoryTransaction transactionId' })
  async findOne(@Param('transactionId') transactionId: string) {
    return this.service.findByTransactionId(transactionId);
  }

  /**
   * Update InventoryTransaction
   * ----------------------------
   */
  @Permissions('INVENTORY_TRANSACTION_UPDATE')
  @Patch(':transactionId')
  @ApiParam({ name: 'transactionId', description: 'InventoryTransaction transactionId' })
  async update(
    @Param('transactionId') transactionId: string,
    @Body() dto: UpdateInventoryTransactionDto,
  ) {
    return this.service.update(transactionId, dto);
  }

  /**
   * Delete InventoryTransaction
   * ----------------------------
   */
  @Permissions('INVENTORY_TRANSACTION_DELETE')
  @Delete(':transactionId')
  @ApiParam({ name: 'transactionId', description: 'InventoryTransaction transactionId' })
  async delete(@Param('transactionId') transactionId: string) {
    return this.service.delete(transactionId);
  }
}
