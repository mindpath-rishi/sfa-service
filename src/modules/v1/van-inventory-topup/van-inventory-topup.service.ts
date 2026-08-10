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
import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';
import { WorkSessionService } from '../work-session/work-session.service';

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
    private readonly workSessionService: WorkSessionService,
  ) {
    super(mongo.getModel(VanInventoryTopup.name, VanInventoryTopupSchema));
  }

  async create(payload: CreateVanInventoryTopupDto) {
    try {
      return await this.withTransaction(async (session) => {
        /* ======================================================
         * 1. DUPLICATE VALIDATION
         * ====================================================== */
        if (payload.items?.length) {
          const seen = new Set();

          for (const item of payload.items) {
            const productIdentifier = String(item.productId || '').trim();

            if (!productIdentifier) {
              throw new BadRequestException(
                'Every top-up item must have a product identifier',
              );
            }

            if (seen.has(productIdentifier)) {
              throw new ConflictException(
                `Duplicate product in items: ${productIdentifier}`,
              );
            }
            seen.add(productIdentifier);
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
        const resolvedProductIds = new Set<string>();

        for (const item of payload.items) {
          const productIdentifier = String(item.productId || '').trim();
          const product = await this.productService.findOne(
            {
              $or: [
                { productId: productIdentifier },
                { productSysCode: productIdentifier },
              ],
            },
            { lean: true },
          );

          if (!product) {
            throw new BadRequestException(
              `Product not found for identifier: ${productIdentifier}`,
            );
          }

          const productId = String(product.productId).trim();
          if (resolvedProductIds.has(productId)) {
            throw new ConflictException(
              `Duplicate product in items: ${productId}`,
            );
          }
          resolvedProductIds.add(productId);

          const unitQtyInCase = product.unitQtyInCase || 1;
          const unitType = product.unitType || 'CS';

          const casePrice = Number(item.casePrice ?? product.casePrice ?? 0);
          const piecePrice = Number(
            item.piecePrice ?? product.piecePrice ?? casePrice / unitQtyInCase,
          );
          const pieceWeight = Number(
            item.pieceNetWeight ?? product.pieceNetWeight ?? 0,
          );

          const requestedCaseQty = Number(item.requestedCaseQty || 0);
          const requestedPieceQty = Number(item.requestedPieceQty || 0);
          const requestedQty =
            requestedCaseQty * unitQtyInCase + requestedPieceQty;

          const requestedWeight = requestedQty * pieceWeight;
          const requestedValue =
            requestedCaseQty * casePrice + requestedPieceQty * piecePrice;

          totalRequestedQty += requestedQty;
          totalRequestedWeight += requestedWeight;
          totalRequestedValue += requestedValue;
          totalRequestedCases += requestedCaseQty;
          totalRequestedPieces += requestedPieceQty;

          processedItems.push({
            vanInventoryTopupId: '',
            productId,
            productName: product.name,
            compCode: product.compCode || item.compCode,

            requestedQty,
            requestedWeight,
            requestedValue,
            requestedCaseQty,
            requestedPieceQty,

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
         * 3. CREATE HEADER
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
         * 4. INSERT ITEMS
         * ====================================================== */
        const itemsToInsert = processedItems.map((item, index) => ({
          ...item,
          vanInventoryTopupId,
          erpStockId: `${vanInventoryTopupId}-${index + 1}`,
          erpRequestSyncStatus: VanInventoryTopupErpSyncStatus.PENDING,
          erpStockTakeSyncStatus: VanInventoryTopupErpSyncStatus.PENDING,
          erpTransferSyncStatus: VanInventoryTopupErpSyncStatus.PENDING,
        }));

        await this.vanInventoryTopupItemService.insertMany(
          itemsToInsert,
          session,
        );

        /* ======================================================
         * 5. EXPORT TO ERP
         * ====================================================== */
        await Promise.all([
          this.exportItemsToErpStockRequest(doc, itemsToInsert, session),
          this.exportItemsToErpStockTransfer(doc, itemsToInsert, session),
        ]);

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

  private async exportItemsToErpStockTransfer(
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

        await this.oracleRepository.execute(
          `MERGE INTO VAN_STOCK_TRANSFER target
         USING (
           SELECT
             :stockId AS VC_STOCK_ID
           FROM DUAL
         ) source
         ON (target.VC_STOCK_ID = source.VC_STOCK_ID)
         WHEN NOT MATCHED THEN
         INSERT (
           VC_TRANS_NO,
           VC_TO_WH_CODE,
           VC_FROM_WH_CODE,
           DT_TRANS_DATE,
           VC_ITEM_CODE,
           NU_QTY_CASES,
           NU_QTY_PCS,
           VC_STOCK_ID,
           DT_MOD_DATE,
           DT_CREATE_DATETIME,
           CH_APPROVE,
           VC_INDENT_ID,
           CH_STK_CANCEL
         )
         VALUES (
           :transferNo,
           :toWarehouseCode,
           :fromWarehouseCode,
           :transferDate,
           :itemCode,
           :caseQty,
           :pieceQty,
           :stockId,
           :modifiedDate,
           :createdDateTime,
           :approved,
           :indentId,
           :stockCancel
         )`,
          {
            transferNo: topup.vanInventoryTopupId,
            toWarehouseCode: topup.vanId,
            fromWarehouseCode: topup.fromWarehouseCode,
            transferDate: topup.date,
            itemCode: item.productId,
            caseQty: Number(item.requestedCaseQty || 0),
            pieceQty: Number(item.requestedPieceQty || 0),
            stockId: item.erpStockId,
            modifiedDate: new Date(),
            createdDateTime: new Date().toISOString(),
            approved: 'Y',
            indentId: topup.indentId || null,
            stockCancel: 'N',
          },
          { autoCommit: true },
        );

        synced++;

        await this.vanInventoryTopupItemService.updateOne(
          {
            vanInventoryTopupId: topup.vanInventoryTopupId,
            productId: item.productId,
          },
          {
            $set: {
              erpTransferSyncStatus: VanInventoryTopupErpSyncStatus.SYNCED,
              erpTransferSyncedAt: new Date(),
              erpTransferSyncError: null,
            },
            $inc: {
              erpTransferSyncAttempts: 1,
            },
          },
          { session },
        );
      } catch (error) {
        failed++;
        await this.vanInventoryTopupItemService.updateOne(
          {
            vanInventoryTopupId: topup.vanInventoryTopupId,
            productId: item.productId,
          },
          {
            $set: {
              erpTransferSyncStatus: VanInventoryTopupErpSyncStatus.FAILED,
              erpTransferSyncError:
                error instanceof Error ? error.message : String(error),
            },
            $inc: {
              erpTransferSyncAttempts: 1,
            },
          },
          { session },
        );
      }
    }

    return {
      checked: items.length,
      synced,
      failed,
    };
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
          $set: {
            erpStockTakeLastCheckedAt: new Date(),
          },
          $inc: {
            erpStockTakeSyncAttempts: 1,
          },
        },
      );

      const binds: Record<string, string> = {};

      const placeholders = stockIds.map((stockId, index) => {
        const key = `stockId${index}`;
        binds[key] = stockId;
        return `:${key}`;
      });

      let rows: any[] = [];

      try {
        rows = await this.oracleRepository.query<any>(
          `
        SELECT
          VC_STOCK_ID AS "stockId",
          VC_ITEM_CODE AS "itemCode",
          NU_QTY_CASES AS "approvedCases",
          NU_QTY_PCS AS "approvedPieces",
          DT_TRANS_DATE AS "stockDate",
          VC_TRANS_NO AS "transferNo",
          VC_INDENT_ID AS "indentId",
          CH_APPROVE AS "approveStatus",
          CH_STK_CANCEL AS "cancelStatus",
          VC_FROM_WH_CODE AS "fromWarehouseCode",
          VC_TO_WH_CODE AS "toWarehouseCode"
        FROM VAN_STOCK_TRANSFER
        WHERE VC_STOCK_ID IN (${placeholders.join(', ')})
          AND NVL(CH_APPROVE, 'N') = 'Y'
          AND NVL(CH_STK_CANCEL, 'N') <> 'Y'
        `,
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
        rowsByStockId.has(String(stockId)),
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

        const approvedCaseQty = Number(row.approvedCases || 0);
        const approvedPieceQty = Number(row.approvedPieces || 0);

        const unitQtyInCase = Number(item.unitQtyInCase || 1);

        const approvedQty = approvedCaseQty * unitQtyInCase + approvedPieceQty;

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

              erpStockDate: row.stockDate || new Date(),
              erpTransferNo: row.transferNo,
              erpIndentId: row.indentId,

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
          `
        UPDATE VAN_STOCK_TRANSFER
        SET DT_MOD_DATE = SYSDATE
        WHERE VC_STOCK_ID = :stockId
        `,
          stockIds.map((stockId) => ({ stockId })),
        );

        await this.notifySalesmanTopupAwaitingAcceptance(updated);
      }
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'ERP top-up approvals synced successfully',
      data: {
        checked: pendingTopups.length,
        approved,
      },
    };
  }

  async findAll(query: VanInventoryTopupQueryDto) {
    // await this.syncTopupApprovalsFromERP().catch((error) => {
    //   console.error('ERP top-up approval sync failed:', error);
    // });

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
    // await this.syncTopupApprovalsFromERP().catch((error) => {
    //   console.error('ERP top-up approval sync failed:', error);
    // });

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

  async adminApprove(vanInventoryTopupId: string) {
    const updated = await this.withTransaction(async (session) => {
      const topup = await this.findOne({ vanInventoryTopupId }, { session });

      if (!topup) {
        throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);
      }
      if (topup.status !== VanInventoryTopupStatus.SUBMITTED) {
        throw new BadRequestException(
          `Only submitted top-up requests can be approved. Current status is ${topup.status}`,
        );
      }

      const items =
        await this.vanInventoryTopupItemService.findAllByVanInventoryTopupId(
          vanInventoryTopupId,
          session,
        );

      if (!items.length) {
        throw new BadRequestException('Top-up request has no items to approve');
      }

      let totalApprovedQty = 0;
      let totalApprovedCases = 0;
      let totalApprovedPieces = 0;
      let totalApprovedWeight = 0;
      let totalApprovedValue = 0;

      const itemUpdates = items.map((item) => {
        const approvedQty = Number(item.requestedQty || 0);
        const approvedCaseQty = Number(item.requestedCaseQty || 0);
        const approvedPieceQty = Number(item.requestedPieceQty || 0);
        const approvedWeight = Number(item.requestedWeight || 0);
        const approvedValue = Number(item.requestedValue || 0);

        totalApprovedQty += approvedQty;
        totalApprovedCases += approvedCaseQty;
        totalApprovedPieces += approvedPieceQty;
        totalApprovedWeight += approvedWeight;
        totalApprovedValue += approvedValue;

        return {
          filter: {
            vanInventoryTopupId,
            productId: item.productId,
          },
          update: {
            $set: {
              approvedQty,
              approvedCaseQty,
              approvedPieceQty,
              approvedWeight,
              approvedValue,
            },
          },
        };
      });

      await this.vanInventoryTopupItemService.bulkUpdate(itemUpdates, {
        session,
      });

      const doc = await this.model.findOneAndUpdate(
        {
          vanInventoryTopupId,
          status: VanInventoryTopupStatus.SUBMITTED,
          isDeleted: { $ne: true },
        } as any,
        {
          $set: {
            status: VanInventoryTopupStatus.APPROVED,
            totalApprovedQty,
            totalApprovedCases,
            totalApprovedPieces,
            totalApprovedWeight,
            totalApprovedValue,
            adminResolvedAt: new Date(),
            adminResolvedBy: RequestContextStore.getStore()?.userId,
          },
          $unset: {
            adminRejectionReason: 1,
          },
        },
        { new: true, session },
      );

      if (!doc) {
        throw new BadRequestException(
          'Top-up request is no longer available for approval',
        );
      }

      return doc;
    });

    await this.notifySalesmanTopupAwaitingAcceptance(updated);

    return {
      statusCode: HttpStatus.OK,
      message: 'Top-up request approved successfully',
      data: updated,
    };
  }

  async adminReject(vanInventoryTopupId: string, reason?: string) {
    const rejectionReason = reason?.trim();
    if (!rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }
    if (rejectionReason.length > 500) {
      throw new BadRequestException(
        'Rejection reason cannot exceed 500 characters',
      );
    }

    const updated = await this.withTransaction(async (session) => {
      const topup = await this.findOne({ vanInventoryTopupId }, { session });

      if (!topup) {
        throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);
      }
      if (topup.status !== VanInventoryTopupStatus.SUBMITTED) {
        throw new BadRequestException(
          `Only submitted top-up requests can be rejected. Current status is ${topup.status}`,
        );
      }

      const doc = await this.model.findOneAndUpdate(
        {
          vanInventoryTopupId,
          status: VanInventoryTopupStatus.SUBMITTED,
          isDeleted: { $ne: true },
        } as any,
        {
          $set: {
            status: VanInventoryTopupStatus.REJECTED,
            adminResolvedAt: new Date(),
            adminResolvedBy: RequestContextStore.getStore()?.userId,
            adminRejectionReason: rejectionReason,
          },
        },
        { new: true, session },
      );

      if (!doc) {
        throw new BadRequestException(
          'Top-up request is no longer available for rejection',
        );
      }

      return doc;
    });

    if (updated.employeeId) {
      await this.notificationService.create({
        recipientId: updated.employeeId,
        title: 'Top-up rejected',
        body: `${updated.vanName || 'Your van'} top-up was rejected: ${rejectionReason}`,
        category: 'topup',
        data: {
          category: 'topup',
          action: VanInventoryTopupStatus.REJECTED,
          status: VanInventoryTopupStatus.REJECTED,
          vanInventoryTopupId: updated.vanInventoryTopupId,
          vanId: updated.vanId,
          vanName: updated.vanName,
          reason: rejectionReason,
          route: `/topup/detail?id=${updated.vanInventoryTopupId}`,
        },
      });
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Top-up request rejected successfully',
      data: updated,
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

  // async accept(vanInventoryTopupId: string) {
  //   try {
  //     return await this.withTransaction(async (session) => {
  //       const topup = await this.model
  //         .findOne({ vanInventoryTopupId, isDeleted: { $ne: true } } as any)
  //         .session(session)
  //         .exec();

  //       if (!topup) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

  //       if (topup.status === VanInventoryTopupStatus.ACCEPTED) {
  //         return {
  //           statusCode: HttpStatus.OK,
  //           message: 'Top-up already accepted',
  //           data: topup,
  //         };
  //       }

  //       if (topup.status !== VanInventoryTopupStatus.APPROVED) {
  //         throw new BadRequestException(
  //           `Top-up cannot be accepted when status is ${topup.status}`,
  //         );
  //       }

  //       const items =
  //         await this.vanInventoryTopupItemService.findAllByVanInventoryTopupId(
  //           vanInventoryTopupId,
  //           session,
  //         );

  //       if (!items.length) {
  //         throw new BadRequestException('Top-up has no items to accept');
  //       }

  //       const acceptedBy =
  //         RequestContextStore.getStore()?.userId || topup.employeeId;
  //       const acceptedAt = new Date();

  //       const updated = await this.model.findOneAndUpdate(
  //         {
  //           vanInventoryTopupId,
  //           status: VanInventoryTopupStatus.APPROVED,
  //           isDeleted: { $ne: true },
  //         },
  //         {
  //           $set: {
  //             status: VanInventoryTopupStatus.ACCEPTED,
  //             acceptedBy,
  //             acceptedAt,
  //           },
  //         },
  //         { new: true, session },
  //       );

  //       if (!updated) {
  //         throw new BadRequestException(
  //           'Top-up is no longer available to accept',
  //         );
  //       }

  //       await this.postAcceptedTopupStock(topup, items, session);

  //       await this.markTopupNotificationResolved(
  //         vanInventoryTopupId,
  //         VanInventoryTopupStatus.ACCEPTED,
  //         session,
  //       );

  //       return {
  //         statusCode: HttpStatus.OK,
  //         message: 'Top-up accepted and stock updated successfully',
  //         data: updated,
  //       };
  //     });
  //   } catch (error) {
  //     this.handleDuplicateError(error);
  //   }
  // }

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

        const ctx = RequestContextStore.getStore();

        const acceptedBy = ctx?.userId || topup.employeeId;
        const acceptedAt = new Date();

        /**
         * Get logged-in user's latest ACTIVE work session.
         * This will be passed into daily stock / inventory transaction.
         */
        const activeWorkSession = await this.workSessionService.findOne(
          {
            userId: acceptedBy,
            status: WorkSessionStatus.ACTIVE,
          },
          {
            sort: { createdAt: -1 },
            session,
          },
        );

        if (!activeWorkSession) {
          throw new BadRequestException(
            'No active work session found for the logged-in user',
          );
        }

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

        await this.postAcceptedTopupStock(
          topup,
          items,
          session,
          activeWorkSession,
        );

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

  // private async postAcceptedTopupStock(topup: any, items: any[], session: any) {
  //   for (const item of items) {
  //     await this.vanInventoryService.updateOne(
  //       {
  //         vanId: topup.vanId,
  //         productId: item.productId,
  //       },
  //       {
  //         $inc: { quantity: item.approvedQty },
  //         $setOnInsert: {
  //           vanId: topup.vanId,
  //           productId: item.productId,
  //           inventoryId: IdGenerator.generate('INV', 8),
  //         },
  //       },
  //       { upsert: true, session },
  //     );
  //   }

  //   const transactions = items.map((item) => ({
  //     transactionId: IdGenerator.generate('INVENTORY_TRANSACTION', 10),
  //     productId: item.productId,
  //     vanId: topup.vanId,
  //     employeeId: topup.employeeId,
  //     warehouseId: topup.warehouseId,
  //     transactionType: TransactionType.LOAD,
  //     direction: Direction.IN,
  //     quantity: item.approvedQty,
  //     cases: item.approvedCaseQty || 0,
  //     pieces: item.approvedPieceQty || 0,
  //     referenceNo: topup.vanInventoryTopupId,
  //     remark: 'Van Inventory Topup Accepted',
  //     transactionDate: topup.date || new Date(),
  //     status: InventoryTransactionStatus.POSTED,
  //   }));

  //   await this.inventoryTransactionService.bulkCreate(transactions, {
  //     session,
  //   });

  //   const stockDate = new Date(topup.date || new Date());
  //   stockDate.setHours(0, 0, 0, 0);

  //   await this.vanDailyStockService.bulkUpdate(
  //     items.map((item) => ({
  //       filter: {
  //         date: stockDate,
  //         vanId: topup.vanId,
  //         productId: item.productId,
  //       },
  //       update: {
  //         $set: {
  //           workSessionId: topup.workSessionId,
  //           employeeId: topup.employeeId,
  //         },
  //         $setOnInsert: {
  //           vanDailyStockId: IdGenerator.generate('VDS', 8),
  //           date: stockDate,
  //           vanId: topup.vanId,
  //           productId: item.productId,
  //           unitQtyInCase: item.unitQtyInCase,
  //           piecePrice: item.piecePrice,
  //           pieceNetWeight: item.pieceNetWeight,
  //           openingQty: 0,
  //           outQty: 0,
  //           adjustmentQty: 0,
  //           status: VanDailyStockStatus.DRAFT,
  //         },
  //         $inc: {
  //           inQty: item.approvedQty,
  //           closingQty: item.approvedQty,
  //         },
  //       },
  //     })),
  //     { session, upsert: true },
  //   );
  // }

  private async postAcceptedTopupStock(
    topup: any,
    items: any[],
    session: any,
    activeWorkSession: any,
  ) {
    const workSessionId = activeWorkSession?.workSessionId;
    const routeSessionId = activeWorkSession?.routeSessionId;

    if (!workSessionId) {
      throw new BadRequestException(
        'Active work session id is missing. Cannot post top-up stock.',
      );
    }

    for (const item of items) {
      const approvedQty = Number(item.approvedQty || 0);

      if (approvedQty <= 0) continue;

      await this.vanInventoryService.updateOne(
        {
          vanId: topup.vanId,
          productId: item.productId,
        },
        {
          $inc: {
            quantity: approvedQty,
          },
          $set: {
            updatedAt: new Date(),
          },
          $setOnInsert: {
            inventoryId: IdGenerator.generate('INV', 8),
            vanId: topup.vanId,
            productId: item.productId,
          },
        },
        { upsert: true, session },
      );
    }

    const transactions = items
      .filter((item) => Number(item.approvedQty || 0) > 0)
      .map((item) => ({
        transactionId: IdGenerator.generate('INVENTORY_TRANSACTION', 10),

        productId: item.productId,
        vanId: topup.vanId,
        employeeId: topup.employeeId,
        warehouseId: topup.warehouseId,

        workSessionId,
        routeSessionId,

        transactionType: TransactionType.LOAD,
        direction: Direction.IN,

        quantity: Number(item.approvedQty || 0),
        cases: Number(item.approvedCaseQty || 0),
        pieces: Number(item.approvedPieceQty || 0),

        referenceNo: topup.vanInventoryTopupId,
        remark: 'Van Inventory Topup Accepted',
        transactionDate: topup.date || new Date(),
        status: InventoryTransactionStatus.POSTED,
      }));

    if (transactions.length) {
      await this.inventoryTransactionService.bulkCreate(transactions, {
        session,
      });
    }

    const stockDate = new Date(topup.date || new Date());
    stockDate.setHours(0, 0, 0, 0);

    // const dailyStockUpdates = items
    //   .filter((item) => Number(item.approvedQty || 0) > 0)
    //   .map((item) => {
    //     const approvedQty = Number(item.approvedQty || 0);
    //     const approvedCases = Number(item.approvedCaseQty || 0);
    //     const approvedPieces = Number(item.approvedPieceQty || 0);

    //     return {
    //       filter: {
    //         date: stockDate,
    //         vanId: topup.vanId,
    //         productId: item.productId,
    //         workSessionId,
    //       },
    //       update: {
    //         $set: {
    //           employeeId: topup.employeeId,
    //           workSessionId,
    //           routeSessionId,
    //           updatedAt: new Date(),
    //         },
    //         $setOnInsert: {
    //           vanDailyStockId: IdGenerator.generate('VDS', 8),
    //           date: stockDate,
    //           vanId: topup.vanId,
    //           productId: item.productId,

    //           unitQtyInCase: Number(item.unitQtyInCase || 1),
    //           piecePrice: Number(item.piecePrice || 0),
    //           pieceNetWeight: Number(item.pieceNetWeight || 0),

    //           openingQty: 0,
    //           openingCases: 0,
    //           openingPieces: 0,

    //           outQty: 0,
    //           outCases: 0,
    //           outPieces: 0,

    //           adjustmentQty: 0,
    //           adjustmentCases: 0,
    //           adjustmentPieces: 0,

    //           closingQty: 0,
    //           closingCases: 0,
    //           closingPieces: 0,

    //           status: VanDailyStockStatus.DRAFT,
    //         },
    //         $inc: {
    //           inQty: approvedQty,
    //           inCases: approvedCases,
    //           inPieces: approvedPieces,

    //           closingQty: approvedQty,
    //           closingCases: approvedCases,
    //           closingPieces: approvedPieces,
    //         },
    //       },
    //     };
    //   });

    const dailyStockUpdates = items
      .filter((item) => Number(item.approvedQty || 0) > 0)
      .map((item) => {
        const approvedQty = Number(item.approvedQty || 0);
        const approvedCases = Number(item.approvedCaseQty || 0);
        const approvedPieces = Number(item.approvedPieceQty || 0);

        return {
          filter: {
            date: stockDate,
            vanId: topup.vanId,
            productId: item.productId,
            workSessionId,
          },
          update: {
            $set: {
              employeeId: topup.employeeId,
              workSessionId,
              routeSessionId,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              vanDailyStockId: IdGenerator.generate('VDS', 8),
              date: stockDate,
              vanId: topup.vanId,
              productId: item.productId,

              unitQtyInCase: Number(item.unitQtyInCase || 1),
              piecePrice: Number(item.piecePrice || 0),
              pieceNetWeight: Number(item.pieceNetWeight || 0),

              openingQty: 0,
              openingCases: 0,
              openingPieces: 0,

              outQty: 0,
              outCases: 0,
              outPieces: 0,

              adjustmentQty: 0,
              adjustmentCases: 0,
              adjustmentPieces: 0,

              status: VanDailyStockStatus.DRAFT,
            },
            $inc: {
              inQty: approvedQty,
              inCases: approvedCases,
              inPieces: approvedPieces,

              closingQty: approvedQty,
              closingCases: approvedCases,
              closingPieces: approvedPieces,
            },
          },
        };
      });
    if (dailyStockUpdates.length) {
      await this.vanDailyStockService.bulkUpdate(dailyStockUpdates, {
        session,
        upsert: true,
      });
    }
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
