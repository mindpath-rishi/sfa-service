/**
 * Product Controller
 * ------------------
 * Purpose : Exposes APIs for managing product master lifecycle
 * Used by : WEB / MOBILE / ADMIN PANEL
 *
 * Responsibilities:
 * - Create products
 * - Fetch products with filters & pagination
 * - Retrieve individual product details
 * - Update products
 * - Soft delete products
 *
 * Notes:
 * - Inventory quantities are handled separately
 * - Product master acts as source of truth
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

import { ProductQueryDto } from './dto/product-query.dto';
import { PRODUCT } from './product.constants';
import { ProductUpdateDto } from './dto/update-product.dto';
import { ProductCreateDto } from './dto/create-product.dto';
import { ProductService } from './product.service';
import { Public } from 'src/core/decorators/public.decorator';

// @Public()
@ApiTags('Product')
@FeatureFlag(API_MODULE_ENABLE_KEYS.PRODUCT)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.PRODUCT,
  version: V1,
})
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  /**
   * Create Product
   * --------------
   * Purpose : Create new product master record
   * Used by : ADMIN FLOWS
   */
  @Permissions('PRODUCT_CREATE')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create product' })
  @ApiBody({ type: ProductCreateDto })
  @ApiSuccessResponse(
    {
      productId: 'PID-001',
      name: 'Milk 1L',
    },
    PRODUCT.CREATED,
    HttpStatus.CREATED,
  )
  async create(@Body() dto: ProductCreateDto) {
    return this.productService.create(dto);
  }

  /**
   * Get Products
   * ------------
   * Purpose : Retrieve paginated product list
   * Used by : PRODUCT LISTING / ADMIN SCREENS
   *
   * Supports:
   * - Name search
   * - Category filtering
   * - Status filtering
   * - Pagination
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get products' })
  @ApiSuccessResponse(
    {
      items: [
        {
          productId: 'PID-001',
          name: 'Milk 1L',
          status: 'ACTIVE',
        },
      ],
      meta: {
        total: 10,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    },
    PRODUCT.FETCHED,
  )
  async findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  /**
   * Get Product by ID
   * -----------------
   * Purpose : Retrieve single product
   * Used by : PRODUCT DETAIL VIEW
   */
  @Get(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get product by id' })
  @ApiParam({ name: 'productId' })
  @ApiSuccessResponse(
    {
      productId: 'PID-001',
      name: 'Milk 1L',
    },
    PRODUCT.FETCHED,
  )
  @ApiNotFoundResponse()
  async findOne(@Param('productId') productId: string) {
    return this.productService.findByProductId(productId);
  }

  /**
   * Update Product
   * --------------
   * Purpose : Update product master data
   * Used by : ADMIN FLOWS
   */
  @Permissions('PRODUCT_UPDATE')
  @Patch(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update product' })
  @ApiParam({ name: 'productId' })
  @ApiBody({ type: ProductUpdateDto })
  @ApiSuccessResponse(null, PRODUCT.UPDATED)
  @ApiNotFoundResponse()
  async update(
    @Param('productId') productId: string,
    @Body() dto: ProductUpdateDto,
  ) {
    return this.productService.update(productId, dto);
  }

  /**
   * Delete Product
   * --------------
   * Purpose : Soft delete product
   * Used by : ADMIN FLOWS
   */
  @Permissions('PRODUCT_DELETE')
  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product' })
  @ApiParam({ name: 'productId' })
  @ApiSuccessResponse(null, PRODUCT.DELETED)
  @ApiNotFoundResponse()
  async delete(@Param('productId') productId: string) {
    return this.productService.delete(productId);
  }
}
