import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import * as ExcelJS from 'exceljs';
import { Readable } from 'stream';

/** "Outlet ID", "outlet_id", "OutletId" → "outletid" */
export const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/[\s_\-.]+/g, '');

export type SheetRow = {
  rowNumber: number;
  /** Cell text by normalised header. */
  get(header: string): string;
  /** Visible cells in column order, for copying into the result file. */
  values: string[];
};

export type SheetData = {
  /** Visible header cells as written in the file. */
  headers: string[];
  rows: SheetRow[];
  has(header: string): boolean;
};

/** Plain text of any ExcelJS cell value (rich text, formulas, links, dates). */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((part) => part.text).join('').trim();
    if ('text' in value) return String(value.text ?? '').trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
  }
  return String(value).trim();
}

/**
 * Reads the first worksheet of an .xlsx or .csv upload. Hidden columns (the
 * dropdown option lists in the master templates) and empty rows are ignored.
 */
export async function readSheet(buffer: Buffer, fileName: string): Promise<SheetData> {
  const workbook = new ExcelJS.Workbook();
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith('.csv')) {
      await workbook.csv.read(Readable.from(buffer.toString('utf8').replace(/^﻿/, '')));
    } else if (lower.endsWith('.xlsx')) {
      await workbook.xlsx.load(buffer as any);
    } else {
      throw new BadRequestException('Upload an .xlsx or .csv file');
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('The file could not be read. Save it as .xlsx (or .csv) and try again.');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('The file has no worksheet');

  const columns: { index: number; header: string; key: string }[] = [];
  const headerRow = sheet.getRow(1);
  for (let index = 1; index <= sheet.columnCount; index += 1) {
    if (sheet.getColumn(index).hidden) continue;
    const header = cellText(headerRow.getCell(index).value);
    if (!header) continue;
    columns.push({ index, header, key: normalizeHeader(header) });
  }
  if (!columns.length) throw new BadRequestException('The first row must contain the column headers');

  const byKey = new Map<string, number>();
  for (const column of columns) if (!byKey.has(column.key)) byKey.set(column.key, column.index);

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = columns.map((column) => cellText(row.getCell(column.index).value));
    if (values.every((value) => !value)) return;
    rows.push({
      rowNumber,
      values,
      get: (header: string) => {
        const index = byKey.get(normalizeHeader(header));
        return index === undefined ? '' : cellText(row.getCell(index).value);
      },
    });
  });

  return {
    headers: columns.map((column) => column.header),
    rows,
    has: (header: string) => byKey.has(normalizeHeader(header)),
  };
}

export function requireHeaders(sheet: SheetData, headers: string[]) {
  const missing = headers.filter((header) => !sheet.has(header));
  if (missing.length) throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
}

/* ==================== DTO VALIDATION ==================== */

const flatten = (errors: ValidationError[], prefix = ''): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}).map((message) => (prefix ? `${prefix}.${message}` : message)),
    ...flatten(error.children ?? [], prefix ? `${prefix}.${error.property}` : error.property),
  ]);

/**
 * Same checks the module's own endpoint applies through the global
 * ValidationPipe (transform + whitelist + forbidNonWhitelisted), per row.
 */
export async function validateItem<T extends object>(dtoClass: new () => T, value: unknown) {
  const instance = plainToInstance(dtoClass, value) as T;
  const errors = await validate(instance, { whitelist: true, forbidNonWhitelisted: true });
  return { instance, errors: flatten(errors) };
}

/* ==================== TEMPLATES ==================== */

export function styleHeader(sheet: ExcelJS.Worksheet, widths: number[]) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

export function addInstructions(workbook: ExcelJS.Workbook, lines: string[]) {
  const notes = workbook.addWorksheet('Instructions');
  lines.forEach((line) => notes.addRow([line]));
  notes.getColumn(1).width = 120;
}

export async function toBuffer(workbook: ExcelJS.Workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
