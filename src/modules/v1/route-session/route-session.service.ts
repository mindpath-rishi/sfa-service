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
    const doc = await this.findOne({ routeSessionId }, { lean: true });

    if (!doc) throw new NotFoundException(ROUTE_SESSION.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_SESSION.FETCHED,
      data: doc,
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
        const doc = await this.updateOne({ workSessionId, status: RouteSessionStatus.ACTIVE }, dto, {
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

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(ROUTE_SESSION.DUPLICATE);
    }
    throw error;
  }
}
