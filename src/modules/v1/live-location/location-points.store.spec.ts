import { filterBatch, toStoredPoint, type RawPoint } from './location-points.store';

const base = { userId: 'U1', workSessionId: 'WS1' };
const start = Date.UTC(2026, 10, 24, 6, 0, 0);

/** Simulated day: drive east, 90° turn, drive north, 20 min parked; a point every 2 s. */
function simulateDay(): RawPoint[] {
  const points: RawPoint[] = [];
  let lat = -15.4;
  let lng = 28.3;
  let t = start;
  const push = (heading: number, speed: number, accuracy = 8) =>
    points.push({ ...base, latitude: lat, longitude: lng, heading, speed, accuracy, capturedAt: new Date(t) });
  // 10 min east at ~36 km/h (10 m/s → 20 m per 2 s)
  for (let i = 0; i < 300; i += 1, t += 2000) {
    lng += 20 / 111_320 / Math.cos((lat * Math.PI) / 180);
    push(90, 10);
  }
  // 10 min north
  for (let i = 0; i < 300; i += 1, t += 2000) {
    lat += 20 / 110_574;
    push(0, 10);
  }
  // 20 min parked with ±2 m GPS jitter
  for (let i = 0; i < 600; i += 1, t += 2000) {
    points.push({
      ...base,
      latitude: lat + ((i % 3) - 1) * 0.00002,
      longitude: lng + ((i % 2) - 0.5) * 0.00002,
      heading: (i * 37) % 360,
      speed: 0,
      accuracy: 6,
      capturedAt: new Date(t),
    });
  }
  return points;
}

const pathMeters = (points: { lat: number; lng: number }[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const rad = Math.PI / 180;
    const a = points[i - 1];
    const b = points[i];
    const dLat = (b.lat - a.lat) * rad;
    const dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    total += 12_742_000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  return total;
};

describe('location point storage filter', () => {
  it('stores far fewer points while keeping distance, corners and stop times', () => {
    const raw = simulateDay();
    const stored = filterBatch(raw);
    const rawDocs = raw.map((point) => toStoredPoint(point)!);

    // ≥ 75% fewer points
    expect(stored.length).toBeLessThan(raw.length * 0.25);

    // Every raw driving point lies within 5 m (+ rounding) of the stored route
    const drivingPath = stored.filter((point) => point.t.getTime() <= rawDocs[599].t.getTime() + 2000);
    const kx = 111_320 * Math.cos((-15.4 * Math.PI) / 180);
    const offset = (p: { lat: number; lng: number }, a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const px = (p.lng - a.lng) * kx, py = (p.lat - a.lat) * 110_574;
      const bx = (b.lng - a.lng) * kx, by = (b.lat - a.lat) * 110_574;
      const l = bx * bx + by * by;
      const t = l ? Math.max(0, Math.min(1, (px * bx + py * by) / l)) : 0;
      return Math.hypot(px - t * bx, py - t * by);
    };
    const worst = Math.max(
      ...rawDocs.slice(0, 600).map((point) =>
        Math.min(...drivingPath.slice(1).map((b, i) => offset(point, drivingPath[i], b))),
      ),
    );
    expect(worst).toBeLessThanOrEqual(6);
    if (process.env.PRINT_STATS) console.log({ raw: raw.length, stored: stored.length, worstMeters: worst.toFixed(2) });

    // Distance of the driving part within 1% (parked jitter is ignored by design)
    const drivingRaw = rawDocs.slice(0, 600);
    const drivingStored = stored.filter((point) => point.t.getTime() <= drivingRaw[599].t.getTime());
    expect(Math.abs(pathMeters(drivingStored) - pathMeters(drivingRaw))).toBeLessThan(pathMeters(drivingRaw) * 0.01);

    // The corner point is kept
    const corner = rawDocs[299];
    expect(stored.some((point) => Math.abs(point.t.getTime() - corner.t.getTime()) <= 2000)).toBe(true);

    // While parked, at least one point per minute (stop start/end accurate to a minute)
    const parked = stored.filter((point) => point.t.getTime() > drivingRaw[599].t.getTime());
    for (let i = 1; i < parked.length; i += 1) {
      expect(parked[i].t.getTime() - parked[i - 1].t.getTime()).toBeLessThanOrEqual(62_000);
    }
    expect(parked.length).toBeGreaterThanOrEqual(19);
  });

  it('drops inaccurate fixes and rounds values', () => {
    expect(toStoredPoint({ ...base, latitude: 1, longitude: 1, accuracy: 250, capturedAt: new Date() })).toBeNull();
    const doc = toStoredPoint({
      ...base,
      latitude: -15.123456789,
      longitude: 28.987654321,
      accuracy: 7.6,
      speed: 9.876,
      heading: 359.7,
      capturedAt: new Date(start),
    })!;
    expect(doc).toMatchObject({ lat: -15.12346, lng: 28.98765, acc: 8, spd: 9.9, hdg: 0 });
  });
});

describe('GPS drift and background accuracy', () => {
  it('stores background fixes up to 150 m, foreground only up to the limit', () => {
    const point = { ...base, latitude: -15.4, longitude: 28.3, accuracy: 120, capturedAt: new Date(start) };
    expect(toStoredPoint(point)).toBeNull();
    expect(toStoredPoint({ ...point, source: 'BACKGROUND' })).not.toBeNull();
  });

  it('holds the position through 100 m+ drift while standing still', () => {
    const points: RawPoint[] = [
      { ...base, latitude: -15.4, longitude: 28.3, accuracy: 12, speed: 0, capturedAt: new Date(start) },
      ...[0.001, -0.0009, 0.0011].map((offset, i) => ({
        ...base,
        latitude: -15.4 + offset,
        longitude: 28.3,
        accuracy: 140,
        speed: 0,
        source: 'BACKGROUND',
        capturedAt: new Date(start + (i + 1) * 30_000),
      })),
    ];
    const stored = filterBatch(points);
    expect(stored.every((doc) => doc.lat === -15.4 && doc.lng === 28.3)).toBe(true);
  });
});
