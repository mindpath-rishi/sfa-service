/**
 * Normalizes a role name into a stable, system-safe identifier.
 * Example: "Operations Manager" → "OPERATIONS_MANAGER"
 */
export function normalizeRoleName(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
