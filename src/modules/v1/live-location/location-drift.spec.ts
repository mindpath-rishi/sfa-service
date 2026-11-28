import { isAccuracyDrift, isMoreAccurateFix } from './location-drift';
import { collapseStays } from './road-snap.service';

describe('isMoreAccurateFix', () => {
  it('needs a clear improvement (≥ 5 m and ≥ 30 %)', () => {
    expect(isMoreAccurateFix(120, 8)).toBe(true);
    expect(isMoreAccurateFix(120, 100)).toBe(false);
    expect(isMoreAccurateFix(10, 6)).toBe(false); // only 4 m better
    expect(isMoreAccurateFix(null, 8)).toBe(false);
    expect(isMoreAccurateFix(50, undefined)).toBe(false);
  });
});

describe('isAccuracyDrift', () => {
  it('holds a jump inside the accuracy radius', () => {
    expect(isAccuracyDrift(120, { accuracy: 110, speed: 0 }, 100)).toBe(true);
  });

  it('does not hold when the new fix is much more accurate (refines the position)', () => {
    expect(isAccuracyDrift(120, { accuracy: 8, speed: 0 }, 100)).toBe(false);
  });
});

describe('collapseStays', () => {
  const MIN = 60_000;

  it('collapses a 2+ minute stay to its last fix and marks it', () => {
    const coords: [number, number][] = [
      [10, 20],
      [10.0001, 20], // ~11 m
      [10.0002, 20], // ~22 m
      [10.01, 20], // ~1.1 km: moving on
    ];
    const { points, stays } = collapseStays(coords, [
      0,
      1 * MIN,
      3 * MIN,
      5 * MIN,
    ]);
    expect(points).toEqual([coords[2], coords[3]]);
    expect(stays.has(coords[2])).toBe(true);
    expect(stays.has(coords[3])).toBe(false);
  });

  it('does not treat a short pause or missing times as a stay', () => {
    const coords: [number, number][] = [
      [10, 20],
      [10.0001, 20],
      [10.01, 20],
    ];
    expect(collapseStays(coords, [0, 30_000, 60_000]).stays.size).toBe(0);
    expect(collapseStays(coords).stays.size).toBe(0);
  });
});
