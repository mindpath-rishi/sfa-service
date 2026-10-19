import type { Db } from 'mongodb';

export type Reference = { id: string; name: string; countryId?: string; provinceId?: string };

const SOURCES = {
  countries: { collection: 'country_master', id: 'countryId' },
  provinces: { collection: 'province_master', id: 'provinceId' },
  markets: { collection: 'market_master', id: 'marketId' },
  categories: { collection: 'customer_category_master', id: 'customerCategoryId' },
  channels: { collection: 'channel_master', id: 'channelId' },
  outletTypes: { collection: 'outlet_type_master', id: 'outletTypeId' },
  segmentations: { collection: 'segmentation_master', id: 'segmentationId' },
} as const;

export type ReferenceKind = keyof typeof SOURCES;

/** Active master records, as the MIS upload screens used. */
export async function loadReferences<K extends ReferenceKind>(db: Db, kinds: K[]) {
  const entries = await Promise.all(
    kinds.map(async (kind) => {
      const source = SOURCES[kind];
      const rows = await db
        .collection(source.collection)
        .find(
          { status: 'ACTIVE', isDeleted: { $ne: true } },
          { projection: { _id: 0, [source.id]: 1, name: 1, countryId: 1, provinceId: 1 } },
        )
        .sort({ name: 1 })
        .toArray();
      return [
        kind,
        rows.map((row) => ({
          id: String(row[source.id]),
          name: String(row.name ?? ''),
          countryId: row.countryId ? String(row.countryId) : undefined,
          provinceId: row.provinceId ? String(row.provinceId) : undefined,
        })),
      ] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<K, Reference[]>;
}

/** Cells accept the master ID or its exact name (case-insensitive). */
export function resolveReference(value: string, items: Reference[]) {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  return items.find((item) => item.id === value) ?? items.find((item) => item.name.toLowerCase() === lower);
}

export const normalizeOutletId = (value: string) => value.trim().replace(/^FO_(?:TOKEN|TKON)_/i, '');
