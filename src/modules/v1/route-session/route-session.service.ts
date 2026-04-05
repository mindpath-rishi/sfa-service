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
  RouteSession,
  RouteSessionSchema,
} from 'src/core/database/mongo/schema/route-session.schema';

import { ROUTE_SESSION } from './route-session.constants';
import { CreateRouteSessionDto } from './dto/create-route-session.dto';
import { UpdateRouteSessionDto } from './dto/update-route-session.dto';
import { RouteSessionQueryDto } from './dto/route-session-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { RequestContextStore } from 'src/core/context/request-context';
import { ClientSession } from 'mongoose';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';

@Injectable()
export class RouteSessionService extends MongoRepository<RouteSession> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(RouteSession.name, RouteSessionSchema));
  }

  async create(
    payload: CreateRouteSessionDto,
    options?: { session?: ClientSession },
  ) {
    try {
      return await this.withTransaction(async (session) => {
        const ctx = RequestContextStore.getStore();

        /* ======================================================
         * FILTER (FIXED)
         * ====================================================== */

        const filter: FilterQuery<RouteSession> = {
          userId: ctx?.userId,
          vanId: ctx?.vanId,
          status: RouteSessionStatus.ACTIVE,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        /* ======================================================
         * DUPLICATE CHECK
         * ====================================================== */

        if (existing && !existing.isDeleted) {
          throw new ConflictException(ROUTE_SESSION.DUPLICATE);
        }

        /* ======================================================
         * RESTORE SOFT DELETED
         * ====================================================== */

        // if (existing?.isDeleted) {
        //   await this.updateById(
        //     existing._id.toString(),
        //     {
        //       ...payload,
        //       userId: ctx?.userId,
        //       userName: ctx?.name,
        //       vanId: ctx?.vanId,
        //       vanName: ctx?.vanName,
        //       status: 'ACTIVE',
        //       isDeleted: false,
        //       startTime: new Date(),
        //     },
        //     { session },
        //   );

        //   return {
        //     statusCode: HttpStatus.OK,
        //     message: ROUTE_SESSION.CREATED,
        //     data: { routeSessionId: existing.routeSessionId },
        //   };
        // }

        /* ======================================================
         * CREATE NEW
         * ====================================================== */

        const doc = await this.save(
          {
            routeSessionId: IdGenerator.generate('ROUT', 8),
            userId: ctx?.userId,
            userName: ctx?.name,
            vanId: ctx?.vanId,
            vanName: ctx?.vanName,
            startTime: new Date(),
            remainingShops: payload.totalShops,
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: ROUTE_SESSION.CREATED,
          data: doc,
        };
      }, options?.session);
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: RouteSessionQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<RouteSession> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ routeSessionId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_SESSION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByRouteSessionId(routeSessionId: string) {
    const data = await this.model.aggregate([
      // 1️⃣ Match route session
      {
        $match: { routeSessionId },
      },

      // 2️⃣ Get Route
      {
        $lookup: {
          from: 'route_master',
          localField: 'routeId',
          foreignField: 'routeId',
          as: 'route',
        },
      },
      { $unwind: '$route' },

      // 3️⃣ Get Route-Customer Mapping
      {
        $lookup: {
          from: 'route_customer_mappings',
          localField: 'routeId',
          foreignField: 'routeId',
          as: 'mappings',
        },
      },

      // 4️⃣ Get Shop Visits (NEW 🔥)
      {
        $lookup: {
          from: 'shop_visits',
          let: { routeSessionId: '$routeSessionId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$routeSessionId', '$$routeSessionId'],
                },
              },
            },
          ],
          as: 'visits',
        },
      },

      // 5️⃣ Get Customers
      {
        $lookup: {
          from: 'customer_master',
          localField: 'mappings.customerId',
          foreignField: 'customerId',
          as: 'customers',
        },
      },

      // 6️⃣ Merge sequence + visit info
      {
        $addFields: {
          customers: {
            $map: {
              input: '$customers',
              as: 'cust',
              in: {
                $let: {
                  vars: {
                    mapping: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$mappings',
                            as: 'm',
                            cond: {
                              $eq: ['$$m.customerId', '$$cust.customerId'],
                            },
                          },
                        },
                        0,
                      ],
                    },
                    visit: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$visits',
                            as: 'v',
                            cond: {
                              $eq: ['$$v.customerId', '$$cust.customerId'],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    $mergeObjects: [
                      '$$cust',
                      {
                        sequence: '$$mapping.sequence',
                        isVisited: {
                          $cond: [{ $ifNull: ['$$visit', false] }, true, false],
                        },
                        visitStatus: '$$visit.status',
                        visitedAt: '$$visit.visitedAt',
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },

      // 7️⃣ Sort customers by sequence
      {
        $addFields: {
          customers: {
            $sortArray: {
              input: '$customers',
              sortBy: { sequence: 1 },
            },
          },
        },
      },

      // 8️⃣ Optional cleanup (remove heavy arrays)
      {
        $project: {
          mappings: 0,
          visits: 0,
        },
      },
    ]);

    if (!data.length) {
      throw new NotFoundException(ROUTE_SESSION.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_SESSION.FETCHED,
      data: data[0],
    };
  }

  async update(
    routeSessionId: string,
    dto: UpdateRouteSessionDto,
    session?: ClientSession,
  ) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ routeSessionId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(ROUTE_SESSION.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ROUTE_SESSION.UPDATED,
          data: doc,
        };
      }, session);
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(routeSessionId: string) {
    const existing = await this.findOne({ routeSessionId });

    if (!existing) throw new NotFoundException(ROUTE_SESSION.NOT_FOUND);

    await this.softDelete({ routeSessionId });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_SESSION.DELETED,
      data: existing,
    };
  }

  async markCompleted(
    workSessionId: string,
    dto: UpdateRouteSessionDto,
    session?: ClientSession,
  ) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne(
          { workSessionId, status: RouteSessionStatus.ACTIVE },
          dto,
          {
            session,
            new: true,
          },
        );

        if (!doc) throw new NotFoundException(ROUTE_SESSION.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ROUTE_SESSION.UPDATED,
          data: doc,
        };
      }, session);
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(ROUTE_SESSION.DUPLICATE);
    }
    throw error;
  }
}
