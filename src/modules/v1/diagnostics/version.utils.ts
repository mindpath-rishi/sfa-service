/** Compares dotted numeric versions: -1 if a < b, 0 if equal, 1 if a > b. */
export function compareVersions(a?: string | null, b?: string | null): number {
  const left = String(a ?? '0').split('.').map((part) => parseInt(part, 10) || 0);
  const right = String(b ?? '0').split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True when `version` is older than `minimum` (an empty minimum never blocks). */
export const isBelow = (version: string | null | undefined, minimum?: string | null) =>
  Boolean(minimum) && compareVersions(version ?? '0', minimum) < 0;
