/**
 * Day route of a field user
 * -------------------------
 * Builds everything the portal needs to replay a user's day on the map:
 *  - cleaned GPS trail (bad accuracy / GPS spikes removed) with timestamps,
 *  - road-matched path (own OSRM server, cached; see RoadSnapService),
 *  - stops (stayed ≥ stopMinMinutes within stopRadiusM, admin settings),
 *  - shop visits with order value / no-sale reason,
 *  - a time-ordered timeline (day start → travel → visits / stops → day end),
 *  - day stats (distance, driving / visit / idle time, sales).
 * Points come from the time-series store (live_location_points).
 */
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { LocationPointsStore } from './location-points.store';
import { TrackingSettingsService } from './tracking-settings.service';
import {
  BACKGROUND_MIN_ACCURACY_LIMIT_M,
  isAccuracyDrift,
} from './location-drift';
import {
  distanceMeters,
  RoadSnapService,
  type TrackPoint,
} from './road-snap.service';

const MAX_SPEED_KMH = 160;
const VISIT_MATCH_METERS = 150;

type Point = TrackPoint & { accuracy?: number; speed?: number };

export type TimelineEvent = {
  id: string;
  type: 'DAY_START' | 'VISIT' | 'STOP' | 'DAY_END' | 'TRAVEL';
  title: string;
  subtitle?: string;
  start: string;
  end?: string;
  durationMinutes?: number;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  // visits
  visitId?: string;
  outletId?: string;
  outcome?: 'ORDER' | 'NO_SALE' | 'VISITED';
  orderValue?: number;
  orderCount?: number;
  sequence?: number;
};

const TIMEZONE = process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

/** YYYY-MM-DD of an instant in the business timezone. */
const dayKey = (instant: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);

/** Offset of the business timezone from UTC at an instant, in ms. */
const zoneOffsetMs = (instant: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

/** Start / end instants of a business day. */
const dayBounds = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const midnightUtc = Date.UTC(year, month - 1, day);
  const from = new Date(midnightUtc - zoneOffsetMs(new Date(midnightUtc)));
  return { from, to: new Date(from.getTime() + 86_400_000 - 1) };
};

const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const minutesBetween = (a: Date, b: Date) =>
  (b.getTime() - a.getTime()) / 60000;

@Injectable()
export class DayRouteService {
  constructor(
    private readonly mongo: MongoService,
    private readonly pointsStore: LocationPointsStore,
    private readonly roadSnap: RoadSnapService,
    private readonly trackingSettings: TrackingSettingsService,
  ) {}

  async getDayRoute(employeeId: string, date?: string) {
    if (!employeeId) throw new BadRequestException('employeeId is required');
    const dayString = date || dayKey(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayString))
      throw new BadRequestException('Invalid date');
    const { from, to } = dayBounds(dayString);

    const db = this.mongo.getDb();
    const [employee, sessions] = await Promise.all([
      db
        .collection('employees')
        .findOne(
          { employeeId },
          { projection: { _id: 0, employeeId: 1, name: 1, mobile: 1 } },
        ),
      db
        .collection('work_sessions')
        .find({
          userId: employeeId,
          dayStartTime: { $gte: from, $lte: to },
          isDeleted: { $ne: true },
        })
        .sort({ dayStartTime: 1 })
        .toArray(),
    ]);
    if (!employee) throw new NotFoundException('User not found');

    const sessionIds = sessions.map((session) => String(session.workSessionId));
    const dayEnd = sessions.reduce<Date | null>(
      (latest, session) =>
        session.dayEndTime && (!latest || session.dayEndTime > latest)
          ? new Date(session.dayEndTime)
          : latest,
      null,
    );
    const active = sessions.some(
      (session) => String(session.status).toUpperCase() === 'ACTIVE',
    );
    const until = active ? new Date() : (dayEnd ?? to);

    /* ---------------- GPS points ---------------- */
    const pointsWindowEnd = active ? new Date() : to;
    const rawPoints: Point[] = (
      await this.pointsStore.findBySessions(sessionIds, from, pointsWindowEnd)
    ).map((point) => ({
      latitude: point.lat,
      longitude: point.lng,
      capturedAt: new Date(point.t),
      accuracy: point.acc,
      speed: point.spd,
    }));
    const points = this.clean(rawPoints);

    /* ---------------- snapped path (cached per session) ---------------- */
    const snappedSegments = await Promise.all(
      sessions.map((session) => {
        const sessionPoints = points.filter(
          (point) =>
            point.capturedAt >= new Date(session.dayStartTime) &&
            (!session.dayEndTime ||
              point.capturedAt <= new Date(session.dayEndTime)),
        );
        return this.roadSnap.snap(
          `ws:${session.workSessionId}`,
          sessionPoints,
          String(session.status).toUpperCase() !== 'ACTIVE',
        );
      }),
    );

    /* ---------------- visits + orders ---------------- */
    const visits = sessionIds.length
      ? await db
          .collection('shop_visits')
          .find({
            workSessionId: { $in: sessionIds },
            isDeleted: { $ne: true },
          })
          .sort({ checkInTime: 1 })
          .toArray()
      : [];
    const visitIds = visits.map((visit) => String(visit.visitId));
    const [sales, nonSales] = visitIds.length
      ? await Promise.all([
          db
            .collection('sales')
            .find(
              { visitId: { $in: visitIds }, status: { $ne: 'RETURNED' } },
              { projection: { _id: 0, visitId: 1, totalValue: 1 } },
            )
            .toArray(),
          db
            .collection('non_sale')
            .find(
              { visitId: { $in: visitIds } },
              { projection: { _id: 0, visitId: 1, reasonId: 1, remark: 1 } },
            )
            .toArray(),
        ])
      : [[], []];
    const salesByVisit = new Map<string, { value: number; count: number }>();
    for (const sale of sales) {
      const entry = salesByVisit.get(sale.visitId) ?? { value: 0, count: 0 };
      entry.value += Number(sale.totalValue) || 0;
      entry.count += 1;
      salesByVisit.set(sale.visitId, entry);
    }
    const nonSaleByVisit = new Map(nonSales.map((row) => [row.visitId, row]));

    const visitEvents: TimelineEvent[] = visits.map((visit, index) => {
      const location =
        visit.customerLocation ||
        visit.checkInLocation ||
        visit.checkOutLocation;
      const start = new Date(visit.checkInTime);
      const end = visit.checkOutTime ? new Date(visit.checkOutTime) : undefined;
      const order = salesByVisit.get(String(visit.visitId));
      const nonSale = nonSaleByVisit.get(String(visit.visitId));
      return {
        id: `visit-${visit.visitId}`,
        type: 'VISIT',
        title: visit.outletName || visit.outletId,
        subtitle: order
          ? `Order ${order.count > 1 ? `×${order.count}` : ''}`.trim()
          : nonSale
            ? `No sale${nonSale.remark ? ` · ${nonSale.remark}` : ''}`
            : 'Visited',
        start: start.toISOString(),
        end: end?.toISOString(),
        durationMinutes: end ? round(minutesBetween(start, end), 1) : undefined,
        latitude: location?.latitude,
        longitude: location?.longitude,
        visitId: visit.visitId,
        outletId: visit.outletId,
        outcome: order ? 'ORDER' : nonSale ? 'NO_SALE' : 'VISITED',
        orderValue: order ? round(order.value) : undefined,
        orderCount: order?.count,
        sequence: index + 1,
      };
    });

    /* ---------------- stops (not at a visited shop) ---------------- */
    const stops = this.detectStops(points).filter(
      (stop) =>
        !visitEvents.some((visit) => {
          if (visit.latitude == null || visit.longitude == null) return false;
          const near =
            distanceMeters(
              [stop.latitude, stop.longitude],
              [visit.latitude, visit.longitude],
            ) <= VISIT_MATCH_METERS;
          const overlaps =
            new Date(stop.start) <= new Date(visit.end ?? visit.start) &&
            new Date(stop.end) >= new Date(visit.start);
          return near && overlaps;
        }),
    );
    const stopEvents: TimelineEvent[] = stops.map((stop, index) => ({
      id: `stop-${index}`,
      type: 'STOP',
      title: 'Stopped',
      subtitle: `${Math.round(stop.durationMinutes)} min idle`,
      start: stop.start,
      end: stop.end,
      durationMinutes: round(stop.durationMinutes, 1),
      latitude: stop.latitude,
      longitude: stop.longitude,
    }));

    /* ---------------- day start / end ---------------- */
    const edgeEvents: TimelineEvent[] = [];
    sessions.forEach((session, index) => {
      const startLocation = session.dayStartLocation;
      edgeEvents.push({
        id: `start-${session.workSessionId}`,
        type: 'DAY_START',
        title: index ? 'Day restarted' : 'Day started',
        subtitle: session.vanName || session.vanId,
        start: new Date(session.dayStartTime).toISOString(),
        latitude: startLocation?.latitude ?? points[0]?.latitude,
        longitude: startLocation?.longitude ?? points[0]?.longitude,
      });
      if (session.dayEndTime) {
        const endLocation = session.dayEndLocation;
        const lastPoint = points
          .filter((p) => p.capturedAt <= new Date(session.dayEndTime))
          .at(-1);
        edgeEvents.push({
          id: `end-${session.workSessionId}`,
          type: 'DAY_END',
          title: 'Day ended',
          start: new Date(session.dayEndTime).toISOString(),
          latitude: endLocation?.latitude ?? lastPoint?.latitude,
          longitude: endLocation?.longitude ?? lastPoint?.longitude,
        });
      }
    });

    const anchors = [...edgeEvents, ...visitEvents, ...stopEvents].sort(
      (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
    );

    // Travel legs between consecutive anchors, measured along the trail.
    const timeline: TimelineEvent[] = [];
    anchors.forEach((event, index) => {
      timeline.push(event);
      const next = anchors[index + 1];
      if (!next) return;
      const legStart = new Date(event.end ?? event.start);
      const legEnd = new Date(next.start);
      if (legEnd <= legStart) return;
      const legPoints = points.filter(
        (p) => p.capturedAt >= legStart && p.capturedAt <= legEnd,
      );
      const km = this.pathKm(legPoints);
      if (km < 0.05) return;
      timeline.push({
        id: `travel-${index}`,
        type: 'TRAVEL',
        title: `Travelled ${round(km, 1)} km`,
        start: legStart.toISOString(),
        end: legEnd.toISOString(),
        durationMinutes: round(minutesBetween(legStart, legEnd), 1),
        distanceKm: round(km, 2),
      });
    });

    /* ---------------- stats ---------------- */
    const firstStart = sessions[0] ? new Date(sessions[0].dayStartTime) : null;
    const workingMinutes = firstStart
      ? Math.max(0, minutesBetween(firstStart, until))
      : 0;
    const visitMinutes = visitEvents.reduce(
      (sum, v) => sum + (v.durationMinutes ?? 0),
      0,
    );
    const idleMinutes = stopEvents.reduce(
      (sum, s) => sum + (s.durationMinutes ?? 0),
      0,
    );
    const travelMinutes = timeline
      .filter((event) => event.type === 'TRAVEL')
      .reduce((sum, t) => sum + (t.durationMinutes ?? 0), 0);
    const distanceKm = this.pathKm(points);
    const moving = points.filter((p) => (p.speed ?? 0) > 1);

    return {
      statusCode: HttpStatus.OK,
      message: 'Day route fetched',
      data: {
        employee: { employeeId, name: employee.name, mobile: employee.mobile },
        date: dayString,
        active,
        sessions: sessions.map((session) => ({
          workSessionId: session.workSessionId,
          vanId: session.vanId,
          vanName: session.vanName,
          status: session.status,
          dayStartTime: session.dayStartTime,
          dayEndTime: session.dayEndTime ?? null,
        })),
        // [lat, lng, epochMs] for playback; snapped path for drawing
        trail: points.map((p) => [
          round(p.latitude, 6),
          round(p.longitude, 6),
          p.capturedAt.getTime(),
        ]),
        snappedPath: snappedSegments.map((segment) => segment.path),
        roadSnapped: snappedSegments.some((segment) => segment.snapped),
        timeline,
        stats: {
          distanceKm: round(distanceKm, 2),
          workingMinutes: Math.round(workingMinutes),
          travelMinutes: Math.round(travelMinutes),
          visitMinutes: Math.round(visitMinutes),
          idleMinutes: Math.round(idleMinutes),
          visits: visitEvents.length,
          productiveVisits: visitEvents.filter((v) => v.outcome === 'ORDER')
            .length,
          noSaleVisits: visitEvents.filter((v) => v.outcome === 'NO_SALE')
            .length,
          orderValue: round(
            visitEvents.reduce((sum, v) => sum + (v.orderValue ?? 0), 0),
          ),
          stops: stopEvents.length,
          maxSpeedKmh: round(
            Math.max(0, ...points.map((p) => (p.speed ?? 0) * 3.6)),
            0,
          ),
          avgMovingSpeedKmh: moving.length
            ? round(
                (moving.reduce((sum, p) => sum + (p.speed ?? 0), 0) /
                  moving.length) *
                  3.6,
                0,
              )
            : 0,
          points: points.length,
        },
      },
    };
  }

  /**
   * Drop inaccurate fixes, duplicates and physically impossible jumps, and hold
   * the position through GPS drift while standing still.
   */
  private clean(points: Point[]): Point[] {
    // Storage already applied the per-source limit; foreground fixes above
    // maxAccuracyM never reach here, background ones may (see location-drift).
    const accuracyLimit = Math.max(
      this.trackingSettings.current.maxAccuracyM,
      BACKGROUND_MIN_ACCURACY_LIMIT_M,
    );
    const result: Point[] = [];
    for (const point of points) {
      if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude))
        continue;
      if (point.accuracy != null && point.accuracy > accuracyLimit) continue;
      const previous = result[result.length - 1];
      if (previous) {
        const meters = distanceMeters(
          [previous.latitude, previous.longitude],
          [point.latitude, point.longitude],
        );
        const seconds =
          (point.capturedAt.getTime() - previous.capturedAt.getTime()) / 1000;
        if (seconds <= 0 && meters < 1) continue;
        if (
          seconds > 0 &&
          (meters / seconds) * 3.6 > MAX_SPEED_KMH &&
          meters > 300
        )
          continue;
        if (isAccuracyDrift(previous.accuracy, point, meters)) {
          result.push({
            ...point,
            latitude: previous.latitude,
            longitude: previous.longitude,
            accuracy: previous.accuracy,
          });
          continue;
        }
      }
      result.push(point);
    }
    return result;
  }

  private pathKm(points: Point[]) {
    let meters = 0;
    for (let i = 1; i < points.length; i += 1) {
      meters += distanceMeters(
        [points[i - 1].latitude, points[i - 1].longitude],
        [points[i].latitude, points[i].longitude],
      );
    }
    return meters / 1000;
  }

  /** Places the user stayed within STOP_RADIUS_METERS for ≥ STOP_MIN_MINUTES. */
  private detectStops(points: Point[]) {
    const {
      stopRadiusM: STOP_RADIUS_METERS,
      stopMinMinutes: STOP_MIN_MINUTES,
    } = this.trackingSettings.current;
    const stops: {
      latitude: number;
      longitude: number;
      start: string;
      end: string;
      durationMinutes: number;
    }[] = [];
    let i = 0;
    while (i < points.length) {
      const anchor = points[i];
      let j = i + 1;
      let sumLat = anchor.latitude;
      let sumLng = anchor.longitude;
      while (
        j < points.length &&
        distanceMeters(
          [anchor.latitude, anchor.longitude],
          [points[j].latitude, points[j].longitude],
        ) <= STOP_RADIUS_METERS
      ) {
        sumLat += points[j].latitude;
        sumLng += points[j].longitude;
        j += 1;
      }
      const last = points[j - 1];
      const minutes = minutesBetween(anchor.capturedAt, last.capturedAt);
      if (minutes >= STOP_MIN_MINUTES) {
        const count = j - i;
        stops.push({
          latitude: sumLat / count,
          longitude: sumLng / count,
          start: anchor.capturedAt.toISOString(),
          end: last.capturedAt.toISOString(),
          durationMinutes: minutes,
        });
        i = j;
      } else {
        i += 1;
      }
    }
    return stops;
  }
}
