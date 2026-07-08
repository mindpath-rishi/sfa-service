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
  Activity,
  ActivitySchema,
} from 'src/core/database/mongo/schema/activity.schema';

import { ACTIVITY } from './activity.constants';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';
import { RequestContextStore } from 'src/core/context/request-context';
import { ActivityStatus } from 'src/shared/enums/activity.enums';
import { ClientSession } from 'mongoose';
import { RouteSessionService } from '../route-session/route-session.service';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';
import { CreateRouteSessionDto } from '../route-session/dto/create-route-session.dto';
import { VanInventoryService } from '../van-inventory/van-inventory.service';
import { VanDailyStockStatus } from 'src/shared/enums/van-daily-stock.enums';
import { VanDailyStockService } from '../van-daily-stock/van-daily-stock.service';
import { VanErpClosingService } from '../van-erp-closing/van-erp-closing.service';
import { VanInventoryStatus } from 'src/shared/enums/van-inventory.enums';

@Injectable()
export class ActivityService extends MongoRepository<Activity> {
  constructor(
    mongo: MongoService,
    private readonly routeSessionService: RouteSessionService,
    private readonly inventoryService: VanInventoryService,
    private readonly vanDailyStockService: VanDailyStockService,
    private readonly vanErpClosingService: VanErpClosingService,
  ) {
    super(mongo.getModel(Activity.name, ActivitySchema));
  }

  async create(
    payload: CreateActivityDto & { vanId: string },
    options?: { session?: ClientSession },
  ) {
    return this.withTransaction(async (session) => {
      const ctx = RequestContextStore.getStore();

      const now = new Date();

      const newActivityPayload: Partial<Activity> = {
        userId: ctx?.userId,
        userName: ctx?.name,
        vanId: payload.vanId || ctx?.vanId,
        vanName: (payload as any).vanName || ctx?.vanName,
        name: payload.name,
        description: payload.description || '',
        startTime: now,
        startLocation: payload.startLocation,
        workSessionId: payload.workSessionId,
        status: ActivityStatus.ACTIVE,
      };

      /* ======================================================
       * COMPLETE OLD ACTIVE ACTIVITIES
       * ====================================================== */
      await this.updateMany(
        {
          workSessionId: payload.workSessionId,
          status: ActivityStatus.ACTIVE,
        },
        {
          $set: {
            status: ActivityStatus.COMPLETED,
            endTime: now,
          },
        },
        { session },
      );

      /* ======================================================
       * COMPLETE OLD ACTIVE ROUTE SESSIONS
       * ====================================================== */
      try {
        await this.routeSessionService.updateMany(
          {
            workSessionId: payload.workSessionId,
            status: RouteSessionStatus.ACTIVE,
          },
          {
            $set: {
              status: RouteSessionStatus.COMPLETED,
              endTime: now,
            },
          },
          { session },
        );
      } catch (error) {
        // Do not block activity creation if route session completion fails
      }

      /* ======================================================
       * CREATE / ACTIVATE ROUTE SESSION
       * ====================================================== */
      if (payload.routeId) {
        const existingRouteSession = await this.routeSessionService.findOne(
          {
            workSessionId: payload.workSessionId,
            routeId: payload.routeId,
          },
          {
            session,
            includeDeleted: true,
          },
        );

        if (existingRouteSession) {
          await this.routeSessionService.updateOne(
            {
              workSessionId: payload.workSessionId,
              routeId: payload.routeId,
            },
            {
              $set: {
                status: RouteSessionStatus.ACTIVE,
                endTime: null,
                isDeleted: false,

                routeName:
                  payload.routeName || existingRouteSession.routeName || '',

                totalShops:
                  payload.totalShops || existingRouteSession.totalShops || 0,

                customerCategoryId:
                  payload.customerCategoryId ||
                  existingRouteSession.customerCategoryId,
              },
            },
            {
              session,
              includeDeleted: true,
            },
          );
        } else {
          const newRouteSession: CreateRouteSessionDto = {
            workSessionId: payload.workSessionId,
            routeId: payload.routeId,
            totalShops: payload.totalShops || 0,
            routeName: payload.routeName || '',
            customerCategoryId: payload.customerCategoryId,
          };

          await this.routeSessionService.create(newRouteSession, { session });
        }

        /* ======================================================
         * CREATE VAN DAILY STOCK ONLY ONCE PER WORK SESSION
         * ====================================================== */
        const vanId: any = payload.vanId || ctx?.vanId;

        try {
          const existingDailyStock = await this.vanDailyStockService.findOne(
            {
              workSessionId: payload.workSessionId,
            },
            {
              session,
            },
          );

          if (!existingDailyStock) {
            const erpClosing =
              await this.vanErpClosingService.getLatestOpeningStock(vanId);

            const response = erpClosing.length
              ? null
              : await this.inventoryService.findByVanId(vanId, {
                  page: 1,
                  limit: 10000,
                });

            const inventories = erpClosing.length
              ? erpClosing.map((item: any) => ({
                  ...item,
                  quantity:
                    Number(item.closingCases || 0) *
                    Number(item.unitQtyInCase || 1),
                }))
              : response?.data?.products?.filter(
                  (item: any) => Number(item.quantity || 0) > 0,
                ) || [];

            /* ======================================================
             * IF ERP CLOSING EXISTS, RESET VAN INVENTORY FROM ERP
             * ====================================================== */
            if (erpClosing.length) {
              await this.inventoryService.updateMany(
                {
                  vanId,
                },
                {
                  $set: {
                    quantity: 0,
                    reservedQuantity: 0,
                  },
                },
                {
                  session,
                },
              );

              await this.inventoryService.bulkUpdate(
                inventories.map((item: any) => ({
                  filter: {
                    vanId,
                    productId: item.productId,
                  },
                  update: {
                    $set: {
                      quantity: item.quantity,
                      reservedQuantity: 0,
                      status: VanInventoryStatus.ACTIVE,
                      isDeleted: false,
                    },
                    $setOnInsert: {
                      inventoryId: IdGenerator.generate('VAN_', 8),
                      vanId,
                      productId: item.productId,
                    },
                  },
                })),
                {
                  session,
                  upsert: true,
                  includeDeleted: true,
                },
              );
            }

            /* ======================================================
             * CREATE VAN DAILY STOCK SNAPSHOT
             * ====================================================== */
            if (inventories.length) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);

              const dailyStocks = inventories.map((inv: any) => ({
                vanDailyStockId: IdGenerator.generate('VDS', 8),

                date: today,
                vanId,
                employeeId: ctx?.userId,

                productId: inv.productId,
                unitQtyInCase: inv.unitQtyInCase || 1,

                openingQty: inv.quantity || 0,
                inQty: 0,
                outQty: 0,
                adjustmentQty: 0,
                closingQty: inv.quantity || 0,

                pieceNetWeight: inv.pieceNetWeight,
                piecePrice: inv.piecePrice,

                workSessionId: payload.workSessionId,
                status: VanDailyStockStatus.DRAFT,
              }));

              await this.vanDailyStockService.bulkUpdate(
                dailyStocks.map((stock) => ({
                  filter: {
                    date: stock.date,
                    vanId: stock.vanId,
                    productId: stock.productId,
                    workSessionId: stock.workSessionId,
                  },
                  update: {
                    $setOnInsert: stock,
                  },
                })),
                {
                  session,
                  upsert: true,
                },
              );
            }
          }
        } catch (error) {
          console.error('Van daily stock error:', error);
          throw error;
        }
      }

      /* ======================================================
       * CREATE NEW ACTIVITY
       * ====================================================== */
      const doc = await this.save(
        {
          activityId: IdGenerator.generate('ACTI', 8),
          ...newActivityPayload,
        },
        {
          session,
        },
      );

      return doc;
    }, options?.session);
  }

  async findAll(query: ActivityQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Activity> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ activityId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ACTIVITY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByActivityId(activityId: string) {
    const doc = await this.findOne({ activityId }, { lean: true });

    if (!doc) throw new NotFoundException(ACTIVITY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: ACTIVITY.FETCHED,
      data: doc,
    };
  }

  async update(activityId: string, dto: UpdateActivityDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne({ activityId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(ACTIVITY.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ACTIVITY.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(activityId: string) {
    const existing = await this.findOne({ activityId });

    if (!existing) throw new NotFoundException(ACTIVITY.NOT_FOUND);

    await this.softDelete({ activityId });

    return {
      statusCode: HttpStatus.OK,
      message: ACTIVITY.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(ACTIVITY.DUPLICATE);
    }
    throw error;
  }
}
