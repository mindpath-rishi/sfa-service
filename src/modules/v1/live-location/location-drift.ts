/**
 * GPS drift handling shared by storage, the live map and day routes.
 * Mirrors the mobile app (SFA/src/shared/utils/location-noise.utils.ts), so a
 * point the phone held in place is not moved again here, and older app
 * versions that still send drifting points get the same treatment.
 */

/**
 * Android delivers background points mostly as Wi-Fi / cell fixes, so they
 * get at least this accuracy limit (sources BACKGROUND and NATIVE_BACKGROUND).
 */
export const BACKGROUND_MIN_ACCURACY_LIMIT_M = 150;
/** Largest jump that can still be written off as drift. */
const MAX_DRIFT_DISTANCE_M = 200;
/** Above this reported speed (about 5 km/h) the device is really moving. */
const MOVING_SPEED_MPS = 1.4;

export const accuracyLimitFor = (
  maxAccuracyM: number,
  source?: string | null,
) =>
  // BACKGROUND (Expo task / iOS) and NATIVE_BACKGROUND (Android service)
  String(source ?? '')
    .toUpperCase()
    .includes('BACKGROUND')
    ? Math.max(maxAccuracyM, BACKGROUND_MIN_ACCURACY_LIMIT_M)
    : maxAccuracyM;

/**
 * A jump that stays inside either fix's own accuracy radius while the device
 * reports no real speed is GPS drift (a phone lying still indoors can jump
 * 100 m+), not movement.
 */
/**
 * The new fix is clearly more accurate than the held one (GPS after a Wi-Fi /
 * cell guess). It must replace the held position, or a user standing still is
 * shown wherever the first rough fix put them (often ~100 m away).
 */
export const isMoreAccurateFix = (
  previousAccuracy: number | null | undefined,
  currentAccuracy: number | null | undefined,
) => {
  const prev = Number(previousAccuracy);
  const cur = Number(currentAccuracy);
  if (!(prev > 0) || !(cur > 0)) return false;
  return cur <= prev - Math.max(5, prev * 0.3);
};

export const isAccuracyDrift = (
  previousAccuracy: number | null | undefined,
  current: { accuracy?: number | null; speed?: number | null },
  meters: number,
) => {
  if (meters > MAX_DRIFT_DISTANCE_M) return false;
  if (isMoreAccurateFix(previousAccuracy, current.accuracy)) return false;
  if (current.speed != null && current.speed > MOVING_SPEED_MPS) return false;
  const uncertainty = Math.max(
    Number(previousAccuracy ?? 0),
    Number(current.accuracy ?? 0),
  );
  return meters <= uncertainty;
};
