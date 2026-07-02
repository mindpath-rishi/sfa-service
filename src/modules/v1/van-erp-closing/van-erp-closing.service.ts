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
  VanErpClosing,
  VanErpClosingSchema,
} from 'src/core/database/mongo/schema/van-erp-closing.schema';

import { VAN_ERP_CLOSING } from './van-erp-closing.constants';
import { CreateVanErpClosingDto } from './dto/create-van-erp-closing.dto';
import { UpdateVanErpClosingDto } from './dto/update-van-erp-closing.dto';
import { VanErpClosingQueryDto } from './dto/van-erp-closing-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';
import { VanErpClosingStatus } from 'src/shared/enums/van-erp-closing.enums';

@Injectable()
export class VanErpClosingService extends MongoRepository<VanErpClosing> {
  constructor(
    mongo: MongoService,
    private readonly oracleRepository: OracleRepository,
  ) {
    super(mongo.getModel(VanErpClosing.name, VanErpClosingSchema));
  }

  async getLatestOpeningStock(vanId: string, asOf = new Date()) {
    const endOfDay = new Date(asOf);
    endOfDay.setHours(23, 59, 59, 999);

    return this.model.aggregate([
      {
        $match: {
          vanId,
          date: { $lte: endOfDay },
          isDeleted: { $ne: true },
        },
      },
      { $sort: { date: -1, modifiedDate: -1, updatedAt: -1 } },
      {
        $group: {
          _id: '$date',
          rows: { $push: '$$ROOT' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 1 },
      { $unwind: '$rows' },
      { $replaceRoot: { newRoot: '$rows' } },
      {
        $lookup: {
          from: 'product_master',
          localField: 'productId',
          foreignField: 'productId',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 0,
          productId: 1,
          erpClosingDate: '$date',
          closingCases: { $ifNull: ['$qtyInCase', '$qty'] },
          unitQtyInCase: { $ifNull: ['$product.unitQtyInCase', 1] },
          piecePrice: { $ifNull: ['$product.piecePrice', 0] },
          pieceNetWeight: { $ifNull: ['$product.pieceNetWeight', 0] },
        },
      },
    ]);
  }

  async create(payload: CreateVanErpClosingDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<VanErpClosing> = {
          date: payload.date,
          vanId: payload.vanId,
          productId: payload.productId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_ERP_CLOSING.DUPLICATE);
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
            message: VAN_ERP_CLOSING.CREATED,
            data: { stockId: existing.stockId },
          };
        }

        const doc = await this.save(
          {
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: VAN_ERP_CLOSING.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  /**
   * Sync Van Closing Stock From ERP Oracle
   * --------------------------------------
   * Source table : VAN_CLOSING_STOCK
   * Target table : van_erp_closing
   */
  async syncVanClosingStockFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: 'OracleDB is disabled. Van closing stock sync skipped.',
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
      VC_COMP_CODE      AS "compCode",
      VC_VAN_CODE       AS "vanCode",
      VC_ITEM_CODE      AS "itemCode",
      NU_QTY            AS "qty",
      DT_CLOSE_DATE     AS "closeDate",
      CH_SYNC_STATUS    AS "syncStatus",
      DT_MOD_DATE       AS "modifiedDate",
      NU_EPOCHTIME      AS "epochTime",
      VC_STOCK_ID       AS "erpStockId",
      VC_TIME           AS "time",
      DT_CREATE_DATE    AS "createdDate"
    FROM VAN_CLOSING_STOCK
    WHERE VC_VAN_CODE IS NOT NULL
      AND VC_ITEM_CODE IS NOT NULL
      AND DT_CLOSE_DATE IS NOT NULL
    `,
    );

    if (!rows.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No van closing stock found from ERP.',
        data: {
          synced: 0,
        },
      };
    }

    /**
     * Mongo unique index:
     * { date: 1, vanId: 1, productId: 1 }
     *
     * Deduplicate ERP rows using:
     * date + vanId + productId
     */
    const uniqueRowsMap = new Map<string, any>();

    for (const row of rows) {
      const vanId = toStringSafe(row.vanCode);
      const productId = toStringSafe(row.itemCode);
      const closeDate = toDateSafe(row.closeDate);

      if (!vanId || !productId || !closeDate) continue;

      const date = normalizeDateOnly(closeDate);

      const uniqueKey = [date.toISOString(), vanId, productId].join('|');

      uniqueRowsMap.set(uniqueKey, {
        ...row,
        vanId,
        productId,
        date,
      });
    }

    const uniqueRows = Array.from(uniqueRowsMap.values());

    const operations: any = uniqueRows.map((row) => {
      const date = row.date as Date;

      const compCode = toStringSafe(row.compCode);
      const vanCode = toStringSafe(row.vanCode);
      const itemCode = toStringSafe(row.itemCode);

      const vanId = toStringSafe(row.vanId);
      const productId = toStringSafe(row.productId);

      const qty = toNumberSafe(row.qty, 0);
      const qtyInCase = qty;

      const closeDate = toDateSafe(row.closeDate);
      const modifiedDate = toDateSafe(row.modifiedDate);
      const createdDate = toDateSafe(row.createdDate);

      const syncStatus = toStringSafe(row.syncStatus);
      const erpStockId = toStringSafe(row.erpStockId);
      const time = toStringSafe(row.time);
      const epochTime = toNumberSafe(row.epochTime, 0);

      const stockId =
        erpStockId ||
        `VCS-${date
          .toISOString()
          .slice(0, 10)
          .replace(/-/g, '')}-${vanId}-${productId}`;

      return {
        updateOne: {
          filter: {
            date,
            vanId,
            productId,
            stockId,
          },
          update: {
            $set: {
              /**
               * Normalized app fields
               */
              date,
              vanId,
              productId,
              qtyInCase,
              status: VanErpClosingStatus.SYNCED,

              /**
               * ERP original columns
               */
              compCode,
              vanCode,
              itemCode,
              qty,
              closeDate,
              syncStatus,
              modifiedDate,
              epochTime,
              erpStockId,
              time,
              createdDate,
            },

            /**
             * Do not overwrite Mongo createdAt every sync
             */
            $setOnInsert: {
              createdAt: createdDate || new Date(),
            },
          },
          upsert: true,
        },
      };
    });

    if (!operations.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No valid van closing stock found from ERP.',
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
      message: 'ERP van closing stock synced successfully.',
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

  async findAll(query: VanErpClosingQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<VanErpClosing> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ stockId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_ERP_CLOSING.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByStockId(stockId: string) {
    const doc = await this.findOne({ stockId }, { lean: true });

    if (!doc) throw new NotFoundException(VAN_ERP_CLOSING.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_ERP_CLOSING.FETCHED,
      data: doc,
    };
  }

  async update(stockId: string, dto: UpdateVanErpClosingDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ stockId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(VAN_ERP_CLOSING.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_ERP_CLOSING.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(stockId: string) {
    const existing = await this.findOne({ stockId });

    if (!existing) throw new NotFoundException(VAN_ERP_CLOSING.NOT_FOUND);

    await this.softDelete({ stockId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_ERP_CLOSING.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_ERP_CLOSING.DUPLICATE);
    }
    throw error;
  }
}
