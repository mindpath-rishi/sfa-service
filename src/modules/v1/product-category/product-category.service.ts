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
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import { PRODUCT_CATEGORY } from './product-category.constants';
import {
  ProductCategory,
  ProductCategorySchema,
  ProductCategoryStatus,
  ProductCategoryType,
} from 'src/core/database/mongo/schema/product-category';
import { ProductCategoryCreateDto } from './dto/create-product-category.dto';
import { ProductCategoryQueryDto } from './dto/product-category-query.dto';
import { ProductCategoryUpdateDto } from './dto/update-product-category.dto';
import { StringCaseUtils } from 'src/shared/utils/string-case.units';

@Injectable()
export class ProductCategoryService extends MongoRepository<ProductCategory> implements OnModuleInit {
  constructor(mongo: MongoService) {
    super(mongo.getModel(ProductCategory.name, ProductCategorySchema));
  }

  async onModuleInit() {
    const indexes = await this.model.collection.indexes();
    const obsoleteNameIndex = indexes.find(
      (index) => index.unique && Object.keys(index.key).length === 1 && index.key.name === 1,
    );
    if (obsoleteNameIndex?.name) {
      await this.model.collection.dropIndex(obsoleteNameIndex.name);
    }
    await this.model.collection.createIndex(
      { type: 1, parentId: 1, name: 1 },
      { unique: true, name: 'unique_category_name_per_parent' },
    );
  }

  private async validateHierarchy(
    type: ProductCategoryType,
    parentId?: string,
    currentCategoryId?: string,
  ) {
    if (type === ProductCategoryType.PARENT) return undefined;
    if (!parentId) {
      throw new BadRequestException('Parent category is required for a child category.');
    }
    if (parentId === currentCategoryId) {
      throw new BadRequestException('A category cannot be its own parent.');
    }
    const parent = await this.findOne({
      categoryId: parentId,
      type: ProductCategoryType.PARENT,
      status: ProductCategoryStatus.ACTIVE,
    });
    if (!parent) {
      throw new BadRequestException('Active parent category not found.');
    }
    return parentId;
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
    const parentId = await this.validateHierarchy(payload.type, payload.parentId);
    return this.withTransaction(async (session) => {
      const categoryId = payload.categoryId.trim();
      const titleCaseName = StringCaseUtils.titleCase(payload.name);
      const nameScope = payload.type === ProductCategoryType.CHILD
        ? { type: payload.type, parentId, name: titleCaseName }
        : { type: payload.type, name: titleCaseName, parentId: { $exists: false } };
      const [existingById, existingByName] = await Promise.all([
        this.findOne({ categoryId }, { session, includeDeleted: true }),
        this.findOne(nameScope as any, { session, includeDeleted: true }),
      ]);

      if (
        (existingById && !existingById.isDeleted) ||
        (existingByName && !existingByName.isDeleted) ||
        (existingById && existingByName && String(existingById._id) !== String(existingByName._id))
      ) {
        throw new ConflictException(PRODUCT_CATEGORY.DUPLICATE);
      }

      const existing = existingById ?? existingByName;
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            categoryId,
            name: titleCaseName,
            type: payload.type,
            parentId,
            status: payload.status ?? ProductCategoryStatus.ACTIVE,
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
          categoryId,
          name: titleCaseName,
          type: payload.type,
          parentId,
          status: payload.status ?? ProductCategoryStatus.ACTIVE,
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
    const { status, searchText, type, parentId, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }
    if (type) filter.type = type;
    if (parentId) filter.parentId = parentId;

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
    const current = await this.findOne({ categoryId }, { lean: true });
    if (!current) throw new NotFoundException(PRODUCT_CATEGORY.NOT_FOUND);
    const nextType = dto.type ?? current.type ?? ProductCategoryType.PARENT;
    if (
      current.type === ProductCategoryType.PARENT &&
      nextType === ProductCategoryType.CHILD &&
      await this.exists({ parentId: categoryId, type: ProductCategoryType.CHILD })
    ) {
      throw new BadRequestException(
        'Cannot convert a parent category that has child categories.',
      );
    }
    const parentId = await this.validateHierarchy(
      nextType,
      dto.parentId ?? current.parentId,
      categoryId,
    );
    const formattedName = dto.name
      ? StringCaseUtils.titleCase(dto.name.trim())
      : current.name;
    const existing = await this.findOne({
      name: formattedName,
      type: nextType,
      ...(nextType === ProductCategoryType.CHILD
        ? { parentId }
        : { parentId: { $exists: false } }),
      categoryId: { $ne: categoryId } as any,
    } as any);
    if (existing) {
      throw new BadRequestException(PRODUCT_CATEGORY.DUPLICATE);
    }
    if (dto.name) dto.name = formattedName;

    // 2️⃣ Update category
    const category = await this.updateOne(
      { categoryId },
      nextType === ProductCategoryType.PARENT
        ? { $set: { ...dto, type: nextType }, $unset: { parentId: 1 } }
        : { $set: { ...dto, type: nextType, parentId } },
    );

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

      if (existing.type === ProductCategoryType.PARENT) {
        const childExists = await this.exists({
          parentId: categoryId,
          type: ProductCategoryType.CHILD,
        });
        if (childExists) {
          throw new BadRequestException('Cannot delete a parent category that has child categories.');
        }
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
