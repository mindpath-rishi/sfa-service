/**
 * Payment Controller
 * -------------------
 * Purpose : Exposes APIs for managing payments
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create payments
 * - Fetch payments with filters & pagination
 * - Retrieve individual payment details
 * - Update payment
 * - Soft delete payments
 *
 * Notes:
 * - Payments act as master reference data
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

import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { PAYMENT } from './payment.constants';

@ApiTags('Payment')
@FeatureFlag(API_MODULE_ENABLE_KEYS.PAYMENT)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.PAYMENT,
  version: V1,
})
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  /**
   * Create Payment
   * --------------
   */
  @Permissions('PAYMENT_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create payment' })
  @ApiBody({ type: CreatePaymentDto })
  @ApiSuccessResponse(
    { paymentId: 'PAYM-001' },
    PAYMENT.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreatePaymentDto) {
    return this.service.create(dto);
  }

  /**
   * Get Payments
   * ------------
   */
  @Get()
  @Permissions('PAYMENT_VIEW')
  async findAll(@Query() query: PaymentQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Payment by ID
   * -----------------
   */
  @Permissions('PAYMENT_VIEW')
  @Get(':paymentId')
  @ApiParam({ name: 'paymentId', description: 'Payment paymentId' })
  async findOne(@Param('paymentId') paymentId: string) {
    return this.service.findByPaymentId(paymentId);
  }

  /**
   * Update Payment
   * ---------------
   */
  @Permissions('PAYMENT_UPDATE')
  @Patch(':paymentId')
  @ApiParam({ name: 'paymentId', description: 'Payment paymentId' })
  async update(
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.service.update(paymentId, dto);
  }

  /**
   * Delete Payment
   * ---------------
   */
  @Permissions('PAYMENT_DELETE')
  @Delete(':paymentId')
  @ApiParam({ name: 'paymentId', description: 'Payment paymentId' })
  async delete(@Param('paymentId') paymentId: string) {
    return this.service.delete(paymentId);
  }
}
