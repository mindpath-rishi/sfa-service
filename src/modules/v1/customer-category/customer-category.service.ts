import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

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
import { NormalizeType } from 'src/shared/enums/normalize.enums';
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';
import { CustomerCategoryStatus } from 'src/shared/enums/customer-category.enums';

@Injectable()
export class CustomerCategoryService extends MongoRepository<CustomerCategory> {
  constructor(
    mongo: MongoService,
    private readonly oracleRepository: OracleRepository,
  ) {
    super(mongo.getModel(CustomerCategory.name, CustomerCategorySchema));
  }

  async create(payload: CreateCustomerCategoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(
            payload.name,
            NormalizeType.TITLE,
          );
        }

        const filter: FilterQuery<CustomerCategory> = {};

        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(CUSTOMER_CATEGORY.DUPLICATE);
        }

        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...payload,
              status: CustomerCategoryStatus.ACTIVE,
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

        const doc = await this.save(
          {
            customerCategoryId: IdGenerator.generate('CUST', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: CUSTOMER_CATEGORY.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  /**
   * Sync Customer Categories From ERP Oracle
   * ----------------------------------------
   * Source table : VAN_ASST_PRICE_MASTER
   * Target table : customer_category_master
   *
   * Mapping:
   * VC_CATG_CODE -> customerCategoryId
   * VC_CATG_NAME -> name
   */
  async syncCustomerCategoriesFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: 'OracleDB is disabled. Customer category sync skipped.',
        data: {
          synced: 0,
          skipped: true,
        },
      };
    }

    const toStringSafe = (value: any): string => {
      return String(value ?? '').trim();
    };

    const rows = await this.oracleRepository.query<any>(
      `
      SELECT DISTINCT
        VC_CATG_CODE AS "categoryCode",
        VC_CATG_NAME AS "categoryName"
      FROM VAN_ASST_PRICE_MASTER
      WHERE VC_CATG_CODE IS NOT NULL
      `,
    );

    if (!rows.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No customer categories found from ERP.',
        data: {
          synced: 0,
        },
      };
    }

    /**
     * Deduplicate by ERP category code.
     * Mongo customerCategoryId = ERP VC_CATG_CODE
     */
    const uniqueCategoryMap = new Map<
      string,
      {
        customerCategoryId: string;
        name: string;
      }
    >();

    for (const row of rows) {
      const categoryCode = toStringSafe(row.categoryCode);
      const categoryName = toStringSafe(row.categoryName);

      if (!categoryCode) continue;

      uniqueCategoryMap.set(categoryCode, {
        customerCategoryId: categoryCode,
        name: categoryName || categoryCode,
      });
    }

    const uniqueCategories = Array.from(uniqueCategoryMap.values());

    const operations = uniqueCategories.map((category) => {
      return {
        updateOne: {
          filter: {
            customerCategoryId: category.customerCategoryId,
          },
          update: {
            $set: {
              customerCategoryId: category.customerCategoryId,
              name: category.name,
              status: CustomerCategoryStatus.ACTIVE,
              isDeleted: false,
            },
          },
          upsert: true,
        },
      };
    });

    if (!operations.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No valid customer categories found from ERP.',
        data: {
          synced: 0,
        },
      };
    }

    const result = await this.model.bulkWrite(operations, {
      ordered: false,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'ERP customer categories synced successfully.',
      data: {
        totalERPRecords: rows.length,
        totalUniqueRecords: uniqueCategories.length,
        totalValidRecords: operations.length,
        inserted: result.upsertedCount || 0,
        updated: result.modifiedCount || 0,
        matched: result.matchedCount || 0,
        synced: operations.length,
      },
    };
  }

  async findAll(query: CustomerCategoryQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<CustomerCategory> = {};

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

  async findByCustomerCategoryId(customerCategoryId: string) {
    const doc = await this.findOne({ customerCategoryId }, { lean: true });

    if (!doc) throw new NotFoundException(CUSTOMER_CATEGORY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_CATEGORY.FETCHED,
      data: doc,
    };
  }

  async update(customerCategoryId: string, dto: UpdateCustomerCategoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne({ customerCategoryId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(CUSTOMER_CATEGORY.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: CUSTOMER_CATEGORY.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(customerCategoryId: string) {
    const existing = await this.findOne({ customerCategoryId });

    if (!existing) throw new NotFoundException(CUSTOMER_CATEGORY.NOT_FOUND);

    await this.softDelete({ customerCategoryId });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_CATEGORY.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CUSTOMER_CATEGORY.DUPLICATE);
    }

    throw error;
  }
}
