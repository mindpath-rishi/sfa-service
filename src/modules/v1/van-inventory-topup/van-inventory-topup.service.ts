import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  VanInventoryTopup,
  VanInventoryTopupSchema,
} from 'src/core/database/mongo/schema/van-inventory-topup.schema';

import { VAN_INVENTORY_TOPUP } from './van-inventory-topup.constants';
import { CreateVanInventoryTopupDto } from './dto/create-van-inventory-topup.dto';
import { UpdateVanInventoryTopupDto } from './dto/update-van-inventory-topup.dto';
import { VanInventoryTopupQueryDto } from './dto/van-inventory-topup-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { VanInventoryTopupItemService } from '../van-inventory-topup-item/van-inventory-topup-item.service';
import { ProductService } from '../product/product.service';
import { VanInventoryTopupStatus } from 'src/shared/enums/van-inventory-topup.enums';
import { VanInventoryService } from '../van-inventory/van-inventory.service';
import {
  Direction,
  InventoryTransactionStatus,
  TransactionType,
} from 'src/shared/enums/inventory-transaction.enums';
import { InventoryTransactionService } from '../inventory-transaction/inventory-transaction.service';
import { VanDailyStockService } from '../van-daily-stock/van-daily-stock.service';
import { VanDailyStockStatus } from 'src/shared/enums/van-daily-stock.enums';

@Injectable()
export class VanInventoryTopupService extends MongoRepository<VanInventoryTopup> {
  constructor(
    mongo: MongoService,
    private readonly vanInventoryTopupItemService: VanInventoryTopupItemService,
    private readonly productService: ProductService,
    private readonly vanInventoryService: VanInventoryService,
    private readonly inventoryTransactionService: InventoryTransactionService,
    private readonly vanDailyStockService: VanDailyStockService,
  ) {
    super(mongo.getModel(VanInventoryTopup.name, VanInventoryTopupSchema));
  }

  // async create(payload: CreateVanInventoryTopupDto) {
  //   try {
  //     return await this.withTransaction(async (session) => {
  //       /* ======================================================
  //        * 1. DUPLICATE VALIDATION
  //        * ====================================================== */
  //       if (payload.items?.length) {
  //         const seen = new Set();

  //         for (const item of payload.items) {
  //           if (seen.has(item.productId)) {
  //             throw new ConflictException(
  //               `Duplicate product in items: ${item.productId}`,
  //             );
  //           }
  //           seen.add(item.productId);
  //         }
  //       }

  //       /* ======================================================
  //        * 2. PROCESS ITEMS
  //        * ====================================================== */
  //       let totalRequestedQty = 0;
  //       let totalRequestedWeight = 0;
  //       let totalRequestedValue = 0;

  //       let totalApprovedQty = 0;
  //       let totalApprovedWeight = 0;
  //       let totalApprovedValue = 0;

  //       const processedItems: any[] = [];

  //       for (const item of payload.items) {
  //         const response = await this.productService.findByProductId(
  //           item.productId,
  //         );
  //         const product = response?.data;

  //         if (!product) {
  //           throw new BadRequestException(
  //             `Product not found: ${item.productId}`,
  //           );
  //         }

  //         const unitQtyInCase = product.unitQtyInCase || 1;
  //         const casePrice = product.casePrice || 0;
  //         const piecePrice = casePrice / unitQtyInCase;
  //         const pieceWeight = product.pieceNetWeight || 0;

  //         const requestedQty = item.requestedQty || 0;

  //         const requestedWeight = requestedQty * pieceWeight;
  //         const requestedValue = requestedQty * piecePrice;

  //         /* ================= TOTALS ================= */
  //         totalRequestedQty += requestedQty;
  //         totalRequestedWeight += requestedWeight;
  //         totalRequestedValue += requestedValue;

  //         /* ================= APPROVED = REQUESTED ================= */
  //         totalApprovedQty += requestedQty;
  //         totalApprovedWeight += requestedWeight;
  //         totalApprovedValue += requestedValue;

  //         processedItems.push({
  //           vanInventoryTopupId: '', // will attach later

  //           productId: item.productId,
  //           productName: product.name,

  //           /* REQUESTED */
  //           requestedQty,
  //           requestedWeight,
  //           requestedValue,
  //           requestedCaseQty: item.requestedCaseQty || 0,
  //           requestedPieceQty: item.requestedPieceQty || 0,

  //           /* APPROVED */
  //           approvedQty: requestedQty,
  //           approvedWeight: requestedWeight,
  //           approvedValue: requestedValue,
  //           approvedCaseQty: item.requestedCaseQty || 0,
  //           approvedPieceQty: item.requestedPieceQty || 0,

  //           /* PRICE */
  //           casePrice,
  //           piecePrice,

  //           /* WEIGHT */
  //           pieceNetWeight: pieceWeight,
  //           caseNetWeight: pieceWeight * unitQtyInCase,

  //           unitQtyInCase,
  //         });
  //       }

  //       /* ======================================================
  //        * 3. ANTI-TAMPER VALIDATION
  //        * ====================================================== */
  //       // if (
  //       //   (payload.totalRequestedQty ?? totalRequestedQty) !==
  //       //     totalRequestedQty ||
  //       //   (payload.totalRequestedWeight ?? totalRequestedWeight) !==
  //       //     totalRequestedWeight ||
  //       //   (payload.totalRequestedValue ?? totalRequestedValue) !==
  //       //     totalRequestedValue
  //       // ) {
  //       //   throw new ConflictException('Requested totals mismatch with items');
  //       // }

  //       /* ======================================================
  //        * 4. DUPLICATE CHECK
  //        * ====================================================== */
  //       const existing = await this.findOne(
  //         {
  //           vanId: payload.vanId,
  //           warehouseId: payload.warehouseId,
  //           date: payload.date,
  //         },
  //         { session, includeDeleted: true },
  //       );

  //       if (existing && !existing.isDeleted) {
  //         throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
  //       }

  //       /* ======================================================
  //        * 5. CREATE HEADER (APPROVED)
  //        * ====================================================== */
  //       const vanInventoryTopupId = IdGenerator.generate('VAN', 8);

  //       const doc = await this.save(
  //         {
  //           vanInventoryTopupId,
  //           ...payload,

  //           totalRequestedQty,
  //           totalRequestedWeight,
  //           totalRequestedValue,

  //           totalApprovedQty,
  //           totalApprovedWeight,
  //           totalApprovedValue,

  //           status: VanInventoryTopupStatus.APPROVED, // ✅ IMPORTANT
  //         },
  //         { session },
  //       );

  //       /* ======================================================
  //        * 6. ATTACH ID TO ITEMS
  //        * ====================================================== */
  //       const itemsToInsert = processedItems.map((item) => ({
  //         ...item,
  //         vanInventoryTopupId,
  //       }));

  //       /* ======================================================
  //        * 7. INSERT ITEMS
  //        * ====================================================== */
  //       await this.vanInventoryTopupItemService.insertMany(
  //         itemsToInsert,
  //         session,
  //       );

  //       /* ======================================================
  //        * 8. UPDATE VAN INVENTORY (CRITICAL)
  //        * ====================================================== */
  //       for (const item of itemsToInsert) {
  //         await this.vanInventoryService.updateOne(
  //           {
  //             vanId: payload.vanId,
  //             productId: item.productId,
  //           },
  //           {
  //             $inc: {
  //               quantity: item.approvedQty,
  //             },
  //             $setOnInsert: {
  //               vanId: payload.vanId,
  //               productId: item.productId,
  //             },
  //           },
  //           {
  //             upsert: true,
  //             session,
  //           },
  //         );
  //       }
  //       /* ======================================================
  //        * 9. (OPTIONAL) INVENTORY TRANSACTION LOG
  //        * ====================================================== */
  //       // await this.inventoryTransactionService.createMany(...)

  //       return {
  //         statusCode: HttpStatus.CREATED,
  //         message: VAN_INVENTORY_TOPUP.CREATED,
  //         data: doc,
  //       };
  //     });
  //   } catch (error) {
  //     this.handleDuplicateError(error);
  //   }
  // }

  async create(payload: CreateVanInventoryTopupDto) {
    try {
      return await this.withTransaction(async (session) => {
        /* ======================================================
         * 1. DUPLICATE VALIDATION
         * ====================================================== */
        if (payload.items?.length) {
          const seen = new Set();

          for (const item of payload.items) {
            if (seen.has(item.productId)) {
              throw new ConflictException(
                `Duplicate product in items: ${item.productId}`,
              );
            }
            seen.add(item.productId);
          }
        }

        /* ======================================================
         * 2. PROCESS ITEMS
         * ====================================================== */
        let totalRequestedQty = 0;
        let totalRequestedWeight = 0;
        let totalRequestedValue = 0;

        let totalApprovedQty = 0;
        let totalApprovedWeight = 0;
        let totalApprovedValue = 0;
        let totalApprovedCases = 0;
        let totalApprovedPieces = 0;

        const processedItems: any[] = [];

        for (const item of payload.items) {
          const response = await this.productService.findByProductId(
            item.productId,
          );
          const product = response?.data;

          if (!product) {
            throw new BadRequestException(
              `Product not found: ${item.productId}`,
            );
          }

          const unitQtyInCase = product.unitQtyInCase || 1;
          const casePrice = product.casePrice || 0;
          const piecePrice = casePrice / unitQtyInCase;
          const pieceWeight = product.pieceNetWeight || 0;

          const requestedQty = item.requestedQty || 0;

          const requestedWeight = requestedQty * pieceWeight;
          const requestedValue = requestedQty * piecePrice;

          totalRequestedQty += requestedQty;
          totalRequestedWeight += requestedWeight;
          totalRequestedValue += requestedValue;

          totalApprovedQty += requestedQty;
          totalApprovedWeight += requestedWeight;
          totalApprovedValue += requestedValue;
          totalApprovedCases += item.requestedCaseQty || 0;
          totalApprovedPieces += item.requestedPieceQty || 0;

          processedItems.push({
            vanInventoryTopupId: '',
            productId: item.productId,
            productName: product.name,

            requestedQty,
            requestedWeight,
            requestedValue,
            requestedCaseQty: item.requestedCaseQty || 0,
            requestedPieceQty: item.requestedPieceQty || 0,

            approvedQty: requestedQty,
            approvedWeight: requestedWeight,
            approvedValue: requestedValue,
            approvedCaseQty: item.requestedCaseQty || 0,
            approvedPieceQty: item.requestedPieceQty || 0,

            casePrice,
            piecePrice,

            pieceNetWeight: pieceWeight,
            caseNetWeight: pieceWeight * unitQtyInCase,

            unitQtyInCase,
          });
        }

        /* ======================================================
         * 3. DUPLICATE CHECK
         * ====================================================== */
        const existing = await this.findOne(
          {
            vanId: payload.vanId,
            warehouseId: payload.warehouseId,
            date: payload.date,
          },
          { session, includeDeleted: true },
        );

        // if (existing && !existing.isDeleted) {
        //   throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
        // }

        /* ======================================================
         * 4. CREATE HEADER
         * ====================================================== */
        const vanInventoryTopupId = IdGenerator.generate('INVTOP', 8);

        const doc = await this.save(
          {
            vanInventoryTopupId,
            ...payload,
            totalRequestedQty,
            totalRequestedWeight,
            totalRequestedValue,
            totalApprovedQty,
            totalApprovedWeight,
            totalApprovedValue,
            totalApprovedCases,
            totalApprovedPieces,
            status: VanInventoryTopupStatus.APPROVED,
          },
          { session },
        );

        /* ======================================================
         * 5. INSERT ITEMS
         * ====================================================== */
        const itemsToInsert = processedItems.map((item) => ({
          ...item,
          vanInventoryTopupId,
        }));

        await this.vanInventoryTopupItemService.insertMany(
          itemsToInsert,
          session,
        );

        /* ======================================================
         * 6. UPDATE VAN INVENTORY
         * ====================================================== */
        for (const item of itemsToInsert) {
          await this.vanInventoryService.updateOne(
            {
              vanId: payload.vanId,
              productId: item.productId,
            },
            {
              $inc: { quantity: item.approvedQty },
              $setOnInsert: {
                vanId: payload.vanId,
                productId: item.productId,
                inventoryId: IdGenerator.generate('INV', 8),
              },
            },
            { upsert: true, session },
          );
        }

        /* ======================================================
         * 7. INVENTORY TRANSACTION (HISTORY)
         * ====================================================== */
        const transactions = itemsToInsert.map((item) => ({
          transactionId: IdGenerator.generate('TRX', 10),

          productId: item.productId,
          vanId: payload.vanId,
          employeeId: payload.employeeId,
          warehouseId: payload.warehouseId,

          transactionType: TransactionType.LOAD,
          direction: Direction.IN,

          quantity: item.approvedQty,
          cases: item.approvedCaseQty || 0,
          pieces: item.approvedPieceQty || 0,

          referenceNo: vanInventoryTopupId,
          remark: 'Van Inventory Topup',

          transactionDate: payload.date || new Date(),
          status: InventoryTransactionStatus.POSTED,
        }));

        await this.inventoryTransactionService.bulkCreate(transactions, {
          session,
        });

        /* ======================================================
         * 8. VAN DAILY STOCK (UPSERT)
         * ====================================================== */
        const today = new Date(payload.date || new Date());
        today.setHours(0, 0, 0, 0);

        await this.vanDailyStockService.bulkUpdate(
          itemsToInsert.map((item) => ({
            filter: {
              date: today,
              vanId: payload.vanId,
              productId: item.productId,
            },
            update: {
              $set: {
                // ensure base fields exist if record already exists
                workSessionId: payload.workSessionId,
                employeeId: payload.employeeId,
              },

              $setOnInsert: {
                vanDailyStockId: IdGenerator.generate('VDS', 8),

                date: today,
                vanId: payload.vanId,

                productId: item.productId,
                unitQtyInCase: item.unitQtyInCase,
                piecePrice: item.piecePrice,
                pieceNetWeight: item.pieceNetWeight,

                openingQty: 0,
                outQty: 0,
                adjustmentQty: 0,
                // closingQty: 0,

                status: VanDailyStockStatus.DRAFT,
              },

              $inc: {
                inQty: item.approvedQty,
                closingQty: item.approvedQty,
              },
            },
          })),
          { session, upsert: true },
        );

        /* ======================================================
         * DONE
         * ====================================================== */
        return {
          statusCode: HttpStatus.CREATED,
          message: VAN_INVENTORY_TOPUP.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanInventoryTopupQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<VanInventoryTopup> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ vanInventoryTopupId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByVanInventoryTopupId(vanInventoryTopupId: string) {
    const result = await this.model.aggregate([
      { $match: { vanInventoryTopupId } },
      {
        $lookup: {
          from: 'van_inventory_topup_items',
          localField: 'vanInventoryTopupId',
          foreignField: 'vanInventoryTopupId',
          as: 'items',
        },
      },
      { $limit: 1 },
    ]);

    if (!result.length) {
      throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.FETCHED,
      data: result[0],
    };
  }

  async update(vanInventoryTopupId: string, dto: UpdateVanInventoryTopupDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ vanInventoryTopupId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_INVENTORY_TOPUP.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(vanInventoryTopupId: string) {
    const existing = await this.findOne({ vanInventoryTopupId });

    if (!existing) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

    await this.softDelete({ vanInventoryTopupId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
    }
    throw error;
  }
}
