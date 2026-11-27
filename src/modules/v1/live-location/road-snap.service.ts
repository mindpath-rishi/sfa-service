/**
 * Road matching on our own OSRM server, with a persistent cache
 * --------------------------------------------------------------
 * Matches a work session's GPS trail to real roads (OSRM /match, using
 * OpenStreetMap roads), so the portal draws the path the van actually drove.
 * No tracking data leaves our servers. To keep the OSRM load low:
 *  - results are stored in MongoDB (`route_snap_cache`), one doc per session;
 *  - only points newer than the cached part are sent (incremental);
 *  - points closer than THIN_METERS are dropped before sending;
 *  - an active session is re-snapped at most every SNAP_REFRESH_MS
 *    (the newest raw points are appended unsnapped in between);
 *  - a finished session is snapped once and then always served from cache;
 *  - concurrent requests for the same session share one in-flight call.
 * Without OSRM_URL (e.g. http://osrm:5000) the cleaned raw path is returned;
 * see infra/maps for running OSRM.
 */
import { Injectable, Logger } from '@nestjs/common';
import { Collection } from 'mongodb';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { TrackingSettingsService } from './tracking-settings.service';

export type TrackPoint = { latitude: number; longitude: number; capturedAt: Date };
type LatLng = [number, number];

/** OSRM's default --max-matching-size is 100 */
const MAX_POINTS_PER_CALL = 100;
/** GPS search radius per point (m) when matching */
const MATCH_RADIUS_METERS = 25;
const OSRM_TIMEOUT_MS = 10_000;
const THIN_METERS = 25;
/** Do not ask Google to connect points this far apart (GPS gap / tunnel / app closed). */
const MAX_GAP_METERS = 1500;
const SNAP_REFRESH_MS = 2 * 60 * 1000;

type CacheDoc = {
  key: string;
  path: LatLng[];
  lastRawAt: Date;
  lastRawPoint: LatLng;
  complete: boolean;
  apiCalls: number;
  updatedAt: Date;
};

export const distanceMeters = ([lat1, lng1]: LatLng, [lat2, lng2]: LatLng) => {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

@Injectable()
export class RoadSnapService {
  private readonly logger = new Logger(RoadSnapService.name);
  private readonly cache: Collection<CacheDoc>;
  private readonly inFlight = new Map<string, Promise<{ path: LatLng[]; snapped: boolean }>>();
  private indexed = false;

  constructor(
    mongo: MongoService,
    private readonly trackingSettings: TrackingSettingsService,
  ) {
    this.cache = mongo.getDb().collection<CacheDoc>('route_snap_cache');
  }

  private get osrmUrl() {
    return (process.env.OSRM_URL || '').replace(/\/+$/, '');
  }

  /** Snapped path for a session's points (sorted by time). */
  snap(key: string, points: TrackPoint[], sessionFinished: boolean) {
    if (points.length < 2) {
      return Promise.resolve({
        path: points.map((p) => [p.latitude, p.longitude] as LatLng),
        snapped: false,
      });
    }
    const running = this.inFlight.get(key);
    if (running) return running;
    const job = this.snapInternal(key, points, sessionFinished).finally(() =>
      this.inFlight.delete(key),
    );
    this.inFlight.set(key, job);
    return job;
  }

  private async snapInternal(key: string, points: TrackPoint[], finished: boolean) {
    const raw = (list: TrackPoint[]) => list.map((p) => [p.latitude, p.longitude] as LatLng);
    if (!this.osrmUrl || !this.trackingSettings.current.roadSnapEnabled) {
      return { path: raw(points), snapped: false };
    }

    if (!this.indexed) {
      this.indexed = true;
      void this.cache.createIndex({ key: 1 }, { unique: true }).catch(() => undefined);
    }

    const cached = await this.cache.findOne({ key });

    if (cached) {
      const cachedUntil = new Date(cached.lastRawAt).getTime();
      const tail = points.filter((p) => p.capturedAt.getTime() > cachedUntil);
      // Fully cached (or session finished and cache complete): no API call.
      if (!tail.length || cached.complete) {
        return { path: cached.path, snapped: true };
      }
      // Active session snapped recently: serve cache + raw tail, no API call.
      if (!finished && Date.now() - new Date(cached.updatedAt).getTime() < SNAP_REFRESH_MS) {
        return { path: [...cached.path, ...raw(tail)], snapped: true };
      }
      const fresh = await this.snapPoints([cached.lastRawPoint, ...raw(tail)]);
      if (!fresh) return { path: [...cached.path, ...raw(tail)], snapped: true };
      const path = [...cached.path, ...fresh.path.slice(1)];
      await this.save(key, path, tail[tail.length - 1], finished, (cached.apiCalls || 0) + fresh.calls);
      return { path, snapped: true };
    }

    const fresh = await this.snapPoints(raw(points));
    if (!fresh) return { path: raw(points), snapped: false };
    await this.save(key, fresh.path, points[points.length - 1], finished, fresh.calls);
    return { path: fresh.path, snapped: true };
  }

  private async save(key: string, path: LatLng[], last: TrackPoint, complete: boolean, apiCalls: number) {
    await this.cache.updateOne(
      { key },
      {
        $set: {
          key,
          path,
          lastRawAt: last.capturedAt,
          lastRawPoint: [last.latitude, last.longitude],
          complete,
          apiCalls,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
  }

  /**
   * Thin, split at gaps, snap in chunks of 100. Null when the API fails or
   * nothing matched a road (e.g. points outside the loaded OSRM region), so the
   * raw path is neither cached nor reported as road matched.
   */
  private async snapPoints(coords: LatLng[]): Promise<{ path: LatLng[]; calls: number } | null> {
    const thinned: LatLng[] = [];
    for (const point of coords) {
      const previous = thinned[thinned.length - 1];
      if (!previous || distanceMeters(previous, point) >= THIN_METERS) thinned.push(point);
    }
    const last = coords[coords.length - 1];
    if (thinned[thinned.length - 1] !== last) thinned.push(last);

    // Segments without big gaps; gaps are drawn as straight jumps.
    const segments: LatLng[][] = [[]];
    for (const point of thinned) {
      const current = segments[segments.length - 1];
      const previous = current[current.length - 1];
      if (previous && distanceMeters(previous, point) > MAX_GAP_METERS) segments.push([point]);
      else current.push(point);
    }

    const path: LatLng[] = [];
    let calls = 0;
    let matchedCalls = 0;
    try {
      for (const segment of segments) {
        if (segment.length < 2) {
          path.push(...segment);
          continue;
        }
        for (let start = 0; start < segment.length - 1; start += MAX_POINTS_PER_CALL - 1) {
          const chunk = segment.slice(start, start + MAX_POINTS_PER_CALL);
          const snapped = await this.callRoads(chunk);
          calls += 1;
          if (snapped.matched) matchedCalls += 1;
          path.push(...(path.length ? snapped.path.slice(1) : snapped.path));
        }
      }
      if (calls > 0 && matchedCalls === 0) {
        this.logger.warn(
          `Road snapping matched no roads for ${calls} chunk(s); is the OSRM region right for these points?`,
        );
        return null;
      }
      return { path, calls };
    } catch (error) {
      this.logger.warn(`Road snapping failed: ${(error as Error).message}`);
      return null;
    }
  }

  /** OSRM map matching of one chunk; unmatched stretches keep the raw points. */
  private async callRoads(chunk: LatLng[]): Promise<{ path: LatLng[]; matched: boolean }> {
    const coordinates = chunk.map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
    const radiuses = chunk.map(() => MATCH_RADIUS_METERS).join(';');
    const url = `${this.osrmUrl}/match/v1/driving/${coordinates}?overview=full&geometries=geojson&gaps=split&tidy=true&radiuses=${radiuses}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        matchings?: { geometry?: { coordinates?: [number, number][] } }[];
      };
      // NoMatch / NoSegment: nothing matched here, keep the raw points
      if (body.code && body.code !== 'Ok') return { path: chunk, matched: false };
      if (!response.ok) throw new Error(`OSRM ${response.status}`);
      const matched = (body.matchings ?? []).flatMap(
        (matching) => (matching.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as LatLng),
      );
      return matched.length > 1 ? { path: matched, matched: true } : { path: chunk, matched: false };
    } finally {
      clearTimeout(timer);
    }
  }
}
