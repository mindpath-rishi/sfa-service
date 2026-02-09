/**
 * Product Category Service
 * -----------------------
 * Purpose : Handles business logic for product category lifecycle management
 * Used by : ProductCategoryController
 *
 * Responsibilities:
 * - Create product categories
 * - Restore soft-deleted categories
 * - Fetch category lists with filters and pagination
 * - Retrieve single category details
 * - Update category information
 * - Soft-delete categories
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Category name uniqueness is enforced
 * - Soft deletes are used to preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';



import { PRODUCT_CATEGORY } from './product-category.constants';
import { ProductCategory, ProductCategorySchema } from 'src/core/database/mongo/schema/product-category';
import { ProductCategoryCreateDto } from './dto/create-product.dto';
import { ProductCategoryQueryDto } from './dto/product-category-query.dto';
import { ProductCategoryUpdateDto } from './dto/update-product-category.dto';

@Injectable()
export class ProductCategoryService extends MongoRepository<ProductCategory> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(ProductCategory.name, ProductCategorySchema));
  }

  /**
   * Create Product Category
   * ----------------------
   * Purpose : Create a new product category or restore soft-deleted category
   *
   * Flow:
   * - Check for existing category (including soft-deleted)
   * - Restore soft-deleted category if found
   * - Create new category if not exists
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active categories
   */
  async create(payload: ProductCategoryCreateDto) {
    return this.withTransaction(async (session) => {
      // Check existing category (including soft-deleted)
      const existing = await this.findOne(
        {
          $or: [{ categoryId: payload.categoryId }, { name: payload.name }],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active category
      if (existing && !existing.isDeleted) {
        throw new ConflictException(PRODUCT_CATEGORY.DUPLICATE);
      }

      // Restore soft-deleted category
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            name: payload.name,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: PRODUCT_CATEGORY.CREATED,
          data: { categoryId: existing.categoryId },
        };
      }

      // Create new category
      const category = await this.save(
        {
          categoryId: payload.categoryId,
          name: payload.name,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: PRODUCT_CATEGORY.CREATED,
        data: category,
      };
    });
  }

  /**
   * Get Product Categories (List)
   * -----------------------------
   * Purpose : Retrieve categories with filtering and pagination
   *
   * Supports:
   * - Status filtering
   * - Free-text search
   * - Pagination & sorting

  */
  async findAll(query: ProductCategoryQueryDto) {
    const { status, searchText, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ categoryId: regex }, { name: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT_CATEGORY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Product Category by ID
   * --------------------------
   * Purpose : Retrieve a single category
   */
  async findByCategoryId(categoryId: string) {
    const category = await this.findOne({ categoryId }, { lean: true });

    if (!category) {
      throw new NotFoundException(PRODUCT_CATEGORY.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT_CATEGORY.FETCHED,
      data: category,
    };
  }

  /**
   * Update Product Category
   * -----------------------
   * Purpose : Update editable category fields
   */
  async update(categoryId: string, dto: ProductCategoryUpdateDto) {
    const category = await this.updateOne({ categoryId }, dto);

    if (!category) {
      throw new NotFoundException(PRODUCT_CATEGORY.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT_CATEGORY.UPDATED,
      data: category,
    };
  }

  /**
   * Delete Product Category (Soft Delete)
   * ------------------------------------
   * Purpose : Soft delete product category
   *
   * Notes:
   * - Records remain for audit purposes
   */
  async delete(categoryId: string) {
    const deletedCategory = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { categoryId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(PRODUCT_CATEGORY.NOT_FOUND);
      }

      await this.softDelete({ categoryId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT_CATEGORY.DELETED,
      data: deletedCategory,
    };
  }
}
