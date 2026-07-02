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
import {
  VanInventoryTopupErpSyncStatus,
  VanInventoryTopupStatus,
} from 'src/shared/enums/van-inventory-topup.enums';
import { VanInventoryService } from '../van-inventory/van-inventory.service';
import {
  Direction,
  InventoryTransactionStatus,
  TransactionType,
} from 'src/shared/enums/inventory-transaction.enums';
import { InventoryTransactionService } from '../inventory-transaction/inventory-transaction.service';
import { VanDailyStockService } from '../van-daily-stock/van-daily-stock.service';
import { VanDailyStockStatus } from 'src/shared/enums/van-daily-stock.enums';
import { NotificationService } from '../notification/notification.service';
import { RequestContextStore } from 'src/core/context/request-context';
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';

@Injectable()
export class VanInventoryTopupService extends MongoRepository<VanInventoryTopup> {
  constructor(
    mongo: MongoService,
    private readonly vanInventoryTopupItemService: VanInventoryTopupItemService,
    private readonly productService: ProductService,
    private readonly vanInventoryService: VanInventoryService,
    private readonly inventoryTransactionService: InventoryTransactionService,
    private readonly vanDailyStockService: VanDailyStockService,
    private readonly notificationService: NotificationService,
    private readonly oracleRepository: OracleRepository,
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
        let totalRequestedCases = 0;
        let totalRequestedPieces = 0;

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
          const unitType = product.unitType || 'CS';
          const casePrice = product.casePrice || 0;
          const piecePrice = casePrice / unitQtyInCase;
          const pieceWeight = product.pieceNetWeight || 0;

          const requestedQty = item.requestedQty || 0;

          const requestedWeight = requestedQty * pieceWeight;
          const requestedValue = requestedQty * piecePrice;

          totalRequestedQty += requestedQty;
          totalRequestedWeight += requestedWeight;
          totalRequestedValue += requestedValue;
          totalRequestedCases += item.requestedCaseQty || 0;
          totalRequestedPieces += item.requestedPieceQty || 0;

          processedItems.push({
            vanInventoryTopupId: '',
            productId: item.productId,
            productName: product.name,

            requestedQty,
            requestedWeight,
            requestedValue,
            requestedCaseQty: item.requestedCaseQty || 0,
            requestedPieceQty: item.requestedPieceQty || 0,

            approvedQty: 0,
            approvedWeight: 0,
            approvedValue: 0,
            approvedCaseQty: 0,
            approvedPieceQty: 0,

            casePrice,
            piecePrice,

            pieceNetWeight: pieceWeight,
            caseNetWeight: pieceWeight * unitQtyInCase,

            unitQtyInCase,
            unitType,
          });
        }

        /* ======================================================
         * 4. CREATE HEADER
         * ====================================================== */
        const vanInventoryTopupId = IdGenerator.generate('INVTOP', 8);
        const erpRequestedAt = new Date();

        const doc = await this.save(
          {
            vanInventoryTopupId,
            ...payload,
            totalRequestedQty,
            totalRequestedWeight,
            totalRequestedValue,
            totalRequestedCases,
            totalRequestedPieces,
            totalApprovedQty,
            totalApprovedWeight,
            totalApprovedValue,
            totalApprovedCases,
            totalApprovedPieces,
            erpRequestNo: vanInventoryTopupId,
            erpRequestedAt,
            status: VanInventoryTopupStatus.SUBMITTED,
          },
          { session },
        );

        /* ======================================================
         * 5. INSERT ITEMS
         * ====================================================== */
        const itemsToInsert = processedItems.map((item, index) => ({
          ...item,
          vanInventoryTopupId,
          erpStockId: `${vanInventoryTopupId}-${index + 1}`,
          erpRequestSyncStatus: VanInventoryTopupErpSyncStatus.PENDING,
          erpStockTakeSyncStatus: VanInventoryTopupErpSyncStatus.PENDING,
        }));

        await this.vanInventoryTopupItemService.insertMany(
          itemsToInsert,
          session,
        );

        await this.exportItemsToErpStockRequest(doc, itemsToInsert, session);

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

  private async exportItemsToErpStockRequest(
    topup: any,
    items: any[],
    session?: any,
  ) {
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      try {
        if (!this.oracleRepository.isEnabled()) {
          throw new Error('OracleDB is disabled');
        }
        const requestedCases =
          Number(item.requestedCaseQty || 0) +
          Number(item.requestedPieceQty || 0) /
            Math.max(Number(item.unitQtyInCase || 1), 1);

        await this.oracleRepository.execute(
          `MERGE INTO VAN_STOCK_REQUEST target
           USING (SELECT :stockId AS VC_STOCK_ID FROM DUAL) source
           ON (target.VC_STOCK_ID = source.VC_STOCK_ID)
           WHEN NOT MATCHED THEN INSERT (
             VC_REQ_NO, VC_ITEM_CODE, VC_WH_CODE, VC_UNIT, DT_REQ_DATE,
             NU_QTY, VC_STOCK_ID, DT_DOC_DATE, CH_INT_UPD, DT_MOD_DATE,
             CH_CANCEL, DT_CREATE_DATETIME, VC_TIME
           ) VALUES (
             :requestNo, :itemCode, :vanId, :unit, :requestDate,
             :qty, :stockId, :documentDate, 'N', :modifiedDate,
             'N', :createdDateTime, :requestTime
           )`,
          {
            requestNo: topup.vanInventoryTopupId,
            itemCode: item.productId,
            vanId: topup.vanId,
            unit: item.unitType || 'CS',
            requestDate: topup.date,
            qty: requestedCases,
            stockId: item.erpStockId,
            documentDate: topup.date,
            modifiedDate: new Date(),
            createdDateTime: new Date().toISOString(),
            requestTime: new Date().toISOString(),
          },
          { autoCommit: true },
        );
        synced += 1;
        await this.vanInventoryTopupItemService.updateOne(
          {
            vanInventoryTopupId: topup.vanInventoryTopupId,
            productId: item.productId,
          },
          {
            $set: {
              erpRequestSyncStatus: VanInventoryTopupErpSyncStatus.SYNCED,
              erpRequestSyncedAt: new Date(),
              erpRequestSyncError: null,
            },
            $inc: { erpRequestSyncAttempts: 1 },
          },
          { session },
        );
      } catch (error) {
        failed += 1;
        await this.vanInventoryTopupItemService.updateOne(
          {
            vanInventoryTopupId: topup.vanInventoryTopupId,
            productId: item.productId,
          },
          {
            $set: {
              erpRequestSyncStatus: VanInventoryTopupErpSyncStatus.FAILED,
              erpRequestSyncError:
                error instanceof Error ? error.message : String(error),
            },
            $inc: { erpRequestSyncAttempts: 1 },
          },
          { session },
        );
      }
    }

    return { checked: items.length, synced, failed };
  }

  async syncTopupRequestsToERP() {
    const items = await this.vanInventoryTopupItemService.findLean({
      erpRequestSyncStatus: {
        $in: [
          VanInventoryTopupErpSyncStatus.PENDING,
          VanInventoryTopupErpSyncStatus.FAILED,
        ],
      },
    });
    let synced = 0;
    let failed = 0;

    for (const item of items) {
      const topup = await this.findOne({
        vanInventoryTopupId: item.vanInventoryTopupId,
      });
      if (!topup) continue;
      const result = await this.exportItemsToErpStockRequest(topup, [item]);
      synced += result.synced;
      failed += result.failed;
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'ERP top-up request export completed',
      data: { checked: items.length, synced, failed },
    };
  }

  async syncTopupApprovalsFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: 'OracleDB is disabled. Top-up approval sync skipped.',
        data: { approved: 0, skipped: true },
      };
    }

    const pendingTopups = await this.findLean({
      status: VanInventoryTopupStatus.SUBMITTED,
    });
    let approved = 0;

    for (const topup of pendingTopups) {
      const items = await this.vanInventoryTopupItemService.findLean({
        vanInventoryTopupId: topup.vanInventoryTopupId,
      });
      const stockIds = items
        .map((item) => item.erpStockId)
        .filter(Boolean) as string[];
      if (!stockIds.length) continue;

      await this.vanInventoryTopupItemService.updateMany(
        { vanInventoryTopupId: topup.vanInventoryTopupId },
        {
          $set: { erpStockTakeLastCheckedAt: new Date() },
          $inc: { erpStockTakeSyncAttempts: 1 },
        },
      );

      const binds: Record<string, string> = {};
      const placeholders = stockIds.map((stockId, index) => {
        const key = `stockId${index}`;
        binds[key] = stockId;
        return `:${key}`;
      });
      let rows: any[];
      try {
        rows = await this.oracleRepository.query<any>(
          `SELECT
           VC_STOCK_ID AS "stockId",
           VC_ITEM_CODE AS "itemCode",
           NU_AVAILABLE_QTY_CS AS "approvedCases",
           NU_AVAILABLE_QTY_PCS AS "approvedPieces",
           DT_STOCK_DATE AS "stockDate"
         FROM VAN_STOCK_TAKE
         WHERE VC_STOCK_ID IN (${placeholders.join(', ')})
           AND NVL(CH_SYNC_STATUS, 'N') IN ('N', 'Y')`,
          binds,
        );
      } catch (error) {
        await this.vanInventoryTopupItemService.updateMany(
          { vanInventoryTopupId: topup.vanInventoryTopupId },
          {
            $set: {
              erpStockTakeSyncStatus: VanInventoryTopupErpSyncStatus.FAILED,
              erpStockTakeSyncError:
                error instanceof Error ? error.message : String(error),
            },
          },
        );
        continue;
      }
      const rowsByStockId = new Map(
        rows.map((row) => [String(row.stockId), row]),
      );
      const allItemsApproved = stockIds.every((stockId) =>
        rowsByStockId.has(stockId),
      );

      let totalApprovedQty = 0;
      let totalApprovedCases = 0;
      let totalApprovedPieces = 0;
      let totalApprovedWeight = 0;
      let totalApprovedValue = 0;

      for (const item of items) {
        const row = rowsByStockId.get(String(item.erpStockId));
        if (!row) {
          await this.vanInventoryTopupItemService.updateOne(
            {
              vanInventoryTopupId: topup.vanInventoryTopupId,
              productId: item.productId,
            },
            {
              $set: {
                erpStockTakeSyncStatus: VanInventoryTopupErpSyncStatus.PENDING,
                erpStockTakeSyncError: null,
              },
            },
          );
          continue;
        }
        const approvedCaseQty = Number(row?.approvedCases || 0);
        const approvedPieceQty = Number(row?.approvedPieces || 0);
        const approvedQty =
          approvedCaseQty * Number(item.unitQtyInCase || 1) + approvedPieceQty;
        const approvedWeight = approvedQty * Number(item.pieceNetWeight || 0);
        const approvedValue = approvedQty * Number(item.piecePrice || 0);

        await this.vanInventoryTopupItemService.updateOne(
          {
            vanInventoryTopupId: topup.vanInventoryTopupId,
            productId: item.productId,
          },
          {
            $set: {
              approvedCaseQty,
              approvedPieceQty,
              approvedQty,
              approvedWeight,
              approvedValue,
              erpStockDate: row?.stockDate || new Date(),
              erpStockTakeSyncStatus: VanInventoryTopupErpSyncStatus.SYNCED,
              erpStockTakeSyncedAt: new Date(),
              erpStockTakeSyncError: null,
            },
          },
        );

        totalApprovedCases += approvedCaseQty;
        totalApprovedPieces += approvedPieceQty;
        totalApprovedQty += approvedQty;
        totalApprovedWeight += approvedWeight;
        totalApprovedValue += approvedValue;
      }

      if (!allItemsApproved) continue;

      const updated = await this.model.findOneAndUpdate(
        {
          vanInventoryTopupId: topup.vanInventoryTopupId,
          status: VanInventoryTopupStatus.SUBMITTED,
        },
        {
          $set: {
            totalApprovedCases,
            totalApprovedPieces,
            totalApprovedQty,
            totalApprovedWeight,
            totalApprovedValue,
            erpApprovedAt: new Date(),
            status: VanInventoryTopupStatus.APPROVED,
          },
        },
        { new: true },
      );

      if (updated) {
        approved += 1;
        await this.oracleRepository.executeMany(
          `UPDATE VAN_STOCK_TAKE
           SET CH_USED = 'Y', DT_MOD_DATE = SYSDATE
           WHERE VC_STOCK_ID = :stockId`,
          stockIds.map((stockId) => ({ stockId })),
        );
        await this.notifySalesmanTopupAwaitingAcceptance(updated);
      }
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'ERP top-up approvals synced successfully',
      data: { checked: pendingTopups.length, approved },
    };
  }

  async findAll(query: VanInventoryTopupQueryDto) {
    await this.syncTopupApprovalsFromERP().catch((error) => {
      console.error('ERP top-up approval sync failed:', error);
    });

    const {
      searchText,
      status,
      page = 1,
      limit = 20,
      vanId,
      employeeId,
      warehouseId,
      startDate,
      endDate,
      minValue,
      maxValue,
    } = query as VanInventoryTopupQueryDto & {
      startDate?: string;
      endDate?: string;
      minValue?: string | number;
      maxValue?: string | number;
    };

    const filter: FilterQuery<VanInventoryTopup> = {};

    if (status) {
      filter.status = Array.isArray(status) ? ({ $in: status } as any) : status;
    }
    if (vanId) filter.vanId = vanId;
    if (employeeId) filter.employeeId = employeeId;
    if (warehouseId) filter.warehouseId = warehouseId;

    if (startDate || endDate) {
      filter.date = {} as any;
      if (startDate) {
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);
        (filter.date as any).$gte = from;
      }
      if (endDate) {
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        (filter.date as any).$lte = to;
      }
    }

    if (minValue || maxValue) {
      filter.totalRequestedValue = {} as any;
      if (minValue) (filter.totalRequestedValue as any).$gte = Number(minValue);
      if (maxValue) (filter.totalRequestedValue as any).$lte = Number(maxValue);
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { vanName: regex },
        { employeeId: regex },
        { vanInventoryTopupId: regex },
      ];
    }

    const activeFilter = { ...filter, isDeleted: { $ne: true } } as any;
    const pageNumber = Math.max(1, Number(page) || 1);
    const pageLimit = Math.max(1, Number(limit) || 20);
    const skip = (pageNumber - 1) * pageLimit;

    const [items, total] = await Promise.all([
      this.model
        .find(activeFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean()
        .exec(),
      this.model.countDocuments(activeFilter),
    ]);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.FETCHED,
      data: items,
      meta: {
        total,
        page: pageNumber,
        limit: pageLimit,
        totalPages: Math.ceil(total / pageLimit),
      },
    };
  }

  async findByVanInventoryTopupId(vanInventoryTopupId: string) {
    await this.syncTopupApprovalsFromERP().catch((error) => {
      console.error('ERP top-up approval sync failed:', error);
    });

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
        const previous = await this.findOne(
          { vanInventoryTopupId },
          { session },
        );

        if (!previous)
          throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

        const doc = await this.model.findOneAndUpdate(
          { vanInventoryTopupId },
          dto,
          {
            session,
            new: true,
          },
        );

        if (!doc) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

        if (
          dto.status === VanInventoryTopupStatus.APPROVED &&
          previous.status !== VanInventoryTopupStatus.APPROVED
        ) {
          await this.notifySalesmanTopupAwaitingAcceptance(doc);
        }

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

  async accept(vanInventoryTopupId: string) {
    try {
      return await this.withTransaction(async (session) => {
        const topup = await this.model
          .findOne({ vanInventoryTopupId, isDeleted: { $ne: true } } as any)
          .session(session)
          .exec();

        if (!topup) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

        if (topup.status === VanInventoryTopupStatus.ACCEPTED) {
          return {
            statusCode: HttpStatus.OK,
            message: 'Top-up already accepted',
            data: topup,
          };
        }

        if (topup.status !== VanInventoryTopupStatus.APPROVED) {
          throw new BadRequestException(
            `Top-up cannot be accepted when status is ${topup.status}`,
          );
        }

        const items =
          await this.vanInventoryTopupItemService.findAllByVanInventoryTopupId(
            vanInventoryTopupId,
            session,
          );

        if (!items.length) {
          throw new BadRequestException('Top-up has no items to accept');
        }

        const acceptedBy =
          RequestContextStore.getStore()?.userId || topup.employeeId;
        const acceptedAt = new Date();

        const updated = await this.model.findOneAndUpdate(
          {
            vanInventoryTopupId,
            status: VanInventoryTopupStatus.APPROVED,
            isDeleted: { $ne: true },
          },
          {
            $set: {
              status: VanInventoryTopupStatus.ACCEPTED,
              acceptedBy,
              acceptedAt,
            },
          },
          { new: true, session },
        );

        if (!updated) {
          throw new BadRequestException(
            'Top-up is no longer available to accept',
          );
        }

        await this.postAcceptedTopupStock(topup, items, session);

        await this.markTopupNotificationResolved(
          vanInventoryTopupId,
          VanInventoryTopupStatus.ACCEPTED,
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: 'Top-up accepted and stock updated successfully',
          data: updated,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async rejectBySalesman(vanInventoryTopupId: string, reason?: string) {
    try {
      return await this.withTransaction(async (session) => {
        const topup = await this.model
          .findOne({ vanInventoryTopupId, isDeleted: { $ne: true } } as any)
          .session(session)
          .exec();

        if (!topup) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

        if (topup.status !== VanInventoryTopupStatus.APPROVED) {
          throw new BadRequestException(
            `Top-up cannot be rejected by salesman when status is ${topup.status}`,
          );
        }

        const declinedBy =
          RequestContextStore.getStore()?.userId || topup.employeeId;
        const declinedAt = new Date();

        const updated = await this.model.findOneAndUpdate(
          {
            vanInventoryTopupId,
            status: VanInventoryTopupStatus.APPROVED,
            isDeleted: { $ne: true },
          },
          {
            $set: {
              status: VanInventoryTopupStatus.DECLINED,
              declinedBy,
              declinedAt,
              declinedReason: reason || 'Declined by salesman',
            },
          },
          { new: true, session },
        );

        if (!updated) {
          throw new BadRequestException(
            'Top-up is no longer available to reject',
          );
        }

        await this.markTopupNotificationResolved(
          vanInventoryTopupId,
          VanInventoryTopupStatus.DECLINED,
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: 'Top-up rejected successfully',
          data: updated,
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

  private async postAcceptedTopupStock(topup: any, items: any[], session: any) {
    for (const item of items) {
      await this.vanInventoryService.updateOne(
        {
          vanId: topup.vanId,
          productId: item.productId,
        },
        {
          $inc: { quantity: item.approvedQty },
          $setOnInsert: {
            vanId: topup.vanId,
            productId: item.productId,
            inventoryId: IdGenerator.generate('INV', 8),
          },
        },
        { upsert: true, session },
      );
    }

    const transactions = items.map((item) => ({
      transactionId: IdGenerator.generate('INVENTORY_TRANSACTION', 10),
      productId: item.productId,
      vanId: topup.vanId,
      employeeId: topup.employeeId,
      warehouseId: topup.warehouseId,
      transactionType: TransactionType.LOAD,
      direction: Direction.IN,
      quantity: item.approvedQty,
      cases: item.approvedCaseQty || 0,
      pieces: item.approvedPieceQty || 0,
      referenceNo: topup.vanInventoryTopupId,
      remark: 'Van Inventory Topup Accepted',
      transactionDate: topup.date || new Date(),
      status: InventoryTransactionStatus.POSTED,
    }));

    await this.inventoryTransactionService.bulkCreate(transactions, {
      session,
    });

    const stockDate = new Date(topup.date || new Date());
    stockDate.setHours(0, 0, 0, 0);

    await this.vanDailyStockService.bulkUpdate(
      items.map((item) => ({
        filter: {
          date: stockDate,
          vanId: topup.vanId,
          productId: item.productId,
        },
        update: {
          $set: {
            workSessionId: topup.workSessionId,
            employeeId: topup.employeeId,
          },
          $setOnInsert: {
            vanDailyStockId: IdGenerator.generate('VDS', 8),
            date: stockDate,
            vanId: topup.vanId,
            productId: item.productId,
            unitQtyInCase: item.unitQtyInCase,
            piecePrice: item.piecePrice,
            pieceNetWeight: item.pieceNetWeight,
            openingQty: 0,
            outQty: 0,
            adjustmentQty: 0,
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
  }

  private async notifySalesmanTopupAwaitingAcceptance(topup: any) {
    if (!topup?.employeeId) return;

    await this.notificationService.create({
      recipientId: topup.employeeId,
      title: 'Top-up approved',
      body: `${topup.vanName || 'Your van'} top-up is approved. Accept it to update stock.`,
      category: 'topup',
      data: {
        category: 'topup',
        action: 'ACCEPTANCE_REQUIRED',
        status: VanInventoryTopupStatus.APPROVED,
        vanInventoryTopupId: topup.vanInventoryTopupId,
        vanId: topup.vanId,
        vanName: topup.vanName,
        route: `/topup/detail?id=${topup.vanInventoryTopupId}`,
      },
    });
  }

  private async markTopupNotificationResolved(
    vanInventoryTopupId: string,
    status: VanInventoryTopupStatus.ACCEPTED | VanInventoryTopupStatus.DECLINED,
    session?: any,
  ) {
    await this.notificationService.updateOne(
      {
        category: 'topup',
        'data.vanInventoryTopupId': vanInventoryTopupId,
        'data.action': 'ACCEPTANCE_REQUIRED',
      } as any,
      {
        $set: {
          isRead: true,
          readAt: new Date(),
          'data.status': status,
          'data.action': status,
          'data.resolvedAt': new Date(),
        },
      } as any,
      { session },
    );
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
    }
    throw error;
  }
}
