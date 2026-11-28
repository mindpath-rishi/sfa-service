import type { RowOutcome } from '../bulk-import.types';

type ModuleResult = Record<string, any>;

/**
 * Every module's bulk method answers `{ data: { results: [{ row, status |
 * action, message | error, ... }] } }` with row = position + 1. This turns
 * that into one outcome per payload, in payload order.
 */
export function outcomesFrom(
  response: any,
  count: number,
  remark: (result: ModuleResult) => string | undefined,
): RowOutcome[] {
  const results: ModuleResult[] =
    response?.data?.results ?? response?.results ?? [];
  const byRow = new Map<number, ModuleResult>(
    results.map((result) => [Number(result.row), result]),
  );
  return Array.from({ length: count }, (_, index) => {
    const result = byRow.get(index + 1);
    if (!result)
      return { status: 'FAILED', remark: 'No result returned for this row' };
    const status = String(
      result.status ?? result.action ?? 'FAILED',
    ).toUpperCase();
    const text =
      status === 'FAILED'
        ? (result.message ?? result.error ?? 'Failed')
        : remark(result);
    return {
      status,
      remark: String(text ?? status.charAt(0) + status.slice(1).toLowerCase()),
    };
  });
}
