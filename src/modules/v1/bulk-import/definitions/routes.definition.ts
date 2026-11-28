import * as ExcelJS from 'exceljs';
import { CreateRouteDto } from '../../route/dto/create-route.dto';
import { RouteService } from '../../route/route.service';
import type { ImportDefinition, ImportUnit } from '../bulk-import.types';
import {
  addInstructions,
  requireHeaders,
  styleHeader,
  toBuffer,
} from '../sheet.utils';
import {
  loadReferences,
  normalizeOutletId,
  resolveReference,
  type Reference,
} from './references';
import { outcomesFrom } from './outcomes';

const HEADERS = [
  'Route Name',
  'Country',
  'Province',
  'Market',
  'Customer Category',
  'Status',
  'Outlet ID',
  'Sequence',
];
const REQUIRED = ['Route Name', 'Province'];
const KINDS = ['countries', 'provinces', 'markets', 'categories'] as const;

type Draft = ImportUnit<Record<string, unknown>> & {
  outlets: { customerId: string; sequence?: number; order: number }[];
};

/**
 * Bulk routes: one row per route outlet, grouped by Route Name. The route's
 * result is written on every row of that route.
 */
export const routesDefinition = (
  routes: RouteService,
): ImportDefinition<Record<string, unknown>> => ({
  type: 'routes',
  label: 'Routes',
  description:
    'Create or update routes with their outlets. Rows with the same Route Name form one route.',
  requiredHeaders: REQUIRED,
  optionalHeaders: HEADERS.filter((header) => !REQUIRED.includes(header)),
  limit: 500,
  batchSize: 50,
  itemDto: CreateRouteDto,

  async parse(sheet, { db }) {
    requireHeaders(sheet, REQUIRED);
    const masters = await loadReferences(db, [...KINDS]);
    const byName = new Map<string, Draft>();
    const outletOwner = new Map<string, string>();
    const orphans: ImportUnit<Record<string, unknown>>[] = [];

    for (const row of sheet.rows) {
      const name = row.get('Route Name');
      const customerId = normalizeOutletId(row.get('Outlet ID'));
      if (!name) {
        orphans.push({
          rows: [row.rowNumber],
          errors: ['Route Name is required'],
        });
        continue;
      }
      const key = name.toLowerCase();
      let route = byName.get(key);
      if (!route) {
        const errors: string[] = [];
        const provinceText = row.get('Province');
        const province = resolveReference(provinceText, masters.provinces);
        if (!provinceText) errors.push('Province is required');
        else if (!province) errors.push(`Province not found: ${provinceText}`);
        const countryText = row.get('Country');
        const country = countryText
          ? resolveReference(countryText, masters.countries)
          : masters.countries.find((item) => item.id === province?.countryId);
        if (countryText && !country)
          errors.push(`Country not found: ${countryText}`);
        if (country && province?.countryId && province.countryId !== country.id)
          errors.push(`Province ${province.name} is not in ${country.name}`);
        const marketText = row.get('Market');
        const market = resolveReference(marketText, masters.markets);
        if (marketText && !market)
          errors.push(`Market not found: ${marketText}`);
        if (
          market &&
          province &&
          market.provinceId &&
          market.provinceId !== province.id
        )
          errors.push(`Market ${market.name} is not in ${province.name}`);
        const categoryText = row.get('Customer Category');
        const category = resolveReference(categoryText, masters.categories);
        if (categoryText && !category)
          errors.push(`Customer Category not found: ${categoryText}`);
        const status = (row.get('Status') || 'ACTIVE').toUpperCase();
        if (!['ACTIVE', 'INACTIVE'].includes(status))
          errors.push('Status must be ACTIVE or INACTIVE');

        route = {
          rows: [],
          errors,
          outlets: [],
          payload: {
            name,
            countryId: country?.id,
            provinceId: province?.id,
            marketId: market?.id,
            customerCategoryId: category?.id,
            status,
          },
        };
        byName.set(key, route);
      }
      route.rows.push(row.rowNumber);
      if (!customerId) continue;

      const owner = outletOwner.get(customerId);
      if (owner) {
        route.errors.push(
          owner.toLowerCase() === key
            ? `Row ${row.rowNumber}: duplicate outlet ${customerId}`
            : `Row ${row.rowNumber}: outlet ${customerId} is also listed for route ${owner}`,
        );
        continue;
      }
      outletOwner.set(customerId, name);

      const sequenceText = row.get('Sequence');
      const sequence = sequenceText ? Number(sequenceText) : undefined;
      if (sequenceText && (!Number.isInteger(sequence) || sequence! < 1)) {
        route.errors.push(
          `Row ${row.rowNumber}: Sequence must be a whole number of 1 or more`,
        );
        continue;
      }
      route.outlets.push({ customerId, sequence, order: route.outlets.length });
    }

    const units = [...byName.values()].map(({ outlets, ...route }) => {
      const associatedCustomers = outlets
        .sort(
          (a, b) =>
            (a.sequence ?? Number.MAX_SAFE_INTEGER) -
              (b.sequence ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
        )
        .map((outlet, index) => ({
          customerId: outlet.customerId,
          sequence: index + 1,
        }));
      return {
        ...route,
        payload: {
          ...route.payload,
          associatedCustomers,
          outletCount: associatedCustomers.length,
        },
      };
    });
    return [...units, ...orphans];
  },

  async process(payloads) {
    const response = await routes.bulkUpload({ routes: payloads } as any);
    return outcomesFrom(
      response,
      payloads.length,
      (result) =>
        `${result.action === 'UPDATED' ? 'Updated' : 'Created'} route ${result.routeId ?? ''} with ${result.outletCount ?? 0} outlet(s)`,
    );
  },

  async template({ db }) {
    const masters = await loadReferences(db, [...KINDS]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Routes');
    sheet.addRow(HEADERS);
    const province = masters.provinces[0];
    const country =
      masters.countries.find((item) => item.id === province?.countryId) ??
      masters.countries[0];
    const market =
      masters.markets.find((item) => item.provinceId === province?.id) ??
      masters.markets[0];
    const geography = [
      country?.name ?? 'Country name or ID',
      province?.name ?? 'Province name or ID',
      market?.name ?? '',
      masters.categories[0]?.name ?? '',
    ];
    sheet.addRow(['Sample Route 1', ...geography, 'ACTIVE', 'OUTLET-ID-1', 1]);
    sheet.addRow(['Sample Route 1', ...geography, 'ACTIVE', 'OUTLET-ID-2', 2]);
    sheet.addRow(['Sample Route 2', ...geography, 'ACTIVE', 'OUTLET-ID-3', 1]);
    styleHeader(sheet, [26, 18, 20, 20, 22, 12, 18, 12]);

    const reference = workbook.addWorksheet('Reference');
    reference.addRow(['Type', 'ID', 'Name', 'Parent ID']);
    const add = (
      type: string,
      items: Reference[],
      parent?: (item: Reference) => string | undefined,
    ) =>
      items.forEach((item) =>
        reference.addRow([type, item.id, item.name, parent?.(item) ?? '']),
      );
    add('Country', masters.countries);
    add('Province', masters.provinces, (item) => item.countryId);
    add('Market', masters.markets, (item) => item.provinceId);
    add('Customer Category', masters.categories);
    styleHeader(reference, [20, 22, 32, 20]);

    addInstructions(workbook, [
      'One row per outlet. Repeat the route columns on every row of the same route; rows with the same Route Name form one route.',
      'The FO_TOKEN_ prefix is automatically removed from Outlet IDs.',
      'An existing route with the same name is updated and its outlet list is replaced.',
      'Country / Province / Market / Customer Category accept the ID or the exact name (see Reference sheet).',
      "Outlets must belong to the route's Province and must not be mapped to another route.",
      'Sequence is the visit order; when blank, the row order is used. Leave Outlet ID blank to create a route without outlets.',
      'Status is ACTIVE or INACTIVE (default ACTIVE). Maximum 500 routes per file.',
      "The result file shows each route's result on all of its rows.",
    ]);
    return {
      buffer: await toBuffer(workbook),
      fileName: 'bulk-route-template.xlsx',
    };
  },
});
