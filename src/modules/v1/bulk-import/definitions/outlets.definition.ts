import * as ExcelJS from 'exceljs';
import { CustomerService } from '../../customer/customer.service';
import { BulkUploadCustomerItemDto } from '../../customer/dto/bulk-upload-customer.dto';
import type { ImportDefinition, ImportUnit } from '../bulk-import.types';
import { addInstructions, requireHeaders, styleHeader, toBuffer } from '../sheet.utils';
import { loadReferences, normalizeOutletId, resolveReference, type Reference } from './references';
import { outcomesFrom } from './outcomes';

const LIMIT = 100_000;
const STATUSES = ['ACTIVE', 'INACTIVE', 'VERIFICATION_PENDING', 'REJECTED'];
const HEADERS = [
  'Outlet ID', 'Outlet Name', 'Owner Name', 'Phone Number', 'Address Line 1', 'Address Line 2',
  'Customer Category', 'Channel', 'Customer Type', 'Country', 'Province', 'Market', 'Segmentation',
  'Credit Limit', 'Credit Days', 'Latitude', 'Longitude', 'Status',
];
const REQUIRED = ['Outlet Name', 'Owner Name', 'Address Line 1', 'Customer Category', 'Channel', 'Customer Type', 'Province', 'Market', 'Segmentation'];
const KINDS = ['countries', 'provinces', 'markets', 'categories', 'channels', 'outletTypes', 'segmentations'] as const;

const number = (value: string, label: string, errors: string[], range?: [number, number]) => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (range && (parsed < range[0] || parsed > range[1]))) {
    errors.push(range ? `${label} must be a number between ${range[0]} and ${range[1]}` : `${label} must be a number`);
    return undefined;
  }
  return parsed;
};

/** Bulk outlet creation (same rules as the former MIS upload). */
export const outletsDefinition = (customers: CustomerService): ImportDefinition<Record<string, unknown>> => ({
  type: 'outlets',
  label: 'Outlets',
  description: 'Create outlets. One row per outlet; existing outlets are edited from the outlet list.',
  requiredHeaders: REQUIRED,
  optionalHeaders: HEADERS.filter((header) => !REQUIRED.includes(header)),
  limit: LIMIT,
  batchSize: 200,
  itemDto: BulkUploadCustomerItemDto,

  async parse(sheet, { db }) {
    requireHeaders(sheet, REQUIRED);
    const masters = await loadReferences(db, [...KINDS]);
    const seenPhones = new Map<string, number>();

    return sheet.rows.map((row): ImportUnit<Record<string, unknown>> => {
      const errors: string[] = [];
      const text = (header: string) => {
        const value = row.get(header);
        if (!value && REQUIRED.includes(header)) errors.push(`${header} is required`);
        return value;
      };
      const reference = (header: string, items: Reference[]) => {
        const value = text(header);
        const item = resolveReference(value, items);
        if (value && !item) errors.push(`${header} not found: ${value}`);
        return item;
      };

      const rawId = row.get('Outlet ID') || row.get('OutletId') || row.get('Customer ID') || row.get('CustomerId');
      const outletId = rawId ? normalizeOutletId(rawId) || undefined : undefined;
      const name = text('Outlet Name');
      const ownerName = text('Owner Name');
      const phoneNumber = row.get('Phone Number');
      const line1 = text('Address Line 1');
      const line2 = row.get('Address Line 2');
      const category = reference('Customer Category', masters.categories);
      const channel = reference('Channel', masters.channels);
      const outletType = reference('Customer Type', masters.outletTypes);
      const province = reference('Province', masters.provinces);
      const market = reference('Market', masters.markets);
      const segmentation = reference('Segmentation', masters.segmentations);
      const status = (row.get('Status') || 'VERIFICATION_PENDING').toUpperCase();
      if (!STATUSES.includes(status)) errors.push(`Status must be one of ${STATUSES.join(', ')}`);

      const countryText = row.get('Country');
      const country = countryText
        ? resolveReference(countryText, masters.countries)
        : masters.countries.find((item) => item.id === province?.countryId);
      if (countryText && !country) errors.push(`Country not found: ${countryText}`);
      else if (!country && province) errors.push(`Country is required (province ${province.name} has no country)`);
      if (country && province?.countryId && province.countryId !== country.id) errors.push(`Province ${province.name} is not in ${country.name}`);
      if (market && province && market.provinceId && market.provinceId !== province.id) errors.push(`Market ${market.name} is not in ${province.name}`);

      if (line1 && (line1.length < 3 || line1.length > 150)) errors.push('Address Line 1 must be 3 to 150 characters');
      if (line2.length > 150) errors.push('Address Line 2 must be at most 150 characters');

      const creditLimit = number(row.get('Credit Limit'), 'Credit Limit', errors) ?? 0;
      const creditDays = number(row.get('Credit Days'), 'Credit Days', errors) ?? 0;
      const lat = number(row.get('Latitude'), 'Latitude', errors, [-90, 90]);
      const lng = number(row.get('Longitude'), 'Longitude', errors, [-180, 180]);
      if (Boolean(row.get('Latitude')) !== Boolean(row.get('Longitude'))) errors.push('Latitude and Longitude must be filled together');

      if (phoneNumber) {
        const first = seenPhones.get(phoneNumber);
        if (first) errors.push(`Duplicate Phone Number ${phoneNumber} (also in row ${first})`);
        else seenPhones.set(phoneNumber, row.rowNumber);
      }

      return {
        rows: [row.rowNumber],
        errors,
        payload: {
          outletId,
          status: STATUSES.includes(status) ? status : 'VERIFICATION_PENDING',
          name,
          ownerName,
          phoneNumber: phoneNumber || undefined,
          address: { line1, line2: line2 || undefined },
          customerCategoryId: category?.id ?? '',
          channelId: channel?.id ?? '',
          customerTypeId: outletType?.id ?? '',
          countryId: country?.id ?? '',
          provinceId: province?.id ?? '',
          marketId: market?.id ?? '',
          segmentation: segmentation?.id ?? '',
          creditLimit,
          creditDays,
          geoTag: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
        },
      };
    });
  },

  async process(payloads) {
    const response = await customers.bulkUpload({ customers: payloads } as any);
    return outcomesFrom(response, payloads.length, (result) =>
      result.action === 'CREATED' ? `Created outlet ${result.customerId ?? ''}`.trim() : result.error,
    );
  },

  async template({ db }) {
    const masters = await loadReferences(db, [...KINDS]);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Outlets');
    sheet.addRow(HEADERS);
    const province = masters.provinces[0];
    const country = masters.countries.find((item) => item.id === province?.countryId) ?? masters.countries[0];
    const market = masters.markets.find((item) => item.provinceId === province?.id) ?? masters.markets[0];
    const classification = [
      masters.categories[0]?.name ?? 'Customer category name or ID',
      masters.channels[0]?.name ?? 'Channel name or ID',
      masters.outletTypes[0]?.name ?? 'Customer type name or ID',
      country?.name ?? 'Country name or ID',
      province?.name ?? 'Province name or ID',
      market?.name ?? 'Market name or ID',
      masters.segmentations[0]?.name ?? 'Segmentation name or ID',
    ];
    sheet.addRow(['', 'Sample Outlet 1', 'Owner One', '9000000001', 'Shop 1, Main Road', 'Near Bus Stand', ...classification, 0, 0, '', '', 'VERIFICATION_PENDING']);
    sheet.addRow(['', 'Sample Outlet 2', 'Owner Two', '9000000002', 'Shop 2, Market Lane', '', ...classification, 0, 0, '', '', 'ACTIVE']);
    styleHeader(sheet, [20, 28, 22, 16, 30, 24, 22, 18, 20, 16, 18, 18, 12, 12, 12, 12, 12, 24]);

    const reference = workbook.addWorksheet('Reference');
    reference.addRow(['Type', 'ID', 'Name', 'Parent ID']);
    const add = (type: string, items: Reference[], parent?: (item: Reference) => string | undefined) =>
      items.forEach((item) => reference.addRow([type, item.id, item.name, parent?.(item) ?? '']));
    add('Customer Category', masters.categories);
    add('Channel', masters.channels);
    add('Customer Type', masters.outletTypes);
    add('Country', masters.countries);
    add('Province', masters.provinces, (item) => item.countryId);
    add('Market', masters.markets, (item) => item.provinceId);
    add('Segmentation', masters.segmentations);
    styleHeader(reference, [20, 22, 32, 20]);

    addInstructions(workbook, [
      'One row per new outlet. Bulk upload only creates outlets; edit existing outlets from the outlet list.',
      'Outlet ID is optional. If provided it is used as the outlet ID; if blank, the system generates one.',
      'The FO_TOKEN_ prefix is automatically removed from an Outlet ID.',
      `Status is optional and defaults to VERIFICATION_PENDING. Allowed values: ${STATUSES.join(', ')}.`,
      'An ACTIVE outlet is automatically verified by the uploader.',
      'Customer Category / Channel / Customer Type / Country / Province / Market / Segmentation accept the ID or the exact name (see Reference sheet).',
      'Country can be left blank; it is taken from the Province. Market must belong to the Province, and the Province to the Country.',
      'Phone Number is optional; when filled it must be unique across outlets.',
      'Credit Limit and Credit Days default to 0. Latitude and Longitude are optional but must be filled together.',
      `Maximum ${LIMIT.toLocaleString()} outlets per file. The result file lists every row with its Status and Remark.`,
    ]);
    return { buffer: await toBuffer(workbook), fileName: 'bulk-outlet-template.xlsx' };
  },
});
