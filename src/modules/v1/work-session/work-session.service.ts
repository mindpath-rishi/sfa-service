import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { Model } from 'mongoose';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';

import { WORK_SESSION } from './work-session.constants';
import { CreateWorkSessionDto } from './dto/create-work-session.dto';
import { UpdateWorkSessionDto } from './dto/update-work-session.dto';
import { WorkSessionQueryDto } from './dto/work-session-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { RequestContextStore } from 'src/core/context/request-context';
import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';
import { filter } from 'rxjs';
import { ActivityService } from '../activity/activity.service';
import { RouteSessionService } from '../route-session/route-session.service';
import { CreateActivityDto } from '../activity/dto/create-activity.dto';
import { CreateRouteSessionDto } from '../route-session/dto/create-route-session.dto';
import { ActivityStatus } from 'src/shared/enums/activity.enums';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';
import { VanDailyStockService } from '../van-daily-stock/van-daily-stock.service';
import { StockCountService } from '../stock-count/stock-count.service';
import { StockCountStatus } from 'src/shared/enums/stock-count.enums';
import { StockCountItemService } from '../stock-count-item/stock-count-item.service';
import { Van } from 'src/core/database/mongo/schema/van.schema';
import { VanInventoryService } from '../van-inventory/van-inventory.service';
import { InventoryTransaction } from 'src/core/database/mongo/schema/inventory-transaction.schema';
import { InventoryTransactionService } from '../inventory-transaction/inventory-transaction.service';
import { VanService } from '../van/van.service';
import { LeaveService } from '../leave/leave.service';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import {
  NotificationPlatform,
} from 'src/shared/enums/notification.enums';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class WorkSessionService extends MongoRepository<WorkSession> {
  private readonly employeeModel: Model<Employee>;

  constructor(
    mongo: MongoService,
    private readonly activityService: ActivityService,
    private readonly routeSessionService: RouteSessionService,
    private readonly vanDailyStockService: VanDailyStockService,
    private readonly stockCountService: StockCountService,
    private readonly stockCountItemService: StockCountItemService,
    private readonly inventoryService: VanInventoryService,
    private readonly inventoryTransactionService: InventoryTransactionService,
    private readonly vanService: VanService,
    private readonly leaveService: LeaveService,
    private readonly notificationService: NotificationService,
  ) {
    super(mongo.getModel(WorkSession.name, WorkSessionSchema));
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
  }

  async create(payload: CreateWorkSessionDto) {
    try {
      return await this.withTransaction(async (session) => {
        const requestedVanId = payload.requestedVanId;
        const ctx = RequestContextStore.getStore();

        /* ======================================================
         * CHECK EXISTING ACTIVE SESSION
         * ====================================================== */

        const filter: FilterQuery<WorkSession> = {
          userId: ctx?.userId,
          vanId: ctx?.vanId,
          status: WorkSessionStatus.ACTIVE,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(WORK_SESSION.DUPLICATE);
        }

        /* ======================================================
         * CREATE WORK SESSION
         * ====================================================== */

        const requestedVan = requestedVanId
          ? await this.vanService.findOne({ vanId: requestedVanId }, { session })
          : null;

        if (requestedVanId && !requestedVan) {
          throw new BadRequestException('Requested van not found');
        }

        const newWork: Partial<WorkSession> = {
          userId: ctx?.userId,
          userName: ctx?.name,
          vanId: payload.vanId || ctx?.vanId,
          vanName: ctx?.vanName,
          dayStartTime: new Date(),
          status: WorkSessionStatus.ACTIVE,
        };

        if (requestedVanId) {
          newWork.requestedVanId = requestedVanId;
          newWork.requestedVanName =
            payload.requestedVanName ||
            (requestedVan as any)?.name ||
            (requestedVan as any)?.vanName;
          newWork.vanChangeReason = payload.vanChangeReason;
          newWork.vanChangeStatus = 'PENDING';
        }

        // if (payl.routeId) {
        //   payload['routeId'] = reqBody.routeId;
        // }

        const workSessionDoc = await this.save(
          {
            workSessionId: IdGenerator.generate('WORK', 8),
            ...newWork,
          },
          { session },
        );

        /* ======================================================
         * CREATE ACTIVITY (SAME TRANSACTION)
         * ====================================================== */

        if (requestedVanId) {
          await this.notifyManagerForVanChange(workSessionDoc);
        } else {
          const activityPayload: CreateActivityDto & {
            vanId: any;
          } = {
            name: payload.activityName || 'Work Session',
            description: payload.description || '',
            workSessionId: workSessionDoc.workSessionId,
            routeId: payload.routeId,
            totalShops: payload.totalShops,
            routeName: payload.routeName,
            vanId: payload?.vanId,
          };

          await this.activityService.create(activityPayload, { session });
        }

        // if (payload.routeId) {
        //   const newRouteSession: CreateRouteSessionDto = {
        //     workSessionId: workSessionDoc.workSessionId,
        //     routeId: payload.routeId,
        //     totalShops: payload.totalShops || 0,
        //   };

        //   await this.routeSessionService.create(newRouteSession, { session });
        // }

        /* ======================================================
         * RESPONSE
         * ====================================================== */

        return {
          statusCode: HttpStatus.CREATED,
          message: WORK_SESSION.CREATED,
          data: workSessionDoc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: WorkSessionQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<WorkSession> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ workSessionId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: WORK_SESSION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  // async findByWorkSessionId(workSessionId: string) {
  //   const ctx = RequestContextStore.getStore();

  //   const filter = {
  //     $or: [
  //       { workSessionId },
  //       {
  //         userId: ctx?.userId,
  //         status: WorkSessionStatus.ACTIVE,
  //       },
  //     ],
  //   };
  //   const doc = await this.findOne(filter, { lean: true });

  //   if (!doc) throw new NotFoundException(WORK_SESSION.NOT_FOUND);

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: WORK_SESSION.FETCHED,
  //     data: doc,
  //   };
  // }

  async findByWorkSessionId(workSessionId: string) {
    const ctx = RequestContextStore.getStore();

    const pipeline: any[] = [
      {
        $match: {
          $or: [
            { workSessionId },
            {
              userId: ctx?.userId,
              status: WorkSessionStatus.ACTIVE,
            },
          ],
        },
      },

      /**
       * ✅ Get ACTIVE activity from activities collection
       */
      {
        $lookup: {
          from: 'activities', // collection name
          let: { wsId: '$workSessionId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$workSessionId', '$$wsId'] },
                    { $eq: ['$status', WorkSessionStatus.ACTIVE] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'activeActivity',
        },
      },
      {
        $unwind: {
          path: '$activeActivity',
          preserveNullAndEmptyArrays: true,
        },
      },

      /**
       * ✅ Get selected route
       */
      {
        $lookup: {
          from: 'routes_sessions',
          localField: 'workSessionId',
          foreignField: 'workSessionId',
          as: 'selectedRoute',
        },
      },
      {
        $unwind: {
          path: '$selectedRoute',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          isActiveActivity: {
            $cond: [{ $ifNull: ['$activeActivity', false] }, true, false],
          },
        },
      },

      /**
       * ✅ Final response
       */
      {
        $project: {
          _id: 0,
          workSessionId: 1,
          userId: 1,
          activityName: 1,
          status: 1,
          routeId: 1,
          totalShops: 1,
          isActiveActivity: 1,
          activeActivity: 1,

          // // ✅ activity details
          // activeActivity: {
          //   activityId: '$activeActivity.activityId',
          //   name: '$activeActivity.name',
          //   status: '$activeActivity.status',
          // },

          // ✅ route details
          selectedRoute: {
            routeId: 1,
            name: 1,
            distance: 1,
          },
        },
      },

      { $limit: 1 },
    ];

    const result = await this.model.aggregate(pipeline);
    const doc = result?.[0];

    if (!doc) {
      throw new NotFoundException(WORK_SESSION.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: WORK_SESSION.FETCHED,
      data: doc,
    };
  }

  async update() {
    try {
      return await this.withTransaction(async (session) => {
        const ctx = RequestContextStore.getStore();

        const filter: FilterQuery<WorkSession> = {
          userId: ctx?.userId,
          createdAt: new Date(),
          status: WorkSessionStatus.ACTIVE,
        };

        const toBeUpdate = {
          dayEndTime: new Date(),
          status: WorkSessionStatus.COMPLETED,
        };

        const doc = await this.updateOne(filter, toBeUpdate, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(WORK_SESSION.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: WORK_SESSION.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  // async complete() {
  //   try {
  //     return await this.withTransaction(async (session) => {
  //       const ctx = RequestContextStore.getStore();

  //       /* ===== TODAY START ===== */
  //       const startOfDay = new Date();
  //       startOfDay.setHours(0, 0, 0, 0);

  //       console.log(
  //         startOfDay,
  //         '==================start of day===============',
  //       );

  //       /* ===== 1. FIND ACTIVE WORK SESSION ===== */
  //       const workSession = await this.findOne({
  //         userId: ctx?.userId,
  //         createdAt: { $gte: startOfDay },
  //         status: WorkSessionStatus.ACTIVE,
  //       });

  //       if (!workSession) {
  //         throw new NotFoundException(WORK_SESSION.NOT_FOUND);
  //       }

  //       const { workSessionId } = workSession;

  //       /* ===== 2. COMPLETE WORK SESSION ===== */
  //       workSession.dayEndTime = new Date();
  //       workSession.status = WorkSessionStatus.COMPLETED;

  //       await workSession.save({ session });

  //       /* ===== 3. FIND ACTIVE ACTIVITY ===== */
  //       await this.activityService.updateOne(
  //         {
  //           workSessionId,
  //           status: ActivityStatus.ACTIVE,
  //         },
  //         {
  //           endTime: new Date(),
  //           status: ActivityStatus.COMPLETED,
  //         },
  //         {
  //           session,
  //         },
  //       );

  //       await /* ===== 3. FIND ACTIVE ACTIVITY ===== */
  //       await this.routeSessionService.updateOne(
  //         {
  //           workSessionId,
  //           status: RouteSessionStatus.ACTIVE,
  //         },
  //         {
  //           endTime: new Date(),
  //           status: RouteSessionStatus.COMPLETED,
  //         },
  //         {
  //           session,
  //         },
  //       );

  //       return {
  //         statusCode: HttpStatus.OK,
  //         message: WORK_SESSION.UPDATED,
  //         data: workSession,
  //       };
  //     });
  //   } catch (error) {
  //     this.handleDuplicateError(error);
  //   }
  // }

  // async getWorkSessionSummary(workSessionId: string) {
  //   try {
  //     /* ======================================================
  //      * 1. ROUTE SESSION SUMMARY
  //      * ====================================================== */

  //     const routeSummary = await this.routeSessionService.model.aggregate([
  //       {
  //         $match: {
  //           workSessionId,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalShops: { $sum: '$totalShops' },
  //           visitedShops: { $sum: '$visitedShops' },
  //         },
  //       },
  //     ]);

  //     /* ======================================================
  //      * 2. SALES SUMMARY
  //      * ====================================================== */

  //     const salesSummary = await this.salesService.model.aggregate([
  //       {
  //         $match: {
  //           workSessionId,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalQty: { $sum: '$totalQty' },
  //           totalValue: { $sum: '$grandTotal' },
  //         },
  //       },
  //     ]);

  //     /* ======================================================
  //      * 3. CUSTOMER PAYMENT SUMMARY
  //      * ====================================================== */

  //     const paymentSummary = await this.customerPaymentService.model.aggregate([
  //       {
  //         $match: {
  //           workSessionId,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalCollected: { $sum: '$amount' },
  //         },
  //       },
  //     ]);

  //     /* ======================================================
  //      * 4. FORMAT RESPONSE
  //      * ====================================================== */

  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Work session summary fetched successfully',
  //       data: {
  //         route: {
  //           totalShops: routeSummary[0]?.totalShops || 0,
  //           visitedShops: routeSummary[0]?.visitedShops || 0,
  //         },
  //         sales: {
  //           totalQty: salesSummary[0]?.totalQty || 0,
  //           totalValue: salesSummary[0]?.totalValue || 0,
  //         },
  //         payments: {
  //           totalCollected: paymentSummary[0]?.totalCollected || 0,
  //         },
  //       },
  //     };
  //   } catch (error) {
  //     throw error;
  //   }
  // }

  async complete(payload: any) {
    try {
      return await this.withTransaction(async (session) => {
        const ctx = RequestContextStore.getStore();

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        /* ======================================================
         * 1. FIND ACTIVE WORK SESSION
         * ====================================================== */
        const workSession = await this.findOne({
          userId: ctx?.userId,
          createdAt: { $gte: startOfDay },
          status: WorkSessionStatus.ACTIVE,
        });

        if (!workSession) {
          throw new NotFoundException(WORK_SESSION.NOT_FOUND);
        }

        const { workSessionId } = workSession;
        const vanId: any = workSession?.vanId;

        /* ======================================================
         * 2. COMPLETE WORK SESSION
         * ====================================================== */
        workSession.dayEndTime = new Date();
        workSession.status = WorkSessionStatus.COMPLETED;

        await workSession.save({ session });

        /* ======================================================
         * 3. COMPLETE ACTIVITY + ROUTE
         * ====================================================== */
        await this.activityService.updateOne(
          { workSessionId, status: ActivityStatus.ACTIVE },
          { endTime: new Date(), status: ActivityStatus.COMPLETED },
          { session },
        );

        await this.routeSessionService.updateOne(
          { workSessionId, status: RouteSessionStatus.ACTIVE },
          { endTime: new Date(), status: RouteSessionStatus.COMPLETED },
          { session },
        );

        /* ======================================================
         * 4. GET DAY END SUMMARY
         * ====================================================== */
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const summaryRes = await this.vanDailyStockService.getDayEndSummary(
          vanId,
          workSessionId,
        );

        console.log(
          summaryRes,
          '=================day end summary=================',
        );

        const summary: any = summaryRes?.data?.summary;
        const products = summaryRes?.data?.products || [];

        if (summary && products.length) {
          /* ======================================================
           * 5. CHECK EXISTING STOCK COUNT
           * ====================================================== */
          const existing = await this.stockCountService.findOne(
            { vanId, date: today },
            { session },
          );

          if (!existing) {
            /* ======================================================
             * 6. CREATE STOCK COUNT (HEADER)
             * ====================================================== */
            const stockCount = await this.stockCountService.save(
              {
                carryForwardStock: payload?.carryForwardStock || false,
                stockCountId: IdGenerator.generate('STOC', 8),
                workSessionId,
                vanId,
                employeeId: ctx?.userId,
                date: today,

                /* ===== SYSTEM (FROM NEW SUMMARY STRUCTURE) ===== */
                systemQty: summary?.closing?.qty || 0,
                systemCase: summary?.closing?.cases || 0,
                systemPiece: summary?.closing?.pieces || 0,
                systemWeight: summary?.closing?.weight || 0,
                systemValue: summary?.closing?.value || 0,

                /* INIT */
                countedQty: 0,
                varianceQty: 0,

                status: StockCountStatus.DRAFT,
              },
              { session },
            );

            /* ======================================================
             * 7. CREATE STOCK COUNT ITEMS
             * ====================================================== */
            const items = products.map((p) => {
              const closingQty = p.closingQty || 0;
              const closingValue = p.closingValue || 0;

              return {
                stockCountId: stockCount.stockCountId,
                productId: p.productId,
                productName: p.productName,
                vanId,

                /* ===== SYSTEM ===== */
                systemQty: closingQty,
                systemCases: p.closingCases || 0,
                systemPieces: p.closingPieces || 0,

                /* INIT COUNTED */
                countedQty: 0,
                countedCases: 0,
                countedPieces: 0,

                /* INIT VARIANCE */
                varianceQty: 0,

                /* PRICE */
                piecePrice: closingQty > 0 ? closingValue / closingQty : 0,

                systemValue: closingValue,
                countedValue: 0,
                varianceValue: 0,

                unitQtyInCase: p.unitQtyInCase,
              };
            });

            await this.stockCountItemService.bulkCreate(items, session);
          }
          const carryForward = payload?.carryForwardStock === true;

          console.log('Carry Forward Stock:', carryForward);

          if (!carryForward) {
            /* ============================================
             * 1. GET CURRENT INVENTORY BEFORE RESET
             * ============================================ */
            const inventories = await this.inventoryService.find({ vanId });

            console.log(
              inventories,
              '==================current inventories=================',
            );

            /* ============================================
             * 2. CREATE TRANSACTIONS (OUT)
             * ============================================ */
            const transactions = inventories
              .filter((inv) => inv.quantity > 0)
              .map((inv) => ({
                transactionId: IdGenerator.generate('TRX', 12),
                productId: inv.productId,
                vanId: inv.vanId,
                employeeId: ctx?.userId,
                warehouseId: payload?.warehouseId || 'WH-001',

                transactionType: 'UNLOAD',
                direction: 'OUT',

                quantity: inv.quantity,
                cases: 0, // or calculate if needed
                pieces: 0, // or calculate if needed

                referenceNo: workSessionId,
                remark: 'Day end stock reset (No Carry Forward)',

                transactionDate: new Date(),
                status: 'POSTED',
              }));

            if (transactions.length) {
              await this.inventoryTransactionService.bulkCreate(
                transactions as any,
                session,
              );
            }

            /* ============================================
             * 3. RESET INVENTORY
             * ============================================ */
            await this.inventoryService.updateMany(
              { vanId },
              {
                $set: {
                  quantity: 0,
                  reservedQuantity: 0,
                  updatedAt: new Date(),
                },
              },
              { session },
            );
          }
        }

        /* ======================================================
         * RESPONSE
         * ====================================================== */
        return {
          statusCode: HttpStatus.OK,
          message: WORK_SESSION.UPDATED,
          data: workSession,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  // async todayActivity() {
  //   const ctx = RequestContextStore.getStore();

  //   const todayStart = new Date();
  //   todayStart.setHours(0, 0, 0, 0);

  //   const todayEnd = new Date();
  //   todayEnd.setHours(23, 59, 59, 999);

  //   const pipeline: any[] = [
  //     /* ===== 1. MATCH ALL TODAY SESSIONS ===== */
  //     {
  //       $match: {
  //         userId: ctx?.userId,
  //         createdAt: {
  //           $gte: todayStart,
  //           $lte: todayEnd,
  //         },
  //       },
  //     },

  //     /* ===== 2. PRIORITIZE ACTIVE SESSION ===== */
  //     {
  //       $addFields: {
  //         isActive: {
  //           $cond: [{ $eq: ['$status', WorkSessionStatus.ACTIVE] }, 1, 0],
  //         },
  //       },
  //     },

  //     { $sort: { isActive: -1, createdAt: -1 } },

  //     /* ===== 3. PICK ONE SESSION ===== */
  //     { $limit: 1 },

  //     /* ===== 4. GET ACTIVITIES OF THIS SESSION ===== */
  //     {
  //       $lookup: {
  //         from: 'activities',
  //         let: { wsId: '$workSessionId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: { $eq: ['$workSessionId', '$$wsId'] },
  //             },
  //           },
  //           { $sort: { createdAt: -1 } },
  //         ],
  //         as: 'activities',
  //       },
  //     },

  //     /* ===== 5. GET ALL TODAY ACTIVITIES ===== */
  //     {
  //       $lookup: {
  //         from: 'activities',
  //         let: { userId: '$userId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: { $eq: ['$userId', '$$userId'] },
  //               createdAt: {
  //                 $gte: todayStart,
  //                 $lte: todayEnd,
  //               },
  //             },
  //           },
  //           { $sort: { createdAt: -1 } },
  //         ],
  //         as: 'todayAllActivities',
  //       },
  //     },

  //     /* ===== 6. SELECT ACTIVE ACTIVITY ===== */
  //     {
  //       $addFields: {
  //         activeActivity: {
  //           $first: {
  //             $filter: {
  //               input: '$activities',
  //               as: 'act',
  //               cond: {
  //                 $eq: ['$$act.status', WorkSessionStatus.ACTIVE],
  //               },
  //             },
  //           },
  //         },
  //       },
  //     },

  //     /* ===== 7. ROUTE (UNCHANGED) ===== */
  //     {
  //       $lookup: {
  //         from: 'route_sessions',
  //         let: { wsId: '$workSessionId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   { $eq: ['$workSessionId', '$$wsId'] },
  //                   { $eq: ['$status', WorkSessionStatus.ACTIVE] },
  //                 ],
  //               },
  //             },
  //           },
  //         ],
  //         as: 'selectedRoute',
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: '$selectedRoute',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* ===== 8. FINAL RESPONSE ===== */
  //     {
  //       $project: {
  //         _id: 0,
  //         workSessionId: 1,
  //         userId: 1,
  //         status: 1,
  //         activeActivity: 1,
  //         activities: 1, // session activities
  //         todayActivities: '$todayAllActivities', // all today activities
  //         selectedRoute: 1,
  //       },
  //     },
  //   ];
  //   const result = await this.model.aggregate(pipeline);
  //   const doc = result?.[0];

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: WORK_SESSION.FETCHED,
  //     data: doc,
  //   };
  // }

  async todayActivity() {
    const ctx = RequestContextStore.getStore();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const pipeline: any[] = [
      /* ===== 1. MATCH ALL TODAY SESSIONS ===== */
      {
        $match: {
          userId: ctx?.userId,
          createdAt: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        },
      },

      /* ===== 2. PRIORITIZE ACTIVE SESSION ===== */
      {
        $addFields: {
          isActive: {
            $cond: [{ $eq: ['$status', WorkSessionStatus.ACTIVE] }, 1, 0],
          },
        },
      },

      { $sort: { isActive: -1, createdAt: -1 } },

      /* ===== 3. PICK ONE SESSION ===== */
      { $limit: 1 },

      /* ===== 4. GET ACTIVITIES ===== */
      {
        $lookup: {
          from: 'activities',
          let: { wsId: '$workSessionId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$workSessionId', '$$wsId'] },
              },
            },
            { $sort: { createdAt: -1 } },
          ],
          as: 'activities',
        },
      },

      /* ===== 5. GET TODAY ACTIVITIES ===== */
      {
        $lookup: {
          from: 'activities',
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$userId'] },
                createdAt: {
                  $gte: todayStart,
                  $lte: todayEnd,
                },
              },
            },
            { $sort: { createdAt: -1 } },
          ],
          as: 'todayAllActivities',
        },
      },

      /* ===== 6. ACTIVE ACTIVITY ===== */
      {
        $addFields: {
          activeActivity: {
            $first: {
              $filter: {
                input: '$activities',
                as: 'act',
                cond: {
                  $eq: ['$$act.status', WorkSessionStatus.ACTIVE],
                },
              },
            },
          },
        },
      },

      /* ===== 7. ROUTE ===== */
      {
        $lookup: {
          from: 'route_sessions',
          let: { wsId: '$workSessionId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$workSessionId', '$$wsId'] },
                    { $eq: ['$status', WorkSessionStatus.ACTIVE] },
                  ],
                },
              },
            },
          ],
          as: 'selectedRoute',
        },
      },

      {
        $unwind: {
          path: '$selectedRoute',
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ===== 8. FINAL RESPONSE ===== */
      {
        $project: {
          _id: 0,
          type: 'WORK_SESSION',
          workSessionId: 1,
          userId: 1,
          status: 1,
          activeActivity: 1,
          activities: 1,
          todayActivities: '$todayAllActivities',
          selectedRoute: 1,
          createdAt: 1,
          vanId: 1,
          vanName: 1,
          requestedVanId: 1,
          requestedVanName: 1,
          vanChangeReason: 1,
          vanChangeStatus: 1,
          vanChangeApprovedAt: 1,
          vanChangeRejectedAt: 1,
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);

    const doc = result?.[0];

    /* ======================================================
     * IF WORK SESSION NOT FOUND
     * THEN FIND TODAY LEAVE
     * ====================================================== */

    if (!doc) {
      const leave = await this.leaveService.findOne({
        userId: ctx?.userId,
        createdAt: {
          $gte: todayStart,
          $lte: todayEnd,
        },
      });

      return {
        statusCode: HttpStatus.OK,
        message: leave
          ? 'Today leave fetched successfully'
          : WORK_SESSION.FETCHED,
        data: leave
          ? {
              type: 'LEAVE',
              leave,
            }
          : null,
      };
    }

    return {
      statusCode: HttpStatus.OK,
      message: WORK_SESSION.FETCHED,
      data: doc,
    };
  }

  async delete(workSessionId: string) {
    const existing = await this.findOne({ workSessionId });

    if (!existing) throw new NotFoundException(WORK_SESSION.NOT_FOUND);

    await this.softDelete({ workSessionId });

    return {
      statusCode: HttpStatus.OK,
      message: WORK_SESSION.DELETED,
      data: existing,
    };
  }

  async approveVanChange(workSessionId: string) {
    const ctx = RequestContextStore.getStore();
    const workSession = await this.findOne({ workSessionId });

    if (!workSession) throw new NotFoundException(WORK_SESSION.NOT_FOUND);
    if (workSession.vanChangeStatus !== 'PENDING' || !workSession.requestedVanId) {
      throw new BadRequestException('No pending van change request found');
    }

    await this.vanService.changeVan({
      oldVanId: workSession.vanId,
      employeeId: workSession.userId,
      vanId: workSession.requestedVanId,
    });

    await this.updateOne(
      { workSessionId },
      {
        vanId: workSession.requestedVanId,
        vanName: workSession.requestedVanName || workSession.vanName,
        vanChangeStatus: 'APPROVED',
        vanChangeApprovedBy: ctx?.userId,
        vanChangeApprovedAt: new Date(),
      },
      { new: true },
    );

    const updated = await this.findOne({ workSessionId });

    await this.notificationService.create({
      recipientId: workSession.userId,
      title: 'Van Change Approved',
      body: 'Your manager approved the van change. Please select a route to start retailing.',
      category: 'van_change',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'van_change',
        action: 'APPROVED',
        workSessionId,
        vanId: workSession.requestedVanId,
        route: '/(drawer)/(tabs)/home',
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Van change request approved',
      data: updated,
    };
  }

  async rejectVanChange(workSessionId: string) {
    const ctx = RequestContextStore.getStore();
    const workSession = await this.findOne({ workSessionId });

    if (!workSession) throw new NotFoundException(WORK_SESSION.NOT_FOUND);
    if (workSession.vanChangeStatus !== 'PENDING' || !workSession.requestedVanId) {
      throw new BadRequestException('No pending van change request found');
    }

    await this.updateOne(
      { workSessionId },
      {
        vanChangeStatus: 'REJECTED',
        vanChangeRejectedBy: ctx?.userId,
        vanChangeRejectedAt: new Date(),
      },
      { new: true },
    );

    const updated = await this.findOne({ workSessionId });

    await this.notificationService.create({
      recipientId: workSession.userId,
      title: 'Van Change Rejected',
      body: 'Your manager rejected the van change request. Continue with your currently mapped van.',
      category: 'van_change',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'van_change',
        action: 'REJECTED',
        workSessionId,
        route: '/(drawer)/(tabs)/home',
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Van change request rejected',
      data: updated,
    };
  }

  private async notifyManagerForVanChange(workSession: WorkSession) {
    const employee = await this.employeeModel
      .findOne({ employeeId: workSession.userId })
      .lean();

    const hierarchyPath = employee?.hierarchyPath || [];
    const managerId =
      employee?.reportsTo || hierarchyPath[hierarchyPath.length - 1];

    if (!managerId) return;

    await this.notificationService.create({
      recipientId: managerId,
      title: 'Van Change Approval Required',
      body: `${workSession.userName || 'Salesman'} requested ${workSession.requestedVanName || workSession.requestedVanId} for today.`,
      category: 'van_change',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'van_change',
        action: 'APPROVAL_REQUIRED',
        workSessionId: workSession.workSessionId,
        salesmanId: workSession.userId,
        salesmanName: workSession.userName,
        oldVanId: workSession.vanId,
        oldVanName: workSession.vanName,
        requestedVanId: workSession.requestedVanId,
        requestedVanName: workSession.requestedVanName,
        route: '/notifications',
      },
    });
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(WORK_SESSION.DUPLICATE);
    }
    throw error;
  }
}
