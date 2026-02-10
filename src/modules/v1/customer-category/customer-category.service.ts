/**
 * Customer Category Service
 * ------------------------
 * Purpose : Handles business logic for customer category lifecycle management
 * Used by : CustomerCategoryController
 *
 * Responsibilities:
 * - Create customer categories
 * - Restore soft-deleted categories
 * - Fetch category lists with filters and pagination
 * - Retrieve single category details
 * - Update category information
 * - Soft-delete categories
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Category name uniqueness is enforced
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
  CustomerCategory,
  CustomerCategorySchema,
} from 'src/core/database/mongo/schema/customer-category.schema';

import { CUSTOMER_CATEGORY } from './customer-category.constants';
import { CreateCustomerCategoryDto } from './dto/create-customer-category.dto';
import { UpdateCustomerCategoryDto } from './dto/update-customer-category.dto';
import { CustomerCategoryQueryDto } from './dto/customer-category-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/constants/normalize.constants';

@Injectable()
export class CustomerCategoryService extends MongoRepository<CustomerCategory> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(CustomerCategory.name, CustomerCategorySchema));
  }

  /**
   * Create Customer Category
   * -----------------------
   * Purpose : Create new category or restore soft-deleted category
   */
  async create(payload: CreateCustomerCategoryDto) {
    return this.withTransaction(async (session) => {
      const normalizedName = TextNormalizer.normalize(
        payload.name,
        NormalizeType.TITLE,
      );

      // Case-insensitive duplicate check
      const existing = await this.findOne(
        {
          name: { $regex: `^${normalizedName}$`, $options: 'i' } as any,
        },
        { session, includeDeleted: true },
      );

      if (existing && !existing.isDeleted) {
        throw new ConflictException(CUSTOMER_CATEGORY.DUPLICATE);
      }

      // Restore soft-deleted category
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            name: normalizedName,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: CUSTOMER_CATEGORY.CREATED,
          data: { customerCategoryId: existing.customerCategoryId },
        };
      }

      // Create new category
      const category = await this.save(
        {
          customerCategoryId: IdGenerator.generate('CCAT', 8),
          name: normalizedName,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: CUSTOMER_CATEGORY.CREATED,
        data: category,
      };
    });
  }

  /**
   * Get Customer Categories (List)
   * -----------------------------
   * Purpose : Retrieve categories with filtering and pagination
   */
  async findAll(query: CustomerCategoryQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ customerCategoryId: regex }, { name: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_CATEGORY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Customer Category by ID
   * --------------------------
   */
  async findByCustomerCategoryId(customerCategoryId: string) {
    const category = await this.findOne(
      { customerCategoryId },
      { lean: true },
    );

    if (!category) throw new NotFoundException(CUSTOMER_CATEGORY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_CATEGORY.FETCHED,
      data: category,
    };
  }

  /**
   * Update Customer Category
   * -----------------------
   */
  async update(customerCategoryId: string, dto: UpdateCustomerCategoryDto) {
    if (dto.name) {
      dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
    }

    const category = await this.updateOne({ customerCategoryId }, dto);

    if (!category) throw new NotFoundException(CUSTOMER_CATEGORY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_CATEGORY.UPDATED,
      data: category,
    };
  }

  /**
   * Delete Customer Category (Soft Delete)
   * -------------------------------------
   */
  async delete(customerCategoryId: string) {
    const deleted = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { customerCategoryId, isDeleted: false },
        { session },
      );

      if (!existing) throw new NotFoundException(CUSTOMER_CATEGORY.NOT_FOUND);

      await this.softDelete({ customerCategoryId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_CATEGORY.DELETED,
      data: deleted,
    };
  }
}
