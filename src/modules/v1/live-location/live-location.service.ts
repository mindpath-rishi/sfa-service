import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import {
  LiveLocation,
  LiveLocationSchema,
} from 'src/core/database/mongo/schema/live-location.schema';
import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';
import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { CreateLiveLocationDto } from './dto/create-live-location.dto';
import { LiveLocationQueryDto } from './dto/live-location-query.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';
import { TrackLiveLocationDto } from './dto/track-live-location.dto';
import { LIVE_LOCATION } from './live-location.constants';

@Injectable()
export class LiveLocationService extends MongoRepository<LiveLocation> {
  private readonly workSessionModel: Model<WorkSession>;

  constructor(mongo: MongoService) {
    super(mongo.getModel(LiveLocation.name, LiveLocationSchema));
    this.workSessionModel = mongo.getModel(WorkSession.name, WorkSessionSchema);
  }

  async track(payload: TrackLiveLocationDto) {
    const latitude = Number(payload.location?.latitude);
    const longitude = Number(payload.location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Location is required');
    }

    const userId = RequestContextStore.getStore()?.userId;
    const workSession = await this.workSessionModel
      .findOne({
        userId,
        status: WorkSessionStatus.ACTIVE,
        isDeleted: false,
        ...(payload.workSessionId
          ? { workSessionId: payload.workSessionId }
          : {}),
      })
      .lean();
    if (!workSession) throw new NotFoundException('Work session not found');

    const point = await this.createTrackedLocation({
      userId: workSession.userId,
      workSessionId: workSession.workSessionId,
      vanId: workSession.vanId,
      source: payload.source || 'BACKGROUND',
      latitude,
      longitude,
      accuracy: payload.location?.accuracy ?? undefined,
      altitude: payload.location?.altitude ?? undefined,
      speed: payload.location?.speed ?? undefined,
      heading: payload.location?.heading ?? undefined,
      capturedAt: payload.location?.capturedAt,
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: LIVE_LOCATION.CREATED,
      data: {
        locationId: point.locationId,
        workSessionId: point.workSessionId,
      },
    };
  }

  async create(payload: CreateLiveLocationDto) {
    const doc = await this.createTrackedLocation(payload);
    return {
      statusCode: HttpStatus.CREATED,
      message: LIVE_LOCATION.CREATED,
      data: doc,
    };
  }

  async createTrackedLocation(
    payload: Omit<CreateLiveLocationDto, 'capturedAt'> & {
      capturedAt?: string | Date;
    },
  ) {
    return this.save({
      locationId: IdGenerator.generate('LOC', 10),
      ...payload,
      capturedAt: payload.capturedAt
        ? new Date(payload.capturedAt)
        : new Date(),
    });
  }

  async findAll(query: LiveLocationQueryDto) {
    const {
      userId,
      workSessionId,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;
    const filter: FilterQuery<LiveLocation> = {};
    if (userId) filter.userId = userId;
    if (workSessionId) filter.workSessionId = workSessionId;
    if (startDate || endDate) {
      filter.capturedAt = {
        ...(startDate ? { $gte: new Date(startDate) } : {}),
        ...(endDate ? { $lte: new Date(endDate) } : {}),
      };
    }
    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { capturedAt: -1 },
      lean: true,
    });
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByLocationId(locationId: string) {
    const doc = await this.findOne({ locationId }, { lean: true });
    if (!doc) throw new NotFoundException(LIVE_LOCATION.NOT_FOUND);
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.FETCHED,
      data: doc,
    };
  }

  async updateLocation(locationId: string, payload: UpdateLiveLocationDto) {
    const doc = await this.updateOne({ locationId }, payload, { new: true });
    if (!doc) throw new NotFoundException(LIVE_LOCATION.NOT_FOUND);
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.UPDATED,
      data: doc,
    };
  }

  async deleteLocation(locationId: string) {
    const doc = await this.findOne({ locationId });
    if (!doc) throw new NotFoundException(LIVE_LOCATION.NOT_FOUND);
    await this.softDelete({ locationId });
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.DELETED,
      data: doc,
    };
  }

  async findForSessions(
    workSessionIds: string[],
    startDate: Date,
    endDate: Date,
  ) {
    if (!workSessionIds.length) return [];
    return this.model
      .find({
        workSessionId: { $in: workSessionIds },
        capturedAt: { $gte: startDate, $lte: endDate },
        isDeleted: { $ne: true },
      } as any)
      .sort({ capturedAt: 1 })
      .lean();
  }

  async findLatestForSession(workSessionId?: string) {
    if (!workSessionId) return null;
    return this.model
      .findOne({ workSessionId, isDeleted: { $ne: true } } as any)
      .sort({ capturedAt: -1 })
      .lean();
  }
}
