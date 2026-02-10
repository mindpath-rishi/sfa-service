/**
 * Customer Category Controller
 * ----------------------------
 * Purpose : Exposes APIs for managing customer categories
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create customer categories
 * - Fetch categories with filters & pagination
 * - Retrieve individual category details
 * - Update customer categories
 * - Soft delete customer categories
 *
 * Notes:
 * - Customer categories are used for segmentation and reporting
 * - Categories act as master reference data
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

import { Permissions } from 'src/core/decorators/permissioin.decorator';

import { CustomerCategoryService } from './customer-category.service';
import { CreateCustomerCategoryDto } from './dto/create-customer-category.dto';
import { UpdateCustomerCategoryDto } from './dto/update-customer-category.dto';
import { CustomerCategoryQueryDto } from './dto/customer-category-query.dto';
import { CUSTOMER_CATEGORY } from './customer-category.constants';

@ApiTags('Customer Category')
@FeatureFlag(API_MODULE_ENABLE_KEYS.CUSTOMER_CATEGORY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.CUSTOMER_CATEGORY,
  version: V1,
})
export class CustomerCategoryController {
  constructor(private readonly service: CustomerCategoryService) {}

  /**
   * Create Customer Category
   * -----------------------
   * Purpose : Create new customer category
   * Used by : ADMIN FLOWS
   */
  @Permissions('CUSTOMER_CATEGORY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer category' })
  @ApiBody({ type: CreateCustomerCategoryDto })
  @ApiSuccessResponse(
    {
      customerCategoryId: 'CCAT-001',
      name: 'Retail Customers',
    },
    CUSTOMER_CATEGORY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateCustomerCategoryDto) {
    return this.service.create(dto);
  }

  /**
   * Get Customer Categories
   * ----------------------
   * Purpose : Retrieve paginated customer category list
   * Used by : CATEGORY LISTING / ADMIN SCREENS
   *
   * Supports:
   * - Name search
   * - Status filtering
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get customer categories' })
  @ApiSuccessResponse(
    {
      items: [
        {
          customerCategoryId: 'CCAT-001',
          name: 'Retail Customers',
          status: 'ACTIVE',
        },
      ],
      meta: {
        total: 5,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
    CUSTOMER_CATEGORY.FETCHED,
  )
  async findAll(@Query() query: CustomerCategoryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Customer Category by ID
   * --------------------------
   * Purpose : Retrieve single customer category
   * Used by : CATEGORY DETAIL VIEW
   */
  @Get(':customerCategoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get customer category by id' })
  @ApiParam({ name: 'customerCategoryId' })
  @ApiSuccessResponse(
    {
      customerCategoryId: 'CCAT-001',
      name: 'Retail Customers',
    },
    CUSTOMER_CATEGORY.FETCHED,
  )
  @ApiNotFoundResponse()
  async findOne(@Param('customerCategoryId') customerCategoryId: string) {
    return this.service.findByCustomerCategoryId(customerCategoryId);
  }

  /**
   * Update Customer Category
   * -----------------------
   * Purpose : Update customer category master data
   * Used by : ADMIN FLOWS
   */
  @Permissions('CUSTOMER_CATEGORY_UPDATE')
  @Patch(':customerCategoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update customer category' })
  @ApiParam({ name: 'customerCategoryId' })
  @ApiBody({ type: UpdateCustomerCategoryDto })
  @ApiSuccessResponse(null, CUSTOMER_CATEGORY.UPDATED)
  @ApiNotFoundResponse()
  async update(
    @Param('customerCategoryId') customerCategoryId: string,
    @Body() dto: UpdateCustomerCategoryDto,
  ) {
    return this.service.update(customerCategoryId, dto);
  }

  /**
   * Delete Customer Category
   * -----------------------
   * Purpose : Soft delete customer category
   * Used by : ADMIN FLOWS
   */
  @Permissions('CUSTOMER_CATEGORY_DELETE')
  @Delete(':customerCategoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer category' })
  @ApiParam({ name: 'customerCategoryId' })
  @ApiSuccessResponse(null, CUSTOMER_CATEGORY.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('customerCategoryId') customerCategoryId: string) {
    return this.service.delete(customerCategoryId);
  }
}
