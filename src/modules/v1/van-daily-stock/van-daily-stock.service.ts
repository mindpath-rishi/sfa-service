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
  VanDailyStock,
  VanDailyStockSchema,
} from 'src/core/database/mongo/schema/van-daily-stock.schema';

import { VAN_DAILY_STOCK } from './van-daily-stock.constants';
import { CreateVanDailyStockDto } from './dto/create-van-daily-stock.dto';
import { UpdateVanDailyStockDto } from './dto/update-van-daily-stock.dto';
import { VanDailyStockQueryDto } from './dto/van-daily-stock-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class VanDailyStockService extends MongoRepository<VanDailyStock> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(VanDailyStock.name, VanDailyStockSchema));
  }

  async create(payload: CreateVanDailyStockDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<VanDailyStock> = {
          date: payload.date,
          vanId: payload.vanId,
          productId: payload.productId,
          workSessionId: payload.workSessionId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_DAILY_STOCK.DUPLICATE);
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
            message: VAN_DAILY_STOCK.CREATED,
            data: { vanDailyStockId: existing.vanDailyStockId },
          };
        }

        const doc = await this.save(
          {
            vanDailyStockId: IdGenerator.generate('VAN_', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: VAN_DAILY_STOCK.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanDailyStockQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<VanDailyStock> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ vanDailyStockId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_DAILY_STOCK.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByVanDailyStockId(vanDailyStockId: string) {
    const doc = await this.findOne({ vanDailyStockId }, { lean: true });

    if (!doc) throw new NotFoundException(VAN_DAILY_STOCK.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_DAILY_STOCK.FETCHED,
      data: doc,
    };
  }

  async update(vanDailyStockId: string, dto: UpdateVanDailyStockDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ vanDailyStockId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(VAN_DAILY_STOCK.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_DAILY_STOCK.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(vanDailyStockId: string) {
    const existing = await this.findOne({ vanDailyStockId });

    if (!existing) throw new NotFoundException(VAN_DAILY_STOCK.NOT_FOUND);

    await this.softDelete({ vanDailyStockId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_DAILY_STOCK.DELETED,
      data: existing,
    };
  }

  // async getDayEndSummary(vanId: string, date?: Date) {
  //   try {
  //     const targetDate = new Date(date || new Date());
  //     targetDate.setHours(0, 0, 0, 0);

  //     const result = await this.model.aggregate([
  //       {
  //         $match: {
  //           vanId,
  //           date: targetDate,
  //         },
  //       },

  //       /* ================= JOIN PRODUCT ================= */
  //       {
  //         $lookup: {
  //           from: 'product_master',
  //           localField: 'productId',
  //           foreignField: 'productId',
  //           as: 'product',
  //         },
  //       },
  //       {
  //         $unwind: {
  //           path: '$product',
  //           preserveNullAndEmptyArrays: true,
  //         },
  //       },

  //       /* ================= CALCULATIONS ================= */
  //       {
  //         $addFields: {
  //           productName: '$product.name',

  //           /* ===== VALUE ===== */
  //           totalValue: {
  //             $multiply: ['$closingQty', '$piecePrice'],
  //           },

  //           // 🔥 NEW
  //           saleValue: {
  //             $multiply: ['$outQty', '$piecePrice'],
  //           },

  //           // 🔥 NEW
  //           leftStockValue: {
  //             $multiply: ['$closingQty', '$piecePrice'],
  //           },

  //           totalWeight: {
  //             $multiply: ['$closingQty', '$pieceNetWeight'],
  //           },

  //           /* ===== CASE / PIECE ===== */
  //           openingCases: {
  //             $floor: { $divide: ['$openingQty', '$unitQtyInCase'] },
  //           },
  //           openingPieces: {
  //             $mod: ['$openingQty', '$unitQtyInCase'],
  //           },

  //           inCases: {
  //             $floor: { $divide: ['$inQty', '$unitQtyInCase'] },
  //           },
  //           inPieces: {
  //             $mod: ['$inQty', '$unitQtyInCase'],
  //           },

  //           outCases: {
  //             $floor: { $divide: ['$outQty', '$unitQtyInCase'] },
  //           },
  //           outPieces: {
  //             $mod: ['$outQty', '$unitQtyInCase'],
  //           },

  //           closingCases: {
  //             $floor: { $divide: ['$closingQty', '$unitQtyInCase'] },
  //           },
  //           closingPieces: {
  //             $mod: ['$closingQty', '$unitQtyInCase'],
  //           },
  //         },
  //       },

  //       /* ================= GROUP ================= */
  //       {
  //         $group: {
  //           _id: null,

  //           totalProducts: { $sum: 1 },

  //           openingQty: { $sum: '$openingQty' },
  //           inQty: { $sum: '$inQty' },
  //           outQty: { $sum: '$outQty' },
  //           adjustmentQty: { $sum: '$adjustmentQty' },
  //           closingQty: { $sum: '$closingQty' },

  //           totalValue: { $sum: '$totalValue' },
  //           totalWeight: { $sum: '$totalWeight' },

  //           // 🔥 NEW
  //           saleTotal: { $sum: '$saleValue' },
  //           leftStockTotal: { $sum: '$leftStockValue' },

  //           products: {
  //             $push: {
  //               productId: '$productId',
  //               productName: '$productName',
  //               unitQtyInCase: '$unitQtyInCase',

  //               openingQty: '$openingQty',
  //               openingCases: '$openingCases',
  //               openingPieces: '$openingPieces',

  //               inQty: '$inQty',
  //               inCases: '$inCases',
  //               inPieces: '$inPieces',

  //               outQty: '$outQty',
  //               outCases: '$outCases',
  //               outPieces: '$outPieces',

  //               closingQty: '$closingQty',
  //               closingCases: '$closingCases',
  //               closingPieces: '$closingPieces',

  //               totalValue: '$totalValue',
  //               totalWeight: '$totalWeight',

  //               // 🔥 NEW
  //               saleValue: '$saleValue',
  //               leftStockValue: '$leftStockValue',
  //             },
  //           },
  //         },
  //       },
  //     ]);

  //     const data = result[0] || {};

  //     /* ======================================================
  //      * NORMALIZE SUMMARY CASE / PIECE
  //      * ====================================================== */

  //     let openingCases = 0,
  //       openingPieces = 0;
  //     let inCases = 0,
  //       inPieces = 0;
  //     let outCases = 0,
  //       outPieces = 0;
  //     let closingCases = 0,
  //       closingPieces = 0;

  //     for (const p of data.products || []) {
  //       const unit = p.unitQtyInCase || 1;

  //       // Opening
  //       openingCases += p.openingCases;
  //       openingPieces += p.openingPieces;
  //       let extra = Math.floor(openingPieces / unit);
  //       openingCases += extra;
  //       openingPieces %= unit;

  //       // In
  //       inCases += p.inCases;
  //       inPieces += p.inPieces;
  //       extra = Math.floor(inPieces / unit);
  //       inCases += extra;
  //       inPieces %= unit;

  //       // Out
  //       outCases += p.outCases;
  //       outPieces += p.outPieces;
  //       extra = Math.floor(outPieces / unit);
  //       outCases += extra;
  //       outPieces %= unit;

  //       // Closing
  //       closingCases += p.closingCases;
  //       closingPieces += p.closingPieces;
  //       extra = Math.floor(closingPieces / unit);
  //       closingCases += extra;
  //       closingPieces %= unit;
  //     }

  //     /* ======================================================
  //      * DERIVED METRICS
  //      * ====================================================== */

  //     const totalStockMoved = (data.inQty || 0) + (data.outQty || 0);

  //     const expectedClosing =
  //       (data.openingQty || 0) +
  //       (data.inQty || 0) -
  //       (data.outQty || 0) +
  //       (data.adjustmentQty || 0);

  //     const variance = (data.closingQty || 0) - expectedClosing;

  //     /* ======================================================
  //      * RESPONSE
  //      * ====================================================== */

  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Day end summary fetched successfully',
  //       data: {
  //         summary: {
  //           totalProducts: data.totalProducts || 0,

  //           stock: {
  //             openingQty: data.openingQty || 0,
  //             openingCases,
  //             openingPieces,

  //             inQty: data.inQty || 0,
  //             inCases,
  //             inPieces,

  //             outQty: data.outQty || 0,
  //             outCases,
  //             outPieces,

  //             adjustmentQty: data.adjustmentQty || 0,

  //             closingQty: data.closingQty || 0,
  //             closingCases,
  //             closingPieces,
  //           },

  //           value: {
  //             totalValue: data.totalValue || 0,
  //             totalWeight: data.totalWeight || 0,

  //             // 🔥 NEW
  //             saleTotal: data.saleTotal || 0,
  //             leftStockTotal: data.leftStockTotal || 0,
  //           },

  //           analytics: {
  //             totalStockMoved,
  //             expectedClosing,
  //             variance,
  //           },
  //         },

  //         products: data.products || [],
  //       },
  //     };
  //   } catch (error) {
  //     throw error;
  //   }
  // }

  //   async getDayEndSummary(vanId: string, date?: Date) {
  //   try {
  //     const targetDate = new Date(date || new Date());
  //     targetDate.setHours(0, 0, 0, 0);

  //     const result = await this.model.aggregate([
  //       {
  //         $match: {
  //           vanId,
  //           date: targetDate,
  //         },
  //       },

  //       /* ================= JOIN PRODUCT ================= */
  //       {
  //         $lookup: {
  //           from: 'product_master',
  //           localField: 'productId',
  //           foreignField: 'productId',
  //           as: 'product',
  //         },
  //       },
  //       {
  //         $unwind: {
  //           path: '$product',
  //           preserveNullAndEmptyArrays: true,
  //         },
  //       },

  //       /* ================= CALCULATIONS ================= */
  //       {
  //         $addFields: {
  //           productName: '$product.name',

  //           /* ===== VALUE ===== */
  //           openingValue: { $multiply: ['$openingQty', '$piecePrice'] },
  //           receivedValue: { $multiply: ['$inQty', '$piecePrice'] },
  //           soldValue: { $multiply: ['$outQty', '$piecePrice'] },
  //           closingValue: { $multiply: ['$closingQty', '$piecePrice'] },

  //           /* ===== WEIGHT ===== */
  //           openingWeight: { $multiply: ['$openingQty', '$pieceNetWeight'] },
  //           receivedWeight: { $multiply: ['$inQty', '$pieceNetWeight'] },
  //           soldWeight: { $multiply: ['$outQty', '$pieceNetWeight'] },
  //           closingWeight: { $multiply: ['$closingQty', '$pieceNetWeight'] },

  //           /* ===== CASE / PIECE ===== */
  //           openingCases: { $floor: { $divide: ['$openingQty', '$unitQtyInCase'] } },
  //           openingPieces: { $mod: ['$openingQty', '$unitQtyInCase'] },

  //           inCases: { $floor: { $divide: ['$inQty', '$unitQtyInCase'] } },
  //           inPieces: { $mod: ['$inQty', '$unitQtyInCase'] },

  //           outCases: { $floor: { $divide: ['$outQty', '$unitQtyInCase'] } },
  //           outPieces: { $mod: ['$outQty', '$unitQtyInCase'] },

  //           closingCases: { $floor: { $divide: ['$closingQty', '$unitQtyInCase'] } },
  //           closingPieces: { $mod: ['$closingQty', '$unitQtyInCase'] },
  //         },
  //       },

  //       /* ================= GROUP ================= */
  //       {
  //         $group: {
  //           _id: null,

  //           /* ===== TOTAL QTY ===== */
  //           openingQty: { $sum: '$openingQty' },
  //           inQty: { $sum: '$inQty' },
  //           outQty: { $sum: '$outQty' },
  //           closingQty: { $sum: '$closingQty' },

  //           /* ===== VALUE ===== */
  //           openingValue: { $sum: '$openingValue' },
  //           receivedValue: { $sum: '$receivedValue' },
  //           soldValue: { $sum: '$soldValue' },
  //           closingValue: { $sum: '$closingValue' },

  //           /* ===== WEIGHT ===== */
  //           openingWeight: { $sum: '$openingWeight' },
  //           receivedWeight: { $sum: '$receivedWeight' },
  //           soldWeight: { $sum: '$soldWeight' },
  //           closingWeight: { $sum: '$closingWeight' },

  //           products: {
  //             $push: {
  //               productId: '$productId',
  //               productName: '$productName',
  //               unitQtyInCase: '$unitQtyInCase',

  //               openingQty: '$openingQty',
  //               openingCases: '$openingCases',
  //               openingPieces: '$openingPieces',
  //               openingValue: '$openingValue',
  //               openingWeight: '$openingWeight',

  //               inQty: '$inQty',
  //               inCases: '$inCases',
  //               inPieces: '$inPieces',
  //               receivedValue: '$receivedValue',
  //               receivedWeight: '$receivedWeight',

  //               outQty: '$outQty',
  //               outCases: '$outCases',
  //               outPieces: '$outPieces',
  //               soldValue: '$soldValue',
  //               soldWeight: '$soldWeight',

  //               closingQty: '$closingQty',
  //               closingCases: '$closingCases',
  //               closingPieces: '$closingPieces',
  //               closingValue: '$closingValue',
  //               closingWeight: '$closingWeight',
  //             },
  //           },
  //         },
  //       },
  //     ]);

  //     const data = result[0] || {};

  //     /* ================= NORMALIZATION ================= */

  //     let openingCases = 0, openingPieces = 0;
  //     let inCases = 0, inPieces = 0;
  //     let outCases = 0, outPieces = 0;
  //     let closingCases = 0, closingPieces = 0;

  //     for (const p of data.products || []) {
  //       const unit = p.unitQtyInCase || 1;

  //       // Opening
  //       openingCases += p.openingCases;
  //       openingPieces += p.openingPieces;
  //       let extra = Math.floor(openingPieces / unit);
  //       openingCases += extra;
  //       openingPieces %= unit;

  //       // In
  //       inCases += p.inCases;
  //       inPieces += p.inPieces;
  //       extra = Math.floor(inPieces / unit);
  //       inCases += extra;
  //       inPieces %= unit;

  //       // Out
  //       outCases += p.outCases;
  //       outPieces += p.outPieces;
  //       extra = Math.floor(outPieces / unit);
  //       outCases += extra;
  //       outPieces %= unit;

  //       // Closing
  //       closingCases += p.closingCases;
  //       closingPieces += p.closingPieces;
  //       extra = Math.floor(closingPieces / unit);
  //       closingCases += extra;
  //       closingPieces %= unit;

  //       /* ===== PRODUCT ITEMS ===== */
  //       p.openingItems = p.openingCases + p.openingPieces;
  //       p.receivedItems = p.inCases + p.inPieces;
  //       p.soldItems = p.outCases + p.outPieces;
  //       p.closingItems = p.closingCases + p.closingPieces;
  //     }

  //     /* ================= SUMMARY ITEMS ================= */

  //     const openingItems = openingCases + openingPieces;
  //     const receivedItems = inCases + inPieces;
  //     const soldItems = outCases + outPieces;
  //     const closingItems = closingCases + closingPieces;

  //     /* ================= RESPONSE ================= */

  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Day end summary fetched successfully',
  //       data: {
  //         summary: {
  //           opening: {
  //             qty: data.openingQty || 0,
  //             cases: openingCases,
  //             pieces: openingPieces,
  //             items: openingItems,
  //             value: data.openingValue || 0,
  //             weight: data.openingWeight || 0,
  //           },
  //           received: {
  //             qty: data.inQty || 0,
  //             cases: inCases,
  //             pieces: inPieces,
  //             items: receivedItems,
  //             value: data.receivedValue || 0,
  //             weight: data.receivedWeight || 0,
  //           },
  //           sold: {
  //             qty: data.outQty || 0,
  //             cases: outCases,
  //             pieces: outPieces,
  //             items: soldItems,
  //             value: data.soldValue || 0,
  //             weight: data.soldWeight || 0,
  //           },
  //           closing: {
  //             qty: data.closingQty || 0,
  //             cases: closingCases,
  //             pieces: closingPieces,
  //             items: closingItems,
  //             value: data.closingValue || 0,
  //             weight: data.closingWeight || 0,
  //           },
  //         },

  //         products: data.products || [],
  //       },
  //     };
  //   } catch (error) {
  //     throw error;
  //   }
  // }

  async getDayEndSummary(vanId: string, workSessionId?: string, date?: Date) {
    console.log(
      vanId,
      workSessionId,
      date,
      '=================getDayEndSummary called=================',
    );
    try {
      const targetDate = new Date(date || new Date());
      targetDate.setHours(0, 0, 0, 0);

      const result = await this.model.aggregate([
        {
          $match: {
            vanId,
            workSessionId,
            date: { $gte: targetDate },
          },
        },
        {
          $lookup: {
            from: 'product_master',
            localField: 'productId',
            foreignField: 'productId',
            as: 'product',
          },
        },
        {
          $unwind: {
            path: '$product',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $addFields: {
            productName: '$product.name',

            openingValue: { $multiply: ['$openingQty', '$piecePrice'] },
            receivedValue: { $multiply: ['$inQty', '$piecePrice'] },
            soldValue: { $multiply: ['$outQty', '$piecePrice'] },
            closingValue: { $multiply: ['$closingQty', '$piecePrice'] },

            openingWeight: { $multiply: ['$openingQty', '$pieceNetWeight'] },
            receivedWeight: { $multiply: ['$inQty', '$pieceNetWeight'] },
            soldWeight: { $multiply: ['$outQty', '$pieceNetWeight'] },
            closingWeight: { $multiply: ['$closingQty', '$pieceNetWeight'] },

            openingCases: {
              $floor: { $divide: ['$openingQty', '$unitQtyInCase'] },
            },
            openingPieces: { $mod: ['$openingQty', '$unitQtyInCase'] },

            inCases: { $floor: { $divide: ['$inQty', '$unitQtyInCase'] } },
            inPieces: { $mod: ['$inQty', '$unitQtyInCase'] },

            outCases: { $floor: { $divide: ['$outQty', '$unitQtyInCase'] } },
            outPieces: { $mod: ['$outQty', '$unitQtyInCase'] },

            closingCases: {
              $floor: { $divide: ['$closingQty', '$unitQtyInCase'] },
            },
            closingPieces: { $mod: ['$closingQty', '$unitQtyInCase'] },
          },
        },
        {
          $group: {
            _id: null,
            openingQty: { $sum: '$openingQty' },
            inQty: { $sum: '$inQty' },
            outQty: { $sum: '$outQty' },
            closingQty: { $sum: '$closingQty' },

            openingValue: { $sum: '$openingValue' },
            receivedValue: { $sum: '$receivedValue' },
            soldValue: { $sum: '$soldValue' },
            closingValue: { $sum: '$closingValue' },

            openingWeight: { $sum: '$openingWeight' },
            receivedWeight: { $sum: '$receivedWeight' },
            soldWeight: { $sum: '$soldWeight' },
            closingWeight: { $sum: '$closingWeight' },

            products: {
              $push: {
                productId: '$productId',
                productName: '$productName',
                unitQtyInCase: '$unitQtyInCase',

                openingQty: '$openingQty',
                openingCases: '$openingCases',
                openingPieces: '$openingPieces',
                openingValue: '$openingValue',
                openingWeight: '$openingWeight',

                inQty: '$inQty',
                inCases: '$inCases',
                inPieces: '$inPieces',
                receivedValue: '$receivedValue',
                receivedWeight: '$receivedWeight',

                outQty: '$outQty',
                outCases: '$outCases',
                outPieces: '$outPieces',
                soldValue: '$soldValue',
                soldWeight: '$soldWeight',

                closingQty: '$closingQty',
                closingCases: '$closingCases',
                closingPieces: '$closingPieces',
                closingValue: '$closingValue',
                closingWeight: '$closingWeight',
              },
            },
          },
        },
      ]);

      const data = result[0] || {};

      /* ================= FIXED SUMMARY CALC ================= */

      let openingCases = 0;
      let openingPieces = 0;
      let inCases = 0;
      let inPieces = 0;
      let outCases = 0;
      let outPieces = 0;
      let closingCases = 0;
      let closingPieces = 0;

      for (const p of data.products || []) {
        openingCases += p.openingCases || 0;
        openingPieces += p.openingPieces || 0;

        inCases += p.inCases || 0;
        inPieces += p.inPieces || 0;

        outCases += p.outCases || 0;
        outPieces += p.outPieces || 0;

        closingCases += p.closingCases || 0;
        closingPieces += p.closingPieces || 0;

        // per product items
        p.openingItems = (p.openingCases || 0) + (p.openingPieces || 0);
        p.receivedItems = (p.inCases || 0) + (p.inPieces || 0);
        p.soldItems = (p.outCases || 0) + (p.outPieces || 0);
        p.closingItems = (p.closingCases || 0) + (p.closingPieces || 0);
      }

      const openingItems = openingCases + openingPieces;
      const receivedItems = inCases + inPieces;
      const soldItems = outCases + outPieces;
      const closingItems = closingCases + closingPieces;

      /* ================= RESPONSE ================= */

      return {
        statusCode: 200,
        message: 'Day end summary fetched successfully',
        data: {
          summary: {
            opening: {
              qty: data.openingQty || 0,
              cases: openingCases,
              pieces: openingPieces,
              items: openingItems,
              value: data.openingValue || 0,
              weight: data.openingWeight || 0,
            },
            received: {
              qty: data.inQty || 0,
              cases: inCases,
              pieces: inPieces,
              items: receivedItems,
              value: data.receivedValue || 0,
              weight: data.receivedWeight || 0,
            },
            sold: {
              qty: data.outQty || 0,
              cases: outCases,
              pieces: outPieces,
              items: soldItems,
              value: data.soldValue || 0,
              weight: data.soldWeight || 0,
            },
            closing: {
              qty: data.closingQty || 0,
              cases: closingCases,
              pieces: closingPieces,
              items: closingItems,
              value: data.closingValue || 0,
              weight: data.closingWeight || 0,
            },
          },
          products: data.products || [],
        },
      };
    } catch (error) {
      throw error;
    }
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_DAILY_STOCK.DUPLICATE);
    }
    throw error;
  }
}
