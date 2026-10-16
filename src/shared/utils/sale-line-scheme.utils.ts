/**
 * Line scheme snapshots on a sale item
 * ------------------------------------
 * Several line schemes can apply to one sale item (discounts add up on the
 * line's gross value, free goods are all given). The app sends them as
 * `appliedSchemes`; older apps send a single scheme in the `scheme*` fields.
 * Both the online sale API and offline sync normalise them here.
 */
import type { SaleLineScheme } from 'src/core/database/mongo/schema/sale-item.schema';

const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const toText = (value: unknown) => String(value ?? '').trim();
const toUnit = (value: unknown): 'CASE' | 'PIECE' | undefined => {
  const unit = toText(value);
  return unit === 'CASE' || unit === 'PIECE' ? unit : undefined;
};
const toFixed4 = (value: number) => Number(value.toFixed(4));
const optionalNumber = (value: unknown) =>
  value === undefined || value === null || value === ''
    ? undefined
    : toNumber(value);

const toLineScheme = (raw: Record<string, unknown>): SaleLineScheme | null => {
  const schemeId = toText(raw.schemeId);
  const schemeName = toText(raw.schemeName);
  const schemeType = toText(raw.schemeType);
  if (!schemeId || !schemeName || !schemeType) return null;

  return {
    schemeId,
    schemeName,
    schemeType,
    minimumQuantity: Math.max(toNumber(raw.minimumQuantity), 0),
    minimumQuantityUnit: toUnit(raw.minimumQuantityUnit),
    discountPercent: optionalNumber(raw.discountPercent),
    discountValue: optionalNumber(raw.discountValue),
    buyQty: optionalNumber(raw.buyQty),
    buyUnit: toUnit(raw.buyUnit),
    discountAmount: Math.max(toNumber(raw.discountAmount), 0),
    freeQty: Math.max(toNumber(raw.freeQty), 0),
    freeUnit: toUnit(raw.freeUnit),
    freeProductId: toText(raw.freeProductId) || undefined,
    freeProductName: toText(raw.freeProductName) || undefined,
  };
};

/**
 * Schemes applied to a sale item. `lineDiscount` is the item's discount after
 * the server caps it at the gross value; per-scheme discounts are scaled down
 * to it when their sum is higher, so header totals match the lines.
 */
export function toLineSchemes(
  item: unknown,
  lineDiscount: number,
): SaleLineScheme[] {
  const source = (item ?? {}) as Record<string, unknown>;
  const applied = Array.isArray(source.appliedSchemes)
    ? source.appliedSchemes
        .map((raw) => toLineScheme((raw ?? {}) as Record<string, unknown>))
        .filter((scheme): scheme is SaleLineScheme => Boolean(scheme))
    : [];

  const schemes = applied.length
    ? applied
    : [
        toLineScheme({
          schemeId: source.schemeId,
          schemeName: source.schemeName,
          schemeType: source.schemeType,
          minimumQuantity: source.schemeMinimumQuantity,
          minimumQuantityUnit: source.schemeMinimumQuantityUnit,
          discountPercent: source.schemeDiscountPercent,
          discountValue: source.schemeDiscountValue,
          buyQty: source.schemeBuyQty,
          buyUnit: source.schemeBuyUnit,
          discountAmount: lineDiscount,
          freeQty: source.schemeFreeQty,
          freeUnit: source.schemeFreeUnit,
          freeProductId: source.schemeFreeProductId,
          freeProductName: source.schemeFreeProductName,
        }),
      ].filter((scheme): scheme is SaleLineScheme => Boolean(scheme));

  const total = schemes.reduce((sum, scheme) => sum + scheme.discountAmount, 0);
  const scale = total > lineDiscount && total > 0 ? lineDiscount / total : 1;

  return schemes.map((scheme) => ({
    ...scheme,
    discountAmount: toFixed4(scheme.discountAmount * scale),
  }));
}
