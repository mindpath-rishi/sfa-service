import { LiveBroadcastFilter, type LivePoint } from './live-broadcast.filter';

const T0 = new Date('2026-11-24T08:00:00Z').getTime();
// ~111 m per 0.001° latitude
const point = (
  seconds: number,
  latOffset = 0,
  extra: Partial<LivePoint> = {},
): LivePoint => ({
  employeeId: 'E1',
  workSessionId: 'S1',
  latitude: -15.4 + latOffset,
  longitude: 28.3,
  accuracy: 10,
  capturedAt: new Date(T0 + seconds * 1000),
  ...extra,
});

describe('LiveBroadcastFilter', () => {
  const now = T0 + 3600_000;

  it('accepts a normal moving track', () => {
    const filter = new LiveBroadcastFilter();
    expect(filter.check(point(0), 50, now)).toBeNull();
    expect(filter.check(point(10, 0.001), 50, now)).toBeNull(); // 111 m in 10 s ≈ 40 km/h
  });

  it('rejects fixes worse than the accuracy limit', () => {
    const filter = new LiveBroadcastFilter();
    expect(filter.check(point(0, 0, { accuracy: 800 }), 50, now)).toBe(
      'accuracy',
    );
    expect(filter.check(point(0, 0, { accuracy: null }), 50, now)).toBeNull();
  });

  it('rejects older or duplicate points (late offline batch)', () => {
    const filter = new LiveBroadcastFilter();
    filter.check(point(60), 50, now);
    expect(filter.check(point(30), 50, now)).toBe('out-of-order');
    expect(filter.check(point(60), 50, now)).toBe('out-of-order');
  });

  it('rejects points from the future', () => {
    const filter = new LiveBroadcastFilter();
    expect(filter.check(point(0), 50, T0 - 120_000)).toBe('future');
  });

  it('rejects an impossible jump, but trusts it once confirmed repeatedly', () => {
    const filter = new LiveBroadcastFilter();
    filter.check(point(0), 50, now);
    // 5.5 km in 5 s
    expect(filter.check(point(5, 0.05), 50, now)).toBe('jump');
    expect(filter.check(point(10, 0.05), 50, now)).toBe('jump');
    expect(filter.check(point(15, 0.05), 50, now)).toBeNull();
    expect(filter.check(point(20, 0.0501), 50, now)).toBeNull();
  });

  it('accepts a big move after a long gap and resets on a new work session', () => {
    const filter = new LiveBroadcastFilter();
    filter.check(point(0), 50, now);
    expect(filter.check(point(600, 0.05), 50, now)).toBeNull(); // 10 min later
    expect(
      filter.check(point(10, 0, { workSessionId: 'S2' }), 50, now),
    ).toBeNull();
  });

  it('holds the marker when a low-accuracy fix drifts 100 m+ while standing still', () => {
    const filter = new LiveBroadcastFilter();
    filter.check(point(0, 0, { accuracy: 12, speed: 0 }), 50, now);
    const drift = point(30, 0.001, {
      accuracy: 140,
      speed: 0,
      source: 'BACKGROUND',
    });
    expect(filter.check(drift, 50, now)).toBeNull();
    expect(drift.latitude).toBe(-15.4);
  });

  it('moves the marker for a jump inside the accuracy radius at driving speed', () => {
    const filter = new LiveBroadcastFilter();
    filter.check(point(0, 0, { accuracy: 12 }), 50, now);
    const moving = point(10, 0.001, {
      accuracy: 140,
      speed: 11,
      source: 'BACKGROUND',
    });
    expect(filter.check(moving, 50, now)).toBeNull();
    expect(moving.latitude).toBeCloseTo(-15.399);
  });

  it('allows 150 m accuracy only for background points', () => {
    const filter = new LiveBroadcastFilter();
    expect(filter.check(point(0, 0, { accuracy: 120 }), 50, now)).toBe(
      'accuracy',
    );
    expect(
      filter.check(
        point(0, 0, { accuracy: 120, source: 'BACKGROUND' }),
        50,
        now,
      ),
    ).toBeNull();
    expect(
      filter.check(
        point(5, 0, { accuracy: 160, source: 'BACKGROUND' }),
        50,
        now,
      ),
    ).toBe('accuracy');
    expect(
      filter.check(
        point(10, 0, { accuracy: 140, source: 'NATIVE_BACKGROUND' }),
        50,
        now,
      ),
    ).toBeNull();
  });
});
