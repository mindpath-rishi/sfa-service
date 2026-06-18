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
  Price,
  PriceSchema,
} from 'src/core/database/mongo/schema/price.schema';

import { PRICE } from './price.constants';
import { CreatePriceDto } from './dto/create-price.dto';
import { UpdatePriceDto } from './dto/update-price.dto';
import { PriceQueryDto } from './dto/price-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';

@Injectable()
export class PriceService extends MongoRepository<Price> {
  constructor(
    mongo: MongoService,
    private readonly oracleRepository: OracleRepository,
  ) {
    super(mongo.getModel(Price.name, PriceSchema));
  }

  async create(payload: CreatePriceDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<Price> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(PRICE.DUPLICATE);
        }

        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...payload,
              status: 'ACTIVE',
              isDeleted: false,
            },
            { session },
          );

          return {
            statusCode: HttpStatus.OK,
            message: PRICE.CREATED,
            data: { priceId: existing.priceId },
          };
        }

        const doc = await this.save(
          {
            priceId: IdGenerator.generate('PRIC', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: PRICE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  /**
   * Sync Prices From ERP Oracle
   * ---------------------------
   * Source table : VAN_ASST_PRICE_MASTER
   * Target table : price_master
   */
  async syncPricesFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: 'OracleDB is disabled. Price sync skipped.',
        data: {
          synced: 0,
          skipped: true,
        },
      };
    }

    const toStringSafe = (value: any): string => {
      return String(value ?? '').trim();
    };

    const toNumberSafe = (value: any, defaultValue = 0): number => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : defaultValue;
    };

    const toDateSafe = (value: any): Date | null => {
      if (!value) return null;

      const date = new Date(value);

      if (Number.isNaN(date.getTime())) return null;

      return date;
    };

    const normalizeDateOnly = (date: Date): Date => {
      return new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
      );
    };

    const rows = await this.oracleRepository.query<any>(
      `
    SELECT
      VC_CATG_CODE       AS "categoryCode",
      VC_CATG_NAME       AS "categoryName",
      VC_ITEM_CODE       AS "productId",
      NU_EXCL_VAT        AS "priceExclVat",
      NU_INCL_VAT        AS "priceInclVat",
      DT_EFFECTIVE_DATE  AS "effectiveDate",
      PRICE_FLAG         AS "priceFlag",
      CH_STATUS          AS "status",
      CH_SYNC_STATUS     AS "syncStatus",
      DT_MOD_DATE        AS "modifiedDate",
      VC_COMP_CODE       AS "compCode",
      VC_SUP_ITEM_CODE   AS "supplierItemCode",
      VC_TAX             AS "tax"
    FROM VAN_ASST_PRICE_MASTER
    WHERE VC_ITEM_CODE IS NOT NULL
      AND VC_CATG_CODE IS NOT NULL
      AND DT_EFFECTIVE_DATE IS NOT NULL
    `,
    );

    if (!rows.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No prices found from ERP.',
        data: {
          synced: 0,
        },
      };
    }

    /**
     * Deduplicate ERP rows according to Mongo price uniqueness.
     * Current schema stores:
     * - productId
     * - categoryCode
     * - categoryName
     * - priceInclVat
     * - priceExclVat
     * - effectiveDate
     * - priceFlag
     */
    const uniqueRowsMap = new Map<string, any>();

    for (const row of rows) {
      const productId = toStringSafe(row.productId);
      const categoryCode = toStringSafe(row.categoryCode);
      const priceFlag = toStringSafe(row.priceFlag) || 'N';
      const effectiveDate = toDateSafe(row.effectiveDate);

      if (!productId || !categoryCode || !effectiveDate) continue;

      const normalizedEffectiveDate = normalizeDateOnly(effectiveDate);

      const uniqueKey = [
        productId,
        categoryCode,
        priceFlag,
        normalizedEffectiveDate.toISOString(),
      ].join('|');

      uniqueRowsMap.set(uniqueKey, {
        ...row,
        priceFlag,
        effectiveDate: normalizedEffectiveDate,
      });
    }

    const uniqueRows = Array.from(uniqueRowsMap.values());

    const operations = uniqueRows.map((row) => {
      const productId = toStringSafe(row.productId);
      const categoryCode = toStringSafe(row.categoryCode);
      const categoryName =
        toStringSafe(row.categoryName) || categoryCode || 'UNCATEGORIZED';

      const priceFlag = toStringSafe(row.priceFlag) || 'N';

      const effectiveDate = row.effectiveDate as Date;

      const priceInclVat = toNumberSafe(row.priceInclVat, 0);
      const priceExclVat = toNumberSafe(row.priceExclVat, 0);

      return {
        updateOne: {
          filter: {
            productId,
            categoryCode,
            priceFlag,
            effectiveDate,
          },
          update: {
            $set: {
              productId,
              categoryCode,
              categoryName,
              priceInclVat,
              priceExclVat,
              effectiveDate,
              priceFlag,
            },
            $setOnInsert: {
              priceId: IdGenerator.generate('PRIC', 8),
            },
          },
          upsert: true,
        },
      };
    });

    if (!operations.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No valid prices found from ERP.',
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
      message: 'ERP prices synced successfully.',
      data: {
        totalERPRecords: rows.length,
        totalUniqueRecords: uniqueRows.length,
        totalValidRecords: operations.length,
        inserted: result.upsertedCount || 0,
        updated: result.modifiedCount || 0,
        matched: result.matchedCount || 0,
        synced: operations.length,
      },
    };
  }

  async findAll(query: PriceQueryDto) {
    const { searchText, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Price> = {};

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ priceId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRICE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByPriceId(priceId: string) {
    const doc = await this.findOne({ priceId }, { lean: true });

    if (!doc) throw new NotFoundException(PRICE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: PRICE.FETCHED,
      data: doc,
    };
  }

  async update(priceId: string, dto: UpdatePriceDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ priceId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(PRICE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: PRICE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(priceId: string) {
    const existing = await this.findOne({ priceId });

    if (!existing) throw new NotFoundException(PRICE.NOT_FOUND);

    await this.softDelete({ priceId });

    return {
      statusCode: HttpStatus.OK,
      message: PRICE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(PRICE.DUPLICATE);
    }
    throw error;
  }
}
