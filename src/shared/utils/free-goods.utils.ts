/**
 * Free goods on a sale
 * --------------------
 * Free quantities come from line schemes (per sale item) and group schemes
 * (sale header). They carry no price but leave the van, so they are deducted
 * from van stock like sold goods. The app mirrors this in
 * SFA/src/shared/utils/free-goods.utils.ts for offline sales.
 */
import type { SaleGroupScheme } from './group-scheme.utils';
import { toLineSchemes } from './sale-line-scheme.utils';

export type FreeGood = {
  productId: string;
  productName?: string;
  qty: number;
  unit: 'CASE' | 'PIECE';
};

/** Free goods per product and unit, summed across all schemes on the sale. */
export function collectFreeGoods(
  items: unknown[],
  groupSchemes: SaleGroupScheme[] = [],
): FreeGood[] {
  const goods = new Map<string, FreeGood>();
  const add = (
    productId: string | undefined,
    productName: string | undefined,
    qty: number,
    unit: 'CASE' | 'PIECE' | undefined,
  ) => {
    const amount = Math.max(Number(qty) || 0, 0);
    if (!productId || amount <= 0) return;
    const resolvedUnit = unit === 'PIECE' ? 'PIECE' : 'CASE';
    const key = `${productId}::${resolvedUnit}`;
    const existing = goods.get(key);
    if (existing) existing.qty += amount;
    else
      goods.set(key, {
        productId,
        productName,
        qty: amount,
        unit: resolvedUnit,
      });
  };

  for (const raw of items) {
    const item = (raw ?? {}) as Record<string, any>;
    for (const scheme of toLineSchemes(item, 0)) {
      // Without a separate free product the scheme gives the same product.
      add(
        scheme.freeProductId || item.productId,
        scheme.freeProductName ||
          (scheme.freeProductId ? undefined : item.productName),
        scheme.freeQty,
        scheme.freeUnit,
      );
    }
  }

  for (const scheme of groupSchemes) {
    if (scheme.freeProductId) {
      add(
        scheme.freeProductId,
        scheme.freeProductName,
        scheme.freeQty,
        scheme.freeUnit,
      );
    }
    // Historical group schemes split free goods over the qualifying lines.
    for (const line of scheme.lines ?? []) {
      add(line.productId, line.productName, line.freeQty, scheme.freeUnit);
    }
  }

  return Array.from(goods.values());
}

/** Free quantity in pieces, given the free product's pieces per case. */
export const freeGoodPieces = (good: FreeGood, unitQtyInCase: number) =>
  good.unit === 'PIECE'
    ? good.qty
    : good.qty * Math.max(Number(unitQtyInCase) || 1, 1);
