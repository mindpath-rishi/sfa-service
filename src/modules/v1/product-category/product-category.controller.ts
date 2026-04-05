/**
 * Product Category Controller
 * ---------------------------
 * Purpose : Exposes APIs for managing product categories
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create categories
 * - Fetch categories with filters & pagination
 * - Retrieve individual category details
 * - Update categories
 * - Soft delete categories
 *
 * Notes:
 * - Categories are referenced by product master
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

import { ProductCategoryService } from './product-category.service';
import { ProductCategoryQueryDto } from './dto/product-category-query.dto';
import { ProductCategoryUpdateDto } from './dto/update-product-category.dto';
import { PRODUCT_CATEGORY } from './product-category.constants';
import { ProductCategoryCreateDto } from './dto/create-product-category.dto';
import { Public } from 'src/core/decorators/public.decorator';

@ApiTags('Product Category')
@FeatureFlag(API_MODULE_ENABLE_KEYS.PRODUCT_CATEGORY)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.PRODUCT_CATEGORY,
  version: V1,
})
@Public()
export class ProductCategoryController {
  constructor(private readonly service: ProductCategoryService) {}

  /**
   * Create Product Category
   * ----------------------
   * Purpose : Create new product category
   * Used by : ADMIN FLOWS
   */
  @Permissions('PRODUCT_CATEGORY_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product category' })
  @ApiBody({ type: ProductCategoryCreateDto })
  @ApiSuccessResponse(
    {
      categoryId: 'CAT-001',
      name: 'Dairy Products',
    },
    PRODUCT_CATEGORY.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: ProductCategoryCreateDto) {
    return this.service.create(dto);
  }

  /**
   * Get Product Categories
   * ---------------------
   * Purpose : Retrieve paginated category list
   * Used by : CATEGORY LISTING / ADMIN SCREENS
   *
   * Supports:
   * - Name search
   * - Status filtering
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product categories' })
  @ApiSuccessResponse(
    {
      items: [
        {
          categoryId: 'CAT-001',
          name: 'Dairy Products',
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
    PRODUCT_CATEGORY.FETCHED,
  )
  async findAll(@Query() query: ProductCategoryQueryDto) {
    return this.service.findAll(query);
  }

  /**
   * Get Product Category by ID
   * -------------------------
   * Purpose : Retrieve single category
   * Used by : CATEGORY DETAIL VIEW
   */
  @Get(':categoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product category by id' })
  @ApiParam({ name: 'categoryId' })
  @ApiSuccessResponse(
    {
      categoryId: 'CAT-001',
      name: 'Dairy Products',
    },
    PRODUCT_CATEGORY.FETCHED,
  )
  @ApiNotFoundResponse()
  async findOne(@Param('categoryId') categoryId: string) {
    return this.service.findByCategoryId(categoryId);
  }

  /**
   * Update Product Category
   * ----------------------
   * Purpose : Update category master data
   * Used by : ADMIN FLOWS
   */
  @Permissions('PRODUCT_CATEGORY_UPDATE')
  @Patch(':categoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product category' })
  @ApiParam({ name: 'categoryId' })
  @ApiBody({ type: ProductCategoryUpdateDto })
  @ApiSuccessResponse(null, PRODUCT_CATEGORY.UPDATED)
  @ApiNotFoundResponse()
  async update(
    @Param('categoryId') categoryId: string,
    @Body() dto: ProductCategoryUpdateDto,
  ) {
    return this.service.update(categoryId, dto);
  }

  /**
   * Delete Product Category
   * ----------------------
   * Purpose : Soft delete product category
   * Used by : ADMIN FLOWS
   */
  @Permissions('PRODUCT_CATEGORY_DELETE')
  @Delete(':categoryId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product category' })
  @ApiParam({ name: 'categoryId' })
  @ApiSuccessResponse(null, PRODUCT_CATEGORY.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('categoryId') categoryId: string) {
    return this.service.delete(categoryId);
  }
}
