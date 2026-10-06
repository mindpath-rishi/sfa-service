/**
 * Group scheme snapshots on a sale
 * --------------------------------
 * Group schemes (GROUP_FREE_QTY / GROUP_FREE_PERCENT) are evaluated by the
 * app across all lines of a cart and give free goods. They are stored on the
 * sale header as `groupSchemes`; this keeps only known fields and clamps
 * quantities so both the online sale API and offline sync store the same shape.
 */

export type SaleGroupSchemeLine = {
  productId: string;
  productName?: string;
  freeQty: number;
};

export type SaleGroupScheme = {
  schemeId: string;
  schemeName: string;
  schemeType: string;
  groupMinCases: number;
  qualifyingCases: number;
  multiples: number;
  freePercent?: number;
  freeUnit: 'CASE' | 'PIECE';
  freeQty: number;
  freeProductId?: string;
  freeProductName?: string;
  lines: SaleGroupSchemeLine[];
};

const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const toCount = (value: unknown) => Math.max(Math.floor(toNumber(value)), 0);
const toText = (value: unknown) => String(value ?? '').trim();

export function sanitizeGroupSchemes(value: unknown): SaleGroupScheme[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((raw): SaleGroupScheme | null => {
      const scheme = (raw ?? {}) as Record<string, unknown>;
      const schemeId = toText(scheme.schemeId);
      const schemeName = toText(scheme.schemeName);
      const schemeType = toText(scheme.schemeType);
      if (!schemeId || !schemeName || !schemeType) return null;

      const lines = (Array.isArray(scheme.lines) ? scheme.lines : [])
        .map((line): SaleGroupSchemeLine | null => {
          const item = (line ?? {}) as Record<string, unknown>;
          const productId = toText(item.productId);
          if (!productId) return null;
          return {
            productId,
            productName: toText(item.productName) || undefined,
            freeQty: toCount(item.freeQty),
          };
        })
        .filter((line): line is SaleGroupSchemeLine => Boolean(line));

      const freeQty = toCount(scheme.freeQty);
      if (!freeQty && !lines.some((line) => line.freeQty > 0)) return null;

      return {
        schemeId,
        schemeName,
        schemeType,
        groupMinCases: Math.max(toNumber(scheme.groupMinCases), 0),
        qualifyingCases: Number(
          Math.max(toNumber(scheme.qualifyingCases), 0).toFixed(4),
        ),
        multiples: toCount(scheme.multiples),
        freePercent:
          scheme.freePercent === undefined
            ? undefined
            : Math.min(Math.max(toNumber(scheme.freePercent), 0), 100),
        freeUnit: toText(scheme.freeUnit) === 'PIECE' ? 'PIECE' : 'CASE',
        freeQty,
        freeProductId: toText(scheme.freeProductId) || undefined,
        freeProductName: toText(scheme.freeProductName) || undefined,
        lines,
      };
    })
    .filter((scheme): scheme is SaleGroupScheme => Boolean(scheme));
}
