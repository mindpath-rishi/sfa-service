
/**
 * Customer Controller
 * --------------------
 * Purpose : Exposes APIs for managing customers
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create customers
 * - Fetch customers with filters & pagination
 * - Retrieve individual customer details
 * - Update customers
 * - Soft delete customers
 *
 * Notes:
 * - Customers act as master reference data
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

import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { CUSTOMER } from './customer.constants';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Customer')
@FeatureFlag(API_MODULE_ENABLE_KEYS.CUSTOMER)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.CUSTOMER,
  version: V1,
})
@Public()
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  /**
   * Create Customer
   * ---------------
   */
  @Permissions('CUSTOMER_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer' })
  @ApiBody({ type: CreateCustomerDto })
  @ApiSuccessResponse(
    { customerId: 'CUST-001' },
    CUSTOMER.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateCustomerDto) {
    return this.service.create(dto);
  }

  /**
   * Get Customers
   * -------------
   */
  @Get()
  @Permissions('CUSTOMER_VIEW')
  async findAll(@Query() query: CustomerQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Customer by ID
   * ------------------
   */
  @Permissions('CUSTOMER_VIEW')
  @Get(':customerId')
  @ApiParam({ name: 'customerId' })
  async findOne(@Param('customerId') customerId: string) {
    return this.service.findByCustomerId(customerId);
  }

  /**
   * Update Customer
   * ----------------
   */
  @Permissions('CUSTOMER_UPDATE')
  @Patch(':customerId')
  async update(
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.service.update(customerId, dto);
  }

  /**
   * Delete Customer
   * ----------------
   */
  @Permissions('CUSTOMER_DELETE')
  @Delete(':customerId')
  async delete(@Param('customerId') customerId: string) {
    return this.service.delete(customerId);
  }
}
