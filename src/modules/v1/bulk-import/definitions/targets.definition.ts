import * as ExcelJS from 'exceljs';
import type { Db } from 'mongodb';
import { CreateFocusedPackTargetDto } from '../../target/dto/create-focused-pack-target.dto';
import { CreateTargetDto } from '../../target/dto/create-target.dto';
import { TargetService } from '../../target/target.service';
import type { ImportDefinition } from '../bulk-import.types';
import { requireHeaders, styleHeader, toBuffer, type SheetRow } from '../sheet.utils';
import { outcomesFrom } from './outcomes';

const NUMBERS = ['targetCases', 'targetTonnage', 'targetValue'];

const monthRange = () => {
  const now = new Date();
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return {
    startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const activeEmployees = (db: Db) =>
  db.collection('employees')
    .find({ status: 'ACTIVE', isDeleted: { $ne: true } }, { projection: { _id: 0, employeeId: 1, name: 1 } })
    .sort({ name: 1 })
    .toArray();

/** Shared reading of the columns both target files have. */
function readTargetRow(row: SheetRow, headers: string[], required: string[]): { errors: string[]; payload: Record<string, unknown> } {
  const errors: string[] = [];
  const payload: Record<string, unknown> = {};
  for (const header of headers) {
    const value = row.get(header);
    if (!value) continue;
    payload[header] = NUMBERS.includes(header) ? Number(value) : value;
  }
  for (const field of required) if (!payload[field]) errors.push(`${field} is required`);
  for (const field of NUMBERS) {
    if (payload[field] !== undefined && (!Number.isFinite(payload[field] as number) || (payload[field] as number) < 0)) {
      errors.push(`${field} must be 0 or more`);
    }
  }
  const date = (value: unknown) => {
    const parsed = new Date(String(value ?? ''));
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  };
  const startDate = date(payload.startDate);
  const endDate = date(payload.endDate);
  if (payload.startDate && !startDate) errors.push('startDate is invalid');
  if (payload.endDate && !endDate) errors.push('endDate is invalid');
  if (startDate && endDate && endDate < startDate) errors.push('endDate must be on or after startDate');
  return { errors, payload: { ...payload, startDate, endDate } };
}

/** IDs that exist, so a typo becomes a FAILED row instead of a dangling target. */
async function existing(db: Db, collection: string, field: string, values: string[], extra: Record<string, unknown> = {}) {
  const unique = [...new Set(values.filter(Boolean))];
  if (!unique.length) return new Set<string>();
  const rows = await db.collection(collection).find({ [field]: { $in: unique }, isDeleted: { $ne: true }, ...extra }, { projection: { _id: 0, [field]: 1 } }).toArray();
  return new Set(rows.map((row) => String(row[field])));
}

function checkExists(units: { rows: number[]; errors: string[]; payload?: Record<string, unknown> }[], field: string, known: Set<string>, label: string) {
  for (const unit of units) {
    const value = unit.payload?.[field];
    if (value && !known.has(String(value))) unit.errors.push(`${label} ${String(value)} not found`);
  }
}

const describe = (result: Record<string, any>) => {
  const status = String(result.status ?? '').toUpperCase();
  return result.message ?? (status === 'UNCHANGED' ? 'Already up to date' : status === 'UPDATED' ? 'Target updated' : 'Target created');
};

/* ==================== CATEGORY TARGETS ==================== */

const TARGET_HEADERS = ['userId', 'userName', 'parentCategoryId', 'parentCategory', 'categoryId', 'category', 'description', 'targetCases', 'targetTonnage', 'targetValue', 'startDate', 'endDate'];
const TARGET_REQUIRED = ['userId', 'parentCategoryId', 'parentCategory', 'categoryId', 'category', 'startDate', 'endDate'];

export const targetsDefinition = (targets: TargetService): ImportDefinition<Record<string, unknown>> => ({
  type: 'targets',
  label: 'Category targets',
  description: 'Create or update monthly targets per user and child category.',
  requiredHeaders: TARGET_REQUIRED,
  optionalHeaders: TARGET_HEADERS.filter((header) => !TARGET_REQUIRED.includes(header)),
  limit: 100_000,
  batchSize: 500,
  itemDto: CreateTargetDto,

  async parse(sheet, { db }) {
    requireHeaders(sheet, TARGET_REQUIRED);
    const units = sheet.rows.map((row) => ({ rows: [row.rowNumber], ...readTargetRow(row, TARGET_HEADERS, TARGET_REQUIRED) }));
    const payloads = units.map((unit) => unit.payload);
    const [users, categories] = await Promise.all([
      existing(db, 'employees', 'employeeId', payloads.map((p) => String(p.userId ?? ''))),
      existing(db, 'productcategories', 'categoryId', payloads.flatMap((p) => [String(p.categoryId ?? ''), String(p.parentCategoryId ?? '')])),
    ]);
    checkExists(units, 'userId', users, 'User');
    checkExists(units, 'categoryId', categories, 'Category');
    checkExists(units, 'parentCategoryId', categories, 'Parent category');
    return units;
  },

  async process(payloads) {
    return outcomesFrom(await targets.bulkUpload({ items: payloads } as any), payloads.length, describe);
  },

  async template({ db }) {
    const [employees, categories] = await Promise.all([
      activeEmployees(db),
      db.collection('productcategories')
        .find({ status: 'ACTIVE', isDeleted: { $ne: true } }, { projection: { _id: 0, categoryId: 1, name: 1, type: 1, parentId: 1 } })
        .sort({ name: 1 })
        .toArray(),
    ]);
    const parentName = new Map(categories.filter((c) => c.type === 'PARENT').map((c) => [c.categoryId, c.name]));
    const children = categories.filter((c) => c.type === 'CHILD' && c.parentId);
    const { startDate, endDate } = monthRange();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Targets');
    sheet.addRow(TARGET_HEADERS);
    for (const employee of employees) {
      for (const category of children) {
        sheet.addRow([employee.employeeId, employee.name ?? '', category.parentId, parentName.get(category.parentId) ?? category.parentId, category.categoryId, category.name, 'Monthly target', 0, 0, 0, startDate, endDate]);
      }
    }
    styleHeader(sheet, TARGET_HEADERS.map(() => 18));
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    return { buffer: await toBuffer(workbook), fileName: 'all-users-target-template.xlsx' };
  },
});

/* ==================== FOCUSED PACK TARGETS ==================== */

const FP_HEADERS = ['userId', 'userName', 'productId', 'productName', 'targetCases', 'targetTonnage', 'targetValue', 'startDate', 'endDate'];
const FP_REQUIRED = ['userId', 'productId', 'productName', 'startDate', 'endDate'];

export const focusedPackTargetsDefinition = (targets: TargetService): ImportDefinition<Record<string, unknown>> => ({
  type: 'focused-pack-targets',
  label: 'Focused pack targets',
  description: 'Create or update monthly targets per user and focused-pack product.',
  requiredHeaders: FP_REQUIRED,
  optionalHeaders: FP_HEADERS.filter((header) => !FP_REQUIRED.includes(header)),
  limit: 100_000,
  batchSize: 500,
  itemDto: CreateFocusedPackTargetDto,

  async parse(sheet, { db }) {
    requireHeaders(sheet, FP_REQUIRED);
    const units = sheet.rows.map((row) => ({ rows: [row.rowNumber], ...readTargetRow(row, FP_HEADERS, FP_REQUIRED) }));
    const payloads = units.map((unit) => unit.payload);
    const [users, products] = await Promise.all([
      existing(db, 'employees', 'employeeId', payloads.map((p) => String(p.userId ?? ''))),
      existing(db, 'product_master', 'productId', payloads.map((p) => String(p.productId ?? ''))),
    ]);
    checkExists(units, 'userId', users, 'User');
    checkExists(units, 'productId', products, 'Product');
    return units;
  },

  async process(payloads) {
    return outcomesFrom(await targets.bulkUploadFocusedPackTargets({ items: payloads } as any), payloads.length, describe);
  },

  async template({ db }) {
    const [employees, products] = await Promise.all([
      activeEmployees(db),
      db.collection('product_master')
        .find({ status: 'ACTIVE', isFocusedPack: 'Y', isDeleted: { $ne: true } }, { projection: { _id: 0, productId: 1, name: 1 } })
        .sort({ name: 1 })
        .toArray(),
    ]);
    const { startDate, endDate } = monthRange();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Focused Pack Targets');
    sheet.addRow(FP_HEADERS);
    for (const employee of employees) {
      for (const product of products) {
        sheet.addRow([employee.employeeId, employee.name ?? '', product.productId, product.name, 0, 0, 0, startDate, endDate]);
      }
    }
    styleHeader(sheet, FP_HEADERS.map(() => 20));
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    return { buffer: await toBuffer(workbook), fileName: 'focused-pack-target-template.xlsx' };
  },
});
