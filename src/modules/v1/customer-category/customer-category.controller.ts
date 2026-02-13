
/**
 * CustomerCategory Controller
 * ----------------------------
 * Purpose : Exposes APIs for managing customer-categorys
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create customer-categorys
 * - Fetch customer-categorys with filters & pagination
 * - Retrieve individual customer-category details
 * - Update customer-categorys
 * - Soft delete customer-categorys
 *
 * Notes:
 * - CustomerCategorys act as master reference data
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

import { CustomerCategoryService } from './customer-category.service';
import { CreateCustomerCategoryDto } from './dto/create-customer-category.dto';
import { UpdateCustomerCategoryDto } from './dto/update-customer-category.dto';
import { CustomerCategoryQueryDto } from './dto/customer-category-query.dto';
import { CUSTOMER_CATEGORY } from './customer-category.constants';

@ApiTags('CustomerCategory')
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
   * Create CustomerCategory
   * -----------------------
   */
  @Permissions('CUSTOMER_CATEGORY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create customer-category' })
  @ApiBody({ type: CreateCustomerCategoryDto })
  @ApiSuccessResponse(
    { customerCategoryId: 'CUST-001' },
    CUSTOMER_CATEGORY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: CreateCustomerCategoryDto) {
    return this.service.create(dto);
  }

  /**
   * Get CustomerCategorys
   * ---------------------
   */
  @Get()
  @Permissions('CUSTOMER_CATEGORY_VIEW')
  async findAll(@Query() query: CustomerCategoryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get CustomerCategory by ID
   * --------------------------
   */
  @Permissions('CUSTOMER_CATEGORY_VIEW')
  @Get(':customerCategoryId')
  @ApiParam({ name: 'customerCategoryId' })
  async findOne(@Param('customerCategoryId') customerCategoryId: string) {
    return this.service.findByCustomerCategoryId(customerCategoryId);
  }

  /**
   * Update CustomerCategory
   * ------------------------
   */
  @Permissions('CUSTOMER_CATEGORY_UPDATE')
  @Patch(':customerCategoryId')
  async update(
    @Param('customerCategoryId') customerCategoryId: string,
    @Body() dto: UpdateCustomerCategoryDto,
  ) {
    return this.service.update(customerCategoryId, dto);
  }

  /**
   * Delete CustomerCategory
   * ------------------------
   */
  @Permissions('CUSTOMER_CATEGORY_DELETE')
  @Delete(':customerCategoryId')
  async delete(@Param('customerCategoryId') customerCategoryId: string) {
    return this.service.delete(customerCategoryId);
  }
}
