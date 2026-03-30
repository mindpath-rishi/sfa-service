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

@Injectable()
export class ActivityService extends MongoRepository<Activity> {
  constructor(
    mongo: MongoService,
    private readonly routeSessionService: RouteSessionService,
  ) {
    super(mongo.getModel(Activity.name, ActivitySchema));
  }

  async create(
    payload: CreateActivityDto,
    options?: { session?: ClientSession },
  ) {
    return this.withTransaction(async (session) => {
      const ctx = RequestContextStore.getStore();

      const newActivityPayload: Partial<Activity> = {
        userId: ctx?.userId,
        userName: ctx?.name,
        vanId: ctx?.vanId,
        vanName: ctx?.vanName,
        name: payload.name,
        description: payload.description || '',
        startTime: new Date(),
        workSessionId: payload.workSessionId,

      };

      await this.updateMany(
        {
          workSessionId: payload.workSessionId,
          status: ActivityStatus.ACTIVE,
        },
        { status: ActivityStatus.COMPLETED, endTime: new Date() },
        { session },
      );

      try {
        await this.routeSessionService.markCompleted(
          payload.workSessionId,
          {
            status: RouteSessionStatus.COMPLETED,
            endTime: new Date(),
          },
          session,
        );
      } catch (error) {}

      if (payload.routeId) {
        const newRouteSession: CreateRouteSessionDto = {
          workSessionId: payload.workSessionId,
          routeId: payload.routeId,
          totalShops: payload.totalShops || 0,
          routeName: payload.routeName || '',
        };

        await this.routeSessionService.create(newRouteSession, { session });
      }

      const doc = await this.save(
        {
          activityId: IdGenerator.generate('ACTI', 8),
          ...newActivityPayload,
        },
        { session },
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
