/**
 * GPS point store (MongoDB time series)
 * -------------------------------------
 * The single store for tracked points (socket, HTTP and offline sync):
 * collection `live_location_points`, compressed and bucketed by MongoDB.
 *
 *   t : capturedAt (timeField)
 *   m : { userId, workSessionId, vanId }  (metaField, stored once per bucket)
 *
 * Size is kept small without losing route accuracy:
 *  - points are simplified on write (online "opening window" line
 *    simplification): points on a straight stretch are skipped, and the
 *    point where the path bends is kept, so the stored route never deviates
 *    more than `toleranceMeters` from the raw GPS route. A point is also kept
 *    every `keepAliveMs` (stops keep minute-accurate start/end times);
 *  - fixes worse than `maxAccuracyMeters` are dropped (never drawn anyway);
 *  - numbers are rounded to what GPS can actually resolve (5 decimals ≈ 1.1 m),
 *    which also compresses much better;
 *  - zstd compression and day-long buckets ("minutes" granularity).
 * Live viewers still receive every point over the socket — only storage is filtered.
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Collection, Db } from 'mongodb';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { accuracyLimitFor, isAccuracyDrift } from './location-drift';

export const POINTS_COLLECTION = 'live_location_points';
const FLUSH_MS = 2000;
const MAX_BUFFER = 5000;
/** Raw points are kept this long (route history); 0 keeps them forever. */
const RETENTION_DAYS = Number(
  process.env.LOCATION_POINTS_RETENTION_DAYS || 400,
);

/** Admin controlled (TrackingSettingsService); these are the defaults. */
export type FilterParams = {
  /** Max distance between the stored route and the raw GPS route. */
  toleranceMeters: number;
  /** A point is stored at least this often, even when standing still. */
  keepAliveMs: number;
  /** Fixes less accurate than this are not stored. */
  maxAccuracyMeters: number;
};
let params: FilterParams = {
  toleranceMeters: 5,
  keepAliveMs: 60_000,
  maxAccuracyMeters: 50,
};
export const setFilterParams = (next: FilterParams) => {
  params = { ...next };
};
/** A stream quiet this long has its last pending point stored (route tail). */
const TAIL_FLUSH_MS = 30_000;
/** Forget filter state of sessions quiet for this long. */
const STATE_TTL_MS = 6 * 60 * 60 * 1000;

export type StoredPoint = {
  t: Date;
  m: { userId: string; workSessionId: string; vanId?: string };
  lat: number;
  lng: number;
  acc?: number;
  spd?: number;
  hdg?: number;
};

export type RawPoint = {
  userId: string;
  workSessionId: string;
  vanId?: string | null;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  capturedAt: Date | string;
  /** FOREGROUND / BACKGROUND; background fixes get a looser accuracy limit. */
  source?: string | null;
};

type FilterState = {
  /** Last stored point */
  anchor: StoredPoint;
  /** Points after the anchor that are not stored (yet) */
  pending: StoredPoint[];
  seenAt: number;
};

const round = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const distanceMeters = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12_742_000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Distance (m) of point p from segment a→b, on a local flat projection. */
const offsetMeters = (p: StoredPoint, a: StoredPoint, b: StoredPoint) => {
  const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110_574;
  const px = (p.lng - a.lng) * kx;
  const py = (p.lat - a.lat) * ky;
  const bx = (b.lng - a.lng) * kx;
  const by = (b.lat - a.lat) * ky;
  const lengthSq = bx * bx + by * by;
  const t = lengthSq
    ? Math.max(0, Math.min(1, (px * bx + py * by) / lengthSq))
    : 0;
  return Math.hypot(px - t * bx, py - t * by);
};

/** Compact, rounded document for a raw point (null when unusable). */
export function toStoredPoint(point: RawPoint): StoredPoint | null {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const t = new Date(point.capturedAt);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Number.isNaN(t.getTime())
  ) {
    return null;
  }
  if (
    point.accuracy != null &&
    Number(point.accuracy) >
      accuracyLimitFor(params.maxAccuracyMeters, point.source)
  ) {
    return null;
  }
  const doc: StoredPoint = {
    t,
    m: {
      userId: String(point.userId),
      workSessionId: String(point.workSessionId),
      ...(point.vanId ? { vanId: String(point.vanId) } : {}),
    },
    lat: round(latitude, 5),
    lng: round(longitude, 5),
  };
  if (point.accuracy != null && Number.isFinite(Number(point.accuracy)))
    doc.acc = Math.round(Number(point.accuracy));
  if (
    point.speed != null &&
    Number.isFinite(Number(point.speed)) &&
    Number(point.speed) >= 0
  ) {
    doc.spd = round(Number(point.speed), 1);
  }
  if (
    point.heading != null &&
    Number.isFinite(Number(point.heading)) &&
    Number(point.heading) >= 0
  ) {
    doc.hdg = Math.round(Number(point.heading)) % 360;
  }
  return doc;
}

/**
 * Feeds one point (time ordered) into a stream. Returns the points to store
 * now (0 or 1; with a fresh stream the first point is stored immediately).
 */
function feed(
  state: FilterState | undefined,
  point: StoredPoint,
): { state: FilterState; store: StoredPoint[] } {
  const seenAt = Date.now();
  if (!state)
    return { state: { anchor: point, pending: [], seenAt }, store: [point] };
  const last = state.pending[state.pending.length - 1] ?? state.anchor;
  // GPS drift while standing still: hold the last position (and its accuracy)
  const meters = distanceMeters(last.lat, last.lng, point.lat, point.lng);
  if (
    isAccuracyDrift(last.acc, { accuracy: point.acc, speed: point.spd }, meters)
  ) {
    point.lat = last.lat;
    point.lng = last.lng;
    if (last.acc != null) point.acc = last.acc;
    else delete point.acc;
  }
  // Duplicate (same place within a second)
  if (
    Math.abs(point.t.getTime() - last.t.getTime()) < 1000 &&
    point.lat === last.lat &&
    point.lng === last.lng
  ) {
    state.seenAt = seenAt;
    return { state, store: [] };
  }
  // Keep-alive: never leave more than a minute without a stored point
  if (point.t.getTime() - state.anchor.t.getTime() >= params.keepAliveMs) {
    if (
      state.pending.length &&
      last.t.getTime() - state.anchor.t.getTime() >= params.keepAliveMs / 2
    ) {
      // keep the bend before the gap, then this point
      return {
        state: { anchor: point, pending: [], seenAt },
        store: [last, point],
      };
    }
    return { state: { anchor: point, pending: [], seenAt }, store: [point] };
  }
  // Would a straight line anchor → point still pass within tolerance of every skipped point?
  const bends = state.pending.some(
    (skipped) =>
      offsetMeters(skipped, state.anchor, point) > params.toleranceMeters,
  );
  if (bends) {
    // Store the last skipped point (where the path bent); this point starts a new window
    return { state: { anchor: last, pending: [point], seenAt }, store: [last] };
  }
  state.pending.push(point);
  state.seenAt = seenAt;
  return { state, store: [] };
}

/** Simplifies a batch on its own (offline sync / back-fill). */
export function filterBatch(points: RawPoint[]): StoredPoint[] {
  const docs = points
    .map(toStoredPoint)
    .filter((doc): doc is StoredPoint => Boolean(doc))
    .sort((a, b) => a.t.getTime() - b.t.getTime());
  const states = new Map<string, FilterState>();
  const stored: StoredPoint[] = [];
  for (const doc of docs) {
    const key = doc.m.workSessionId;
    const result = feed(states.get(key), doc);
    states.set(key, result.state);
    stored.push(...result.store);
  }
  // Always keep the final position of each stream
  for (const state of states.values()) {
    const tail = state.pending[state.pending.length - 1];
    if (tail) stored.push(tail);
  }
  return stored.sort((a, b) => a.t.getTime() - b.t.getTime());
}

/** Creates the time-series collection (zstd, day buckets) if missing. */
export async function ensurePointsCollection(db: Db, logger?: Logger) {
  const exists = await db
    .listCollections({ name: POINTS_COLLECTION })
    .hasNext();
  if (exists) {
    // Day-long buckets compress filtered (sparser) data better. Allowed seconds → minutes.
    await db
      .command({
        collMod: POINTS_COLLECTION,
        timeseries: { granularity: 'minutes' },
      })
      .catch(() => undefined);
  } else {
    const timeseries = {
      timeField: 't',
      metaField: 'm',
      granularity: 'minutes' as const,
    };
    const expiry =
      RETENTION_DAYS > 0 ? { expireAfterSeconds: RETENTION_DAYS * 86400 } : {};
    const attempts = [
      {
        timeseries,
        ...expiry,
        storageEngine: {
          wiredTiger: { configString: 'block_compressor=zstd' },
        },
      },
      { timeseries, ...expiry },
      {},
    ];
    for (const options of attempts) {
      try {
        await db.createCollection(POINTS_COLLECTION, options);
        logger?.log(
          `Created ${POINTS_COLLECTION} (${'timeseries' in options ? 'time series' : 'normal'}${
            'storageEngine' in options ? ', zstd' : ''
          })`,
        );
        break;
      } catch (error) {
        logger?.warn(
          `Create ${POINTS_COLLECTION} failed: ${(error as Error).message}`,
        );
      }
    }
  }
  const collection = db.collection(POINTS_COLLECTION);
  await collection
    .createIndex({ 'm.workSessionId': 1, t: 1 })
    .catch(() => undefined);
  await collection.createIndex({ 'm.userId': 1, t: 1 }).catch(() => undefined);
}

@Injectable()
export class LocationPointsStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationPointsStore.name);
  private buffer: StoredPoint[] = [];
  private timer?: NodeJS.Timeout;
  private ready: Promise<void> = Promise.resolve();
  /** Last stored point per live stream, and per back-fill stream. */
  private readonly states = new Map<string, FilterState>();

  constructor(private readonly mongo: MongoService) {}

  get collection(): Collection<StoredPoint> {
    return this.mongo.getDb().collection<StoredPoint>(POINTS_COLLECTION);
  }

  onModuleInit() {
    this.ready = ensurePointsCollection(this.mongo.getDb(), this.logger).catch(
      (error) =>
        this.logger.error(
          `Location points collection setup failed: ${(error as Error).message}`,
        ),
    );
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush(true);
  }

  /** Feeds the point to its stream. Returns true when something was queued for storage. */
  add(point: RawPoint): boolean {
    const doc = toStoredPoint(point);
    if (!doc) return false;
    const liveKey = doc.m.workSessionId;
    const live = this.states.get(liveKey);
    const head = live
      ? (live.pending[live.pending.length - 1] ?? live.anchor)
      : null;
    // Points older than the stream head are back-fill (offline / delayed batch)
    const key =
      head && doc.t.getTime() < head.t.getTime() - 1000
        ? `${liveKey}:backfill`
        : liveKey;
    const result = feed(this.states.get(key), doc);
    this.states.set(key, result.state);
    this.enqueue(result.store);
    return result.store.length > 0;
  }

  private enqueue(points: StoredPoint[]) {
    for (const point of points) {
      if (this.buffer.length >= MAX_BUFFER) this.buffer.shift();
      this.buffer.push(point);
    }
  }

  /** Stores the newest pending point of streams that went quiet (route tail / day end). */
  private flushTails(force = false) {
    const now = Date.now();
    for (const [key, state] of this.states) {
      const tail = state.pending[state.pending.length - 1];
      if (tail && (force || now - state.seenAt >= TAIL_FLUSH_MS)) {
        this.enqueue([tail]);
        this.states.set(key, {
          anchor: tail,
          pending: [],
          seenAt: state.seenAt,
        });
      }
      if (now - state.seenAt > STATE_TTL_MS) this.states.delete(key);
    }
  }

  async flush(forceTails = false) {
    this.flushTails(forceTails);
    if (!this.buffer.length) return;
    const batch = this.buffer;
    this.buffer = [];
    try {
      await this.ready;
      await this.collection.insertMany(batch, { ordered: false });
    } catch (error) {
      this.logger.warn(
        `Location points flush failed: ${(error as Error).message}`,
      );
    }
  }

  /** Newest not-yet-stored point of a live stream (keeps reads up to date). */
  private pendingHead(workSessionId: string) {
    const state = this.states.get(workSessionId);
    return state?.pending[state.pending.length - 1] ?? null;
  }

  /** Points of the given work sessions, oldest first (incl. the live head). */
  async findBySessions(workSessionIds: string[], from?: Date, to?: Date) {
    if (!workSessionIds.length) return [];
    await this.flush();
    const stored = await this.collection
      .find(
        {
          'm.workSessionId': { $in: workSessionIds },
          ...(from || to
            ? {
                t: {
                  ...(from ? { $gte: from } : {}),
                  ...(to ? { $lte: to } : {}),
                },
              }
            : {}),
        },
        { projection: { _id: 0 } },
      )
      .sort({ t: 1 })
      .toArray();
    const heads = workSessionIds
      .map((id) => this.pendingHead(id))
      .filter(
        (head): head is StoredPoint =>
          Boolean(head) && (!from || head!.t >= from) && (!to || head!.t <= to),
      );
    return heads.length
      ? [...stored, ...heads].sort((a, b) => a.t.getTime() - b.t.getTime())
      : stored;
  }

  /** Latest point of a work session (live head first). */
  async findLatest(workSessionId: string) {
    const head = this.pendingHead(workSessionId);
    if (head) return head;
    await this.flush();
    return this.collection
      .find({ 'm.workSessionId': workSessionId }, { projection: { _id: 0 } })
      .sort({ t: -1 })
      .limit(1)
      .next();
  }
}
