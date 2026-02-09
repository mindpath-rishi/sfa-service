/**
 * Product Service
 * ----------------
 * Purpose : Handles business logic for product master lifecycle management
 * Used by : ProductController
 *
 * Responsibilities:
 * - Create product master records
 * - Restore soft-deleted products
 * - Fetch products with filters and pagination
 * - Retrieve single product details
 * - Update product information
 * - Soft-delete products
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Product master acts as source of truth
 * - Inventory quantities are handled separately
 * - Soft deletes preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Product,
  ProductSchema,
} from 'src/core/database/mongo/schema/product.schema';

import { ProductQueryDto } from './dto/product-query.dto';
import { PRODUCT } from './product.constants';
import { ProductCreateDto } from './dto/create-product.dto';
import { ProductUpdateDto } from './dto/update-product.dto';

@Injectable()
export class ProductService extends MongoRepository<Product> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Product.name, ProductSchema));
  }

  /**
   * Create Product
   * --------------
   * Purpose : Create new product or restore soft-deleted product
   *
   * Flow:
   * - Check for existing product (including soft-deleted)
   * - Restore soft-deleted product if found
   * - Create new product if not exists
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active products
   */
  async create(payload: ProductCreateDto) {
    return this.withTransaction(async (session) => {
      // Check existing product (including soft-deleted)
      const existing = await this.findOne(
        {
          $or: [
            { productId: payload.productId },
            { productSysCode: payload.productSysCode },
          ],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active product
      if (existing && !existing.isDeleted) {
        throw new ConflictException(PRODUCT.DUPLICATE);
      }

      // Restore soft-deleted product
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            name: payload.name,
            categoryId: payload.categoryId,
            productSysCode: payload.productSysCode,
            price: payload.price,
            netWeight: payload.netWeight,
            priceType: payload.priceType,
            unitType: payload.unitType,
            unitSize: payload.unitSize,
            unitQtyInCase: payload.unitQtyInCase,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: PRODUCT.CREATED,
          data: { productId: existing.productId },
        };
      }

      // Create new product
      const product = await this.save(
        {
          productId: payload.productId,
          name: payload.name,
          categoryId: payload.categoryId,
          productSysCode: payload.productSysCode,
          price: payload.price,
          netWeight: payload.netWeight,
          priceType: payload.priceType,
          unitType: payload.unitType,
          unitSize: payload.unitSize,
          unitQtyInCase: payload.unitQtyInCase,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: PRODUCT.CREATED,
        data: product,
      };
    });
  }

  /**
   * Get Products
   * ------------
   * Purpose : Retrieve products with filtering and pagination
   */
  async findAll(query: ProductQueryDto) {
    const { searchText, categoryId, status, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) filter.status = status;

    if (categoryId) filter.categoryId = categoryId;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { name: regex },
        { productSysCode: regex },
        { productId: regex },
      ];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Product by ID
   * -----------------
   * Purpose : Retrieve a single product
   */
  async findByProductId(productId: string) {
    const product = await this.findOne({ productId }, { lean: true });

    if (!product) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: product,
    };
  }

  /**
   * Update Product
   * --------------
   * Purpose : Update product master data
   */
  async update(productId: string, payload: ProductUpdateDto) {
    const product = await this.updateOne({ productId }, payload);

    if (!product) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.UPDATED,
      data: product,
    };
  }

  /**
   * Delete Product (Soft Delete)
   * ---------------------------
   * Purpose : Soft delete product
   */
  async delete(productId: string) {
    const deletedProduct = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { productId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(PRODUCT.NOT_FOUND);
      }

      await this.softDelete({ productId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.DELETED,
      data: deletedProduct,
    };
  }
}
