import { FocusedPackBulkItemDto } from '../../product/dto/bulk-update-focused-pack.dto';
import { ProductService } from '../../product/product.service';
import type { ImportDefinition } from '../bulk-import.types';
import { requireHeaders } from '../sheet.utils';
import { outcomesFrom } from './outcomes';

const HEADERS = ['Name', 'Product Code', 'isFocusedPack'];

/** Mark products as focused pack (Y) or not (N). */
export const focusedPacksDefinition = (products: ProductService): ImportDefinition<Record<string, unknown>> => ({
  type: 'focused-packs',
  label: 'Focused packs',
  description: 'Set isFocusedPack to Y or N for products, matched by Product Code.',
  requiredHeaders: HEADERS,
  optionalHeaders: [],
  limit: 50_000,
  batchSize: 500,
  itemDto: FocusedPackBulkItemDto,

  async parse(sheet) {
    requireHeaders(sheet, HEADERS);
    const seen = new Map<string, number>();
    return sheet.rows.map((row) => {
      const errors: string[] = [];
      const name = row.get('Name');
      const productCode = row.get('Product Code');
      const isFocusedPack = row.get('isFocusedPack').toUpperCase();
      if (!name) errors.push('Name is required');
      if (!productCode) errors.push('Product Code is required');
      if (isFocusedPack !== 'Y' && isFocusedPack !== 'N') errors.push('isFocusedPack must be Y or N');
      if (productCode) {
        const first = seen.get(productCode);
        if (first) errors.push(`Product Code is duplicated (also in row ${first})`);
        else seen.set(productCode, row.rowNumber);
      }
      return { rows: [row.rowNumber], errors, payload: { name, productCode, isFocusedPack } };
    });
  },

  async process(payloads) {
    return outcomesFrom(await products.bulkUpdateFocusedPacks({ items: payloads } as any), payloads.length, (result) =>
      `Focused pack updated (${result.productCode ?? ''})`,
    );
  },

  async template() {
    const file = await products.getFocusedPackTemplate();
    return { buffer: Buffer.from(file.buffer), fileName: file.fileName };
  },
});
