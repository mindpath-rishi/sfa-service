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
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import { Model } from 'mongoose';
import { LeaveService } from '../leave/leave.service';
import { StockUnloadRequestService } from '../stock-unload-request/stock-unload-request.service';

@Injectable()
export class WorkSessionService extends MongoRepository<WorkSession> {
  private readonly vanModel: Model<Van>;

  constructor(
    mongo: MongoService,
    private readonly activityService: ActivityService,
    private readonly routeSessionService: RouteSessionService,
    private readonly vanDailyStockService: VanDailyStockService,
    private readonly stockCountService: StockCountService,
    private readonly stockCountItemService: StockCountItemService,
    private readonly leaveService: LeaveService,
    private readonly stockUnloadRequestService: StockUnloadRequestService,
  ) {
    super(mongo.getModel(WorkSession.name, WorkSessionSchema));
    this.vanModel = mongo.getModel(Van.name, VanSchema);
  }

  private normalizeLocation(location?: any) {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return undefined;
    }

    return {
      latitude,
      longitude,
      accuracy: location?.accuracy,
      altitude: location?.altitude,
      speed: location?.speed,
      capturedAt: location?.capturedAt || new Date(),
    };
  }

  async create(payload: CreateWorkSessionDto) {
    try {
      return await this.withTransaction(async (session) => {
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

        const dayStartLocation = this.normalizeLocation(
          payload.dayStartLocation || (payload as any).startLocation,
        );
        const vanId = payload.vanId || ctx?.vanId;
        const van = vanId
          ? await this.vanModel
              .findOne({ vanId, isDeleted: { $ne: true } })
              .select('name driverEmployeeId driverName')
              .session(session)
              .lean()
          : undefined;

        const newWork: Partial<WorkSession> = {
          userId: ctx?.userId,
          userName: ctx?.name,
          vanId,
          vanName: van?.name || ctx?.vanName,
          driverEmployeeId: van?.driverEmployeeId,
          driverName: van?.driverName,
          dayStartTime: new Date(),
          dayStartImageMediaId: payload.dayStartImageMediaId,
          dayStartImageUrl: payload.dayStartImageUrl,
          dayStartLocation,
          status: WorkSessionStatus.ACTIVE,
        };

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

        const activityPayload: CreateActivityDto & {
          vanId: any;
        } = {
          name: payload.activityName || 'Work Session',
          description: payload.description || '',
          workSessionId: workSessionDoc.workSessionId,
          routeId: payload.routeId,
          totalShops: payload.totalShops,
          routeName: payload.routeName,
          customerCategoryId: payload.customerCategoryId,
          vanId: payload?.vanId,
        };

        await this.activityService.create(activityPayload, { session });

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

      /** Latest request is the source of truth for van-change dashboard state. */
      {
        $lookup: {
          from: 'van_change_requests',
          let: { wsId: '$workSessionId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$workSessionId', '$$wsId'] },
                isDeleted: { $ne: true },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'vanChangeRequest',
        },
      },
      {
        $unwind: {
          path: '$vanChangeRequest',
          preserveNullAndEmptyArrays: true,
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
          dayStartTime: 1,
          dayEndTime: 1,
          routeId: 1,
          totalShops: 1,
          isActiveActivity: 1,
          activeActivity: 1,
          vanChangeRequestId: '$vanChangeRequest.vanChangeRequestId',
          vanChangeStatus: '$vanChangeRequest.status',
          requestedVanId: '$vanChangeRequest.requestedVanId',
          requestedVanName: '$vanChangeRequest.requestedVanName',
          vanChangeRouteSelectedAt: '$vanChangeRequest.routeSelectedAt',

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

        /* ======================================================
         * 1. FIND ACTIVE WORK SESSION
         * ====================================================== */
        const workSession = await this.findOne(
          {
            userId: ctx?.userId,
            status: WorkSessionStatus.ACTIVE,
          },
          { sort: { createdAt: -1 } },
        );

        if (!workSession) {
          throw new NotFoundException(WORK_SESSION.NOT_FOUND);
        }

        const { workSessionId } = workSession;
        const vanId: any = workSession?.vanId;

        /* ======================================================
         * 2. COMPLETE WORK SESSION
         * ====================================================== */
        workSession.dayEndTime = new Date();
        const dayEndLocation = this.normalizeLocation(payload.dayEndLocation);
        workSession.dayEndLocation = dayEndLocation;
        workSession.status = WorkSessionStatus.COMPLETED;

        await workSession.save({ session });

        /* ======================================================
         * 3. COMPLETE ACTIVITY + ROUTE
         * ====================================================== */
        await this.activityService.updateMany(
          { workSessionId, status: ActivityStatus.ACTIVE },
          { endTime: new Date(), status: ActivityStatus.COMPLETED },
          { session },
        );

        await this.routeSessionService.updateMany(
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

        let unloadRequest;

        if (summary && products.length) {
          /* ======================================================
           * 5. CHECK EXISTING STOCK COUNT
           * ====================================================== */
          const existing = await this.stockCountService.findOne(
            {
              $or: [{ workSessionId }, { vanId, date: today }],
            },
            {
              session,
              // Unique indexes still include soft-deleted records. Excluding
              // them here causes the subsequent insert to fail with E11000.
              includeDeleted: true,
            },
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
            const productsById = new Map<string, any>();
            for (const product of products) {
              const productId = String(product?.productId ?? '');
              if (!productId) continue;

              const current = productsById.get(productId);
              if (!current) {
                productsById.set(productId, { ...product });
                continue;
              }

              current.closingQty =
                (current.closingQty || 0) + (product.closingQty || 0);
              current.closingCases =
                (current.closingCases || 0) + (product.closingCases || 0);
              current.closingPieces =
                (current.closingPieces || 0) + (product.closingPieces || 0);
              current.closingValue =
                (current.closingValue || 0) + (product.closingValue || 0);
            }

            const items = Array.from(productsById.values()).map((p) => {
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

            await this.stockCountItemService.bulkCreate(items, { session });
          }
        }

        const carryForward = payload?.carryForwardStock === true;
        console.log('Carry Forward Stock:', carryForward);

        if (!carryForward) {
          unloadRequest = await this.stockUnloadRequestService.createFromDayEnd(
            {
              workSessionId,
              vanId,
              employeeId: ctx?.userId!,
              warehouseId: payload?.warehouseId,
              totalQuantity: summary?.closing?.qty || 0,
              totalCases: summary?.closing?.cases || 0,
              totalPieces: summary?.closing?.pieces || 0,
              totalValue: summary?.closing?.value || 0,
              items: products.map((product: any) => ({
                productId: String(product?.productId || ''),
                productName: product?.productName,
                quantity: product?.closingQty || 0,
                cases: product?.closingCases || 0,
                pieces: product?.closingPieces || 0,
                value: product?.closingValue || 0,
                unitQtyInCase: product?.unitQtyInCase || 0,
              })),
            },
            session,
          );
        }

        /* ======================================================
         * RESPONSE
         * ====================================================== */
        return {
          statusCode: HttpStatus.OK,
          message: WORK_SESSION.UPDATED,
          data: {
            workSession,
            unloadRequest: unloadRequest
              ? {
                  unloadRequestId: unloadRequest.unloadRequestId,
                  status: unloadRequest.status,
                }
              : undefined,
          },
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
          $expr: {
            $and: [
              {
                $gte: [
                  {
                    $convert: {
                      input: '$dayStartTime',
                      to: 'date',
                      onError: '$createdAt',
                      onNull: '$createdAt',
                    },
                  },
                  todayStart,
                ],
              },
              {
                $lte: [
                  {
                    $convert: {
                      input: '$dayStartTime',
                      to: 'date',
                      onError: '$createdAt',
                      onNull: '$createdAt',
                    },
                  },
                  todayEnd,
                ],
              },
            ],
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

      /* ===== 5. GET ALL LOGGED-IN USER ACTIVITIES FOR TODAY ===== */
      {
        $lookup: {
          from: 'activities',
          let: { userId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', '$$userId'] },
                    {
                      $gte: [
                        {
                          $convert: {
                            input: '$startTime',
                            to: 'date',
                            onError: '$createdAt',
                            onNull: '$createdAt',
                          },
                        },
                        todayStart,
                      ],
                    },
                    {
                      $lte: [
                        {
                          $convert: {
                            input: '$startTime',
                            to: 'date',
                            onError: '$createdAt',
                            onNull: '$createdAt',
                          },
                        },
                        todayEnd,
                      ],
                    },
                  ],
                },
              },
            },
            { $sort: { startTime: -1, createdAt: -1 } },
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
      {
        $lookup: {
          from: 'route_master',
          localField: 'selectedRoute.routeId',
          foreignField: 'routeId',
          as: 'selectedRouteMaster',
        },
      },
      {
        $unwind: {
          path: '$selectedRouteMaster',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          selectedRoute: {
            $cond: [
              { $ifNull: ['$selectedRoute', false] },
              {
                $mergeObjects: [
                  { $ifNull: ['$selectedRouteMaster', {}] },
                  '$selectedRoute',
                ],
              },
              null,
            ],
          },
        },
      },

      /* ===== 8. LATEST VAN CHANGE REQUEST ===== */
      {
        $lookup: {
          from: 'van_change_requests',
          let: { wsId: '$workSessionId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$workSessionId', '$$wsId'] },
                isDeleted: { $ne: true },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'vanChangeRequest',
        },
      },
      {
        $unwind: {
          path: '$vanChangeRequest',
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ===== 9. FINAL RESPONSE ===== */
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
          vanChangeRequestId: '$vanChangeRequest.vanChangeRequestId',
          vanChangeStatus: '$vanChangeRequest.status',
          requestedVanId: '$vanChangeRequest.requestedVanId',
          requestedVanName: '$vanChangeRequest.requestedVanName',
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);

    const doc = result?.[0];

    if (doc) {
      const vanChangeApproved = doc.vanChangeStatus === 'APPROVED';
      const routeUsesApprovedVan =
        Boolean(doc.selectedRoute) &&
        String(doc.selectedRoute?.vanId || '') ===
          String(doc.requestedVanId || '');
      const routeSelectionHandled =
        Boolean(doc.vanChangeRouteSelectedAt) || routeUsesApprovedVan;

      doc.vanChangeActionTaken = vanChangeApproved
        ? routeSelectionHandled
        : false;
      doc.vanChangeRequiresAction = vanChangeApproved && !routeSelectionHandled;
    }

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

    // A leave can be marked after a work session was created. Include it in
    // day status as well, otherwise the app assumes the user is available and
    // shows Quick Actions again.
    const leave = await this.leaveService.findOne({
      userId: ctx?.userId,
      createdAt: {
        $gte: todayStart,
        $lte: todayEnd,
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: WORK_SESSION.FETCHED,
      data: leave ? { ...doc, type: 'LEAVE', leave } : doc,
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

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      const collection = error?.message?.match(/collection: ([^ ]+)/)?.[1];
      const index = error?.message?.match(/index: ([^ ]+)/)?.[1];
      const key = error?.keyValue ? JSON.stringify(error.keyValue) : undefined;
      const source = [collection, index].filter(Boolean).join(' / ');

      throw new ConflictException(
        `Duplicate record${source ? ` in ${source}` : ''}${key ? `: ${key}` : ''}`,
      );
    }
    throw error;
  }
}
