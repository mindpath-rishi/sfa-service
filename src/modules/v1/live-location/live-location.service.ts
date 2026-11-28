import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';
import { CreateLiveLocationDto } from './dto/create-live-location.dto';
import { LiveLocationQueryDto } from './dto/live-location-query.dto';
import { TrackLiveLocationDto } from './dto/track-live-location.dto';
import { LIVE_LOCATION } from './live-location.constants';
import { LiveBroadcastFilter } from './live-broadcast.filter';
import { LocationPointsStore, type StoredPoint } from './location-points.store';
import { TrackingSettingsService } from './tracking-settings.service';

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
export class LiveLocationService {
  private readonly workSessionModel: Model<WorkSession>;
  /** workSessionId:userId → session check result (avoids a DB read per point) */
  private readonly sessionCheck = new Map<
    string,
    { ok: boolean; at: number }
  >();
  /** Set by the gateway: pushes points received over HTTP to live viewers too. */
  private realtimeListener?: (update: LiveLocationUpdate) => void;
  private readonly broadcastFilter = new LiveBroadcastFilter();

  setRealtimeListener(listener: (update: LiveLocationUpdate) => void) {
    this.realtimeListener = listener;
  }

  constructor(
    mongo: MongoService,
    private readonly pointsStore: LocationPointsStore,
    private readonly trackingSettings: TrackingSettingsService,
  ) {
    this.workSessionModel = mongo.getModel(WorkSession.name, WorkSessionSchema);
  }

  /**
   * Whether a point should move the live marker: accurate enough for this user,
   * newer than the last one shown, and not an impossible GPS jump.
   */
  shouldBroadcast(update: LiveLocationUpdate) {
    const point = {
      employeeId: update.employeeId,
      workSessionId: update.workSessionId,
      latitude: update.location.latitude,
      longitude: update.location.longitude,
      accuracy: update.location.accuracy,
      capturedAt: update.location.capturedAt,
      speed: update.location.speed,
      source: update.location.source,
    };
    const reason = this.broadcastFilter.check(
      point,
      this.trackingSettings.forUser(update.employeeId).maxAccuracyM,
    );
    if (reason !== null) return false;
    // GPS drift: the filter held the marker on its last position
    update.location.latitude = point.latitude;
    update.location.longitude = point.longitude;
    return true;
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

  /**
   * Stores the point in the time-series store, which keeps only points that
   * add information (movement, turns, a keep-alive while stopped).
   * Resolves true when the point will be stored.
   */
  async storePoint(update: LiveLocationUpdate): Promise<boolean> {
    if (!(await this.isUserSession(update.workSessionId, update.employeeId))) {
      throw new NotFoundException('Work session not found');
    }
    return this.pointsStore.add({
      userId: update.employeeId,
      workSessionId: update.workSessionId,
      vanId: update.vanId,
      latitude: update.location.latitude,
      longitude: update.location.longitude,
      accuracy: update.location.accuracy,
      speed: update.location.speed,
      heading: update.location.heading,
      capturedAt: update.location.capturedAt,
      source: update.location.source,
    });
  }

  /** The session exists and belongs to the user (late offline points are accepted). */
  private async isUserSession(workSessionId: string, userId: string) {
    const key = `${workSessionId}:${userId}`;
    const cached = this.sessionCheck.get(key);
    const ttl = cached?.ok ? 10 * 60_000 : 60_000;
    if (cached && Date.now() - cached.at < ttl) return cached.ok;
    const ok = Boolean(
      await this.workSessionModel.exists({
        workSessionId,
        userId,
        isDeleted: false,
      } as any),
    );
    if (this.sessionCheck.size > 5000) this.sessionCheck.clear();
    this.sessionCheck.set(key, { ok, at: Date.now() });
    return ok;
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
      if (await this.storePoint(update)) persistedCount += 1;
    }
    // Background / offline batches arrive over HTTP; broadcast them so the
    // portal stays real time (in capture order, so trails grow correctly).
    // Inaccurate, late or jumping points are stored (if storage keeps them) but
    // never move the live marker.
    if (this.realtimeListener) {
      for (const update of [...updates].sort(
        (a, b) =>
          new Date(a.location.capturedAt).getTime() -
          new Date(b.location.capturedAt).getTime(),
      )) {
        if (!this.shouldBroadcast(update)) continue;
        try {
          this.realtimeListener(update);
        } catch {
          /* live delivery is best effort */
        }
      }
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
    await this.storePoint(update);
    return {
      statusCode: HttpStatus.CREATED,
      message: LIVE_LOCATION.CREATED,
      data: update,
    };
  }

  /** Stored points, filtered by user / session / time range (newest first, max 5000). */
  async findAll(query: LiveLocationQueryDto) {
    const filter: Record<string, unknown> = {};
    if (query.userId) filter['m.userId'] = query.userId;
    if (query.workSessionId) filter['m.workSessionId'] = query.workSessionId;
    if (query.startDate || query.endDate) {
      filter.t = {
        ...(query.startDate ? { $gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { $lte: new Date(query.endDate) } : {}),
      };
    }
    await this.pointsStore.flush();
    const points = await this.pointsStore.collection
      .find(filter, { projection: { _id: 0 } })
      .sort({ t: -1 })
      .limit(5000)
      .toArray();
    return {
      statusCode: HttpStatus.OK,
      message: LIVE_LOCATION.FETCHED,
      data: points.map((point) => this.fromStored(point)),
    };
  }

  async findForSessions(
    workSessionIds: string[],
    startDate: Date,
    endDate: Date,
  ) {
    const points = await this.pointsStore.findBySessions(
      workSessionIds,
      startDate,
      endDate,
    );
    return points.map((point) => this.fromStored(point));
  }

  async findLatestForSession(workSessionId?: string) {
    if (!workSessionId) return null;
    const stored = await this.pointsStore.findLatest(workSessionId);
    return stored ? this.fromStored(stored) : null;
  }

  private fromStored(point: StoredPoint) {
    return {
      userId: point.m.userId,
      workSessionId: point.m.workSessionId,
      vanId: point.m.vanId,
      latitude: point.lat,
      longitude: point.lng,
      accuracy: point.acc ?? null,
      speed: point.spd ?? null,
      heading: point.hdg ?? null,
      capturedAt: point.t,
    };
  }
}
