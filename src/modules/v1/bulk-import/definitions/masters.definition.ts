import { BadRequestException } from '@nestjs/common';
import { MasterBulkService } from '../../master-bulk/master-bulk.service';
import type { ImportDefinition } from '../bulk-import.types';
import { requireHeaders } from '../sheet.utils';
import { outcomesFrom } from './outcomes';

/** Which reference columns each master entity takes (as in MIS). */
const ENTITIES: Record<string, { country?: boolean; province?: boolean; market?: boolean; role?: boolean; productCategory?: boolean }> = {
  country: {},
  province: { country: true },
  position: { country: true, province: true, market: true, role: true },
  'customer-category': {},
  'product-category': { productCategory: true },
  channel: {},
  segmentation: {},
  'outlet-type': {},
  market: { province: true },
};

const entityOf = (options: Record<string, string | undefined>) => {
  const entity = options.entity ?? '';
  if (!ENTITIES[entity]) throw new BadRequestException(`entity must be one of ${Object.keys(ENTITIES).join(', ')}`);
  return entity;
};

/**
 * Reference masters (countries, provinces, markets, positions, categories…).
 * Validation and reference lookup stay in MasterBulkService.
 */
export const mastersDefinition = (masters: MasterBulkService): ImportDefinition<Record<string, unknown>> => ({
  type: 'masters',
  label: 'Reference masters',
  description: 'Create reference master records for the chosen entity.',
  requiredHeaders: ['name'],
  optionalHeaders: ['country', 'province', 'market', 'role', 'categoryId', 'type', 'parentCategory'],
  limit: 10_000,
  batchSize: 200,
  options: [
    { key: 'entity', label: 'Master', values: Object.keys(ENTITIES), required: true },
    { key: 'type', label: 'Product category type (template only)', values: ['PARENT', 'CHILD'], required: false },
  ],

  async parse(sheet, { options }) {
    const config = ENTITIES[entityOf(options)];
    requireHeaders(sheet, ['name']);
    return sheet.rows.map((row) => {
      const name = row.get('name');
      const pick = (id: string, label: string) => ({ [id]: row.get(id) || undefined, [label]: row.get(label) || undefined });
      const type = row.get('type').toUpperCase();
      const errors = name ? [] : ['name is required'];
      return {
        rows: [row.rowNumber],
        errors,
        payload: {
          name,
          ...(config.country ? pick('countryId', 'country') : {}),
          ...(config.province ? pick('provinceId', 'province') : {}),
          ...(config.market ? pick('marketId', 'market') : {}),
          ...(config.role ? pick('roleId', 'role') : {}),
          ...(config.productCategory
            ? {
                categoryId: row.get('categoryId') || undefined,
                type: type || undefined,
                ...(type === 'CHILD' ? pick('parentId', 'parentCategory') : {}),
              }
            : {}),
        },
      };
    });
  },

  async process(payloads, { options }) {
    const clean = payloads.map((payload) => Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)));
    return outcomesFrom(await masters.upload(entityOf(options), clean), payloads.length, (result) =>
      result.id ? `Created ${result.id}` : 'Created',
    );
  },

  async template({ options }) {
    const file = await masters.template(entityOf(options), options.type);
    return { buffer: file.buffer, fileName: file.fileName };
  },
});
