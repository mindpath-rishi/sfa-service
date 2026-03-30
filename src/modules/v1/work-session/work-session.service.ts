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

@Injectable()
export class WorkSessionService extends MongoRepository<WorkSession> {
  constructor(
    mongo: MongoService,
    private readonly activityService: ActivityService,
    private readonly routeSessionService: RouteSessionService,
  ) {
    super(mongo.getModel(WorkSession.name, WorkSessionSchema));
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

        const newWork: Partial<WorkSession> = {
          userId: ctx?.userId,
          userName: ctx?.name,
          vanId: ctx?.vanId,
          vanName: ctx?.vanName,
          dayStartTime: new Date(),
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

        const activityPayload: CreateActivityDto = {
          name: payload.activityName || 'Work Session',
          description: '',
          workSessionId: workSessionDoc.workSessionId,
          routeId: payload.routeId,
          totalShops: payload.totalShops,
          routeName: payload.routeName,
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

  async getTodayActiveWorkSession() {
    const ctx = RequestContextStore.getStore();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const pipeline: any[] = [
      {
        $match: {
          userId: ctx?.userId,
          status: WorkSessionStatus.ACTIVE,
          createdAt: {
            $gte: todayStart,
            $lte: todayEnd,
          },
        },
      },

      /**
       * ✅ Get ALL activities
       */
      {
        $lookup: {
          from: 'activities',
          let: { wsId: '$workSessionId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$workSessionId', '$$wsId'],
                },
              },
            },
            {
              $sort: { createdAt: -1 },
            },
          ],
          as: 'activities',
        },
      },

      /**
       * ✅ Selected route
       */
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

      /**
       * ✅ Extract ACTIVE activity object
       */
      {
        $addFields: {
          activeActivity: {
            $ifNull: [
              {
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
              {},
            ],
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
          activeActivity: 1,
          activities: 1,
          selectedRoute: 1,
        },
      },

      { $sort: { createdAt: -1 } },
      { $limit: 1 },
    ];

    const result = await this.model.aggregate(pipeline);
    const doc = result?.[0];

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

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(WORK_SESSION.DUPLICATE);
    }
    throw error;
  }
}
