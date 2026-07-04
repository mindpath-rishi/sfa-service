import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
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

const DATABASE_SAMPLE_DISTANCE_METERS = 5;

export type LiveLocationUpdate = {
  workSessionId: string;
  employeeId: string;
  vanId?: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    speed: number | null;
    heading: number | null;
    capturedAt: Date;
    source: string;
  };
};

@Injectable()
export class LiveLocationService extends MongoRepository<LiveLocation> {
  private readonly workSessionModel: Model<WorkSession>;
  private readonly lastPersistedLocation = new Map<
    string,
    { latitude: number; longitude: number }
  >();
  private readonly persistenceInFlight = new Map<string, Promise<boolean>>();

  constructor(mongo: MongoService) {
    super(mongo.getModel(LiveLocation.name, LiveLocationSchema));
    this.workSessionModel = mongo.getModel(WorkSession.name, WorkSessionSchema);
  }

  /** Build the real-time socket payload without waiting for MongoDB. */
  createRealtimeUpdate(
    payload: TrackLiveLocationDto,
    authenticatedUserId: string,
    authenticatedVanId?: string,
  ): LiveLocationUpdate {
    const latitude = Number(payload.location?.latitude);
    const longitude = Number(payload.location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new BadRequestException('Location is required');
    }
    if (!payload.workSessionId) {
      throw new BadRequestException('workSessionId is required');
    }

    const capturedAt = payload.location?.capturedAt
      ? new Date(payload.location.capturedAt)
      : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException('capturedAt must be a valid date');
    }

    return {
      workSessionId: payload.workSessionId,
      employeeId: authenticatedUserId,
      vanId: authenticatedVanId,
      location: {
        latitude,
        longitude,
        accuracy: payload.location?.accuracy ?? null,
        altitude: payload.location?.altitude ?? null,
        speed: payload.location?.speed ?? null,
        heading: payload.location?.heading ?? null,
        capturedAt,
        source: payload.source || 'BACKGROUND',
      },
    };
  }

  /** Persist the first point, then points at least five metres apart. */
  persistByDistance(update: LiveLocationUpdate): Promise<boolean> {
    const key = `${update.workSessionId}:${update.vanId || ''}`;
    const previous = this.lastPersistedLocation.get(key);
    if (
      previous &&
      this.distanceInMeters(previous, update.location) <
        DATABASE_SAMPLE_DISTANCE_METERS
    ) {
      return Promise.resolve(false);
    }
    const existing = this.persistenceInFlight.get(key);
    if (existing) return existing;

    this.lastPersistedLocation.set(key, {
      latitude: update.location.latitude,
      longitude: update.location.longitude,
    });
    const operation = this.persistUpdate(update)
      .then(() => true)
      .catch((error) => {
        if (previous) this.lastPersistedLocation.set(key, previous);
        else this.lastPersistedLocation.delete(key);
        throw error;
      })
      .finally(() => this.persistenceInFlight.delete(key));
    this.persistenceInFlight.set(key, operation);
    return operation;
  }

  private async persistUpdate(update: LiveLocationUpdate) {
    const workSession = await this.workSessionModel
      .findOne({
        workSessionId: update.workSessionId,
        userId: update.employeeId,
        status: WorkSessionStatus.ACTIVE,
        isDeleted: false,
      })
      .lean();
    if (!workSession) throw new NotFoundException('Work session not found');
    if (!workSession.vanId)
      throw new BadRequestException('Work session has no van');

    const date = this.utcStartOfDay(update.location.capturedAt);
    const point = {
      source: update.location.source,
      latitude: update.location.latitude,
      longitude: update.location.longitude,
      accuracy: update.location.accuracy ?? undefined,
      altitude: update.location.altitude ?? undefined,
      speed: update.location.speed ?? undefined,
      heading: update.location.heading ?? undefined,
      capturedAt: update.location.capturedAt,
    };

    await this.model.updateOne(
      {
        workSessionId: workSession.workSessionId,
        vanId: workSession.vanId,
        date,
      } as any,
      {
        $setOnInsert: {
          locationId: IdGenerator.generate('LOC', 10),
          userId: workSession.userId,
          workSessionId: workSession.workSessionId,
          vanId: workSession.vanId,
          date,
        },
        $push: { locations: point },
      },
      { upsert: true },
    );
  }

  async track(payload: TrackLiveLocationDto, authenticatedUserId?: string) {
    const userId =
      authenticatedUserId || RequestContextStore.getStore()?.userId;
    if (!userId)
      throw new BadRequestException('Authenticated user is required');
    const locations = payload.locations?.length
      ? payload.locations
      : payload.location
        ? [payload.location]
        : [];
    if (!locations.length)
      throw new BadRequestException('Location is required');

    const updates: LiveLocationUpdate[] = [];
    let persistedCount = 0;
    // Keep batch persistence sequential. Concurrent points for the same work
    // session intentionally share an in-flight guard and would otherwise be
    // collapsed into the first write.
    for (const location of locations) {
      const update = this.createRealtimeUpdate(
        { ...payload, locations: undefined, location },
        userId,
        RequestContextStore.getStore()?.vanId,
      );
      updates.push(update);
      if (await this.persistByDistance(update)) persistedCount += 1;
    }

    return {
      statusCode: HttpStatus.OK,
      message: persistedCount ? LIVE_LOCATION.CREATED : 'Location received',
      data: payload.locations
        ? { received: updates.length, persisted: persistedCount }
        : updates[0],
    };
  }

  async create(payload: CreateLiveLocationDto) {
    const update: LiveLocationUpdate = {
      workSessionId: payload.workSessionId,
      employeeId: payload.userId,
      vanId: payload.vanId,
      location: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: payload.accuracy ?? null,
        altitude: payload.altitude ?? null,
        speed: payload.speed ?? null,
        heading: payload.heading ?? null,
        capturedAt: payload.capturedAt
          ? new Date(payload.capturedAt)
          : new Date(),
        source: payload.source || 'BACKGROUND',
      },
    };
    await this.persistUpdate(update);
    return {
      statusCode: HttpStatus.CREATED,
      message: LIVE_LOCATION.CREATED,
      data: update,
    };
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
    const match: Record<string, unknown> = {};
    if (userId) match.userId = userId;
    if (workSessionId) match.workSessionId = workSessionId;
    if (startDate || endDate) {
      match['locations.capturedAt'] = {
        ...(startDate ? { $gte: new Date(startDate) } : {}),
        ...(endDate ? { $lte: new Date(endDate) } : {}),
      };
    }
    const [result] = await this.model.aggregate([
      { $match: match },
      { $unwind: '$locations' },
      ...(startDate || endDate
        ? [
            {
              $match: { 'locations.capturedAt': match['locations.capturedAt'] },
            },
          ]
        : []),
      { $sort: { 'locations.capturedAt': -1 } },
      {
        $facet: {
          items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: 'count' }],
        },
      },
    ]);
    const total = result?.total?.[0]?.count || 0;
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.FETCHED,
      data: (result?.items || []).map((item: any) => this.flattenPoint(item)),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByLocationId(locationId: string) {
    const doc = await this.model.findOne({ locationId }).lean();
    if (!doc) throw new NotFoundException(LIVE_LOCATION.NOT_FOUND);
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.FETCHED,
      data: doc,
    };
  }

  async updateLocation(locationId: string, payload: UpdateLiveLocationDto) {
    const doc = await this.model.findOneAndUpdate(
      { locationId },
      { $set: payload },
      { new: true },
    );
    if (!doc) throw new NotFoundException(LIVE_LOCATION.NOT_FOUND);
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.UPDATED,
      data: doc,
    };
  }

  async deleteLocation(locationId: string) {
    const doc = await this.model.findOneAndDelete({ locationId });
    if (!doc) throw new NotFoundException(LIVE_LOCATION.NOT_FOUND);
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
    const docs = await this.model.aggregate([
      { $match: { workSessionId: { $in: workSessionIds } } },
      { $unwind: '$locations' },
      {
        $match: { 'locations.capturedAt': { $gte: startDate, $lte: endDate } },
      },
      { $sort: { 'locations.capturedAt': 1 } },
    ]);
    return docs.map((doc: any) => this.flattenPoint(doc));
  }

  async findLatestForSession(workSessionId?: string) {
    if (!workSessionId) return null;
    const [latest] = await this.model.aggregate([
      { $match: { workSessionId } },
      { $unwind: '$locations' },
      { $sort: { 'locations.capturedAt': -1 } },
      { $limit: 1 },
    ]);
    return latest ? this.flattenPoint(latest) : null;
  }

  private flattenPoint(doc: any) {
    return {
      locationId: doc.locationId,
      userId: doc.userId,
      workSessionId: doc.workSessionId,
      vanId: doc.vanId,
      date: doc.date,
      ...doc.locations,
    };
  }

  private utcStartOfDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private distanceInMeters(
    from: { latitude: number; longitude: number },
    to: { latitude: number; longitude: number },
  ) {
    const earthRadius = 6_371_000;
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(to.latitude - from.latitude);
    const longitudeDelta = radians(to.longitude - from.longitude);
    const fromLatitude = radians(from.latitude);
    const toLatitude = radians(to.latitude);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(fromLatitude) *
        Math.cos(toLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return (
      earthRadius *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
  }
}
