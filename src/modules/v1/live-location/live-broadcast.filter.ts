import { distanceMeters } from './road-snap.service';
import { accuracyLimitFor, isAccuracyDrift } from './location-drift';

/** Same limits the day-route cleaner uses, so live and history agree. */
export const LIVE_MAX_SPEED_KMH = 160;
const JUMP_MIN_METERS = 300;
/** After this long without an accepted point, trust the next one again. */
const JUMP_RESET_MS = 5 * 60_000;
/** A device that keeps reporting the "jumped" place was right; the old point was wrong. */
const JUMP_CONFIRMATIONS = 3;
const FUTURE_TOLERANCE_MS = 60_000;
const MAX_TRACKED_USERS = 10_000;

export type LivePoint = {
  employeeId: string;
  workSessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: Date;
  speed?: number | null;
  /** FOREGROUND / BACKGROUND; background fixes get a looser accuracy limit. */
  source?: string | null;
};

export type LiveRejectReason = 'accuracy' | 'future' | 'out-of-order' | 'jump';

type Last = {
  workSessionId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  time: number;
  jumps: number;
};

/**
 * Decides which received points are pushed to the live map. Storage has its own
 * filter (LocationPointsStore); this one keeps the live marker from jumping to
 * Wi-Fi / cell fixes, GPS spikes, or older points that arrive late (offline
 * batches). Rejected points are still stored when storage accepts them, so day
 * routes are unaffected. GPS drift while standing still is accepted, but the
 * point's coordinates are moved back onto the held position.
 */
export class LiveBroadcastFilter {
  private readonly last = new Map<string, Last>();

  check(
    point: LivePoint,
    maxAccuracyM: number,
    now = Date.now(),
  ): LiveRejectReason | null {
    if (
      point.accuracy != null &&
      Number(point.accuracy) > accuracyLimitFor(maxAccuracyM, point.source)
    ) {
      return 'accuracy';
    }

    const time = point.capturedAt.getTime();
    if (time > now + FUTURE_TOLERANCE_MS) return 'future';

    const previous = this.last.get(point.employeeId);
    if (previous && previous.workSessionId === point.workSessionId) {
      if (time <= previous.time) return 'out-of-order';

      const elapsedMs = time - previous.time;
      const meters = distanceMeters(
        [previous.latitude, previous.longitude],
        [point.latitude, point.longitude],
      );
      const kmh = (meters / (elapsedMs / 1000)) * 3.6;
      if (
        elapsedMs < JUMP_RESET_MS &&
        meters > JUMP_MIN_METERS &&
        kmh > LIVE_MAX_SPEED_KMH &&
        previous.jumps + 1 < JUMP_CONFIRMATIONS
      ) {
        previous.jumps += 1;
        return 'jump';
      }
      if (isAccuracyDrift(previous.accuracy, point, meters)) {
        point.latitude = previous.latitude;
        point.longitude = previous.longitude;
        previous.time = time;
        previous.jumps = 0;
        return null;
      }
    }

    if (this.last.size >= MAX_TRACKED_USERS && !this.last.has(point.employeeId))
      this.last.clear();
    this.last.set(point.employeeId, {
      workSessionId: point.workSessionId,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy == null ? null : Number(point.accuracy),
      time,
      jumps: 0,
    });
    return null;
  }
}
