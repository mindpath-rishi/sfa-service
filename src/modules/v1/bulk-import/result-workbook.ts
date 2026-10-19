import * as ExcelJS from 'exceljs';
import { SUCCESS_STATUSES, type RowOutcome } from './bulk-import.types';
import type { SheetData } from './sheet.utils';

const FILL = {
  success: 'FFDCFCE7',
  failed: 'FFFEE2E2',
};

/**
 * The uploaded sheet returned with Status and Remark on every row, plus a
 * Summary sheet. Only failed rows need fixing; the file can be corrected
 * and uploaded again as it is.
 */
export async function buildResultWorkbook(params: {
  sheet: SheetData;
  outcomes: Map<number, RowOutcome>;
  label: string;
  fileName: string;
  summary: Record<string, number>;
  finishedAt: Date;
}) {
  const workbook = new ExcelJS.Workbook();
  const result = workbook.addWorksheet('Result');
  result.addRow([...params.sheet.headers, 'Status', 'Remark']);

  const statusColumn = params.sheet.headers.length + 1;
  for (const row of params.sheet.rows) {
    const outcome = params.outcomes.get(row.rowNumber) ?? { status: 'FAILED', remark: 'Row was not processed' };
    const added = result.addRow([...row.values, outcome.status, outcome.remark]);
    const ok = SUCCESS_STATUSES.has(outcome.status);
    for (const column of [statusColumn, statusColumn + 1]) {
      added.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ok ? FILL.success : FILL.failed } };
    }
    added.getCell(statusColumn).font = { bold: true, color: { argb: ok ? 'FF166534' : 'FF991B1B' } };
  }

  const header = result.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  header.getCell(statusColumn).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  header.getCell(statusColumn + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  result.views = [{ state: 'frozen', ySplit: 1 }];
  params.sheet.headers.forEach((value, index) => {
    result.getColumn(index + 1).width = Math.min(40, Math.max(12, value.length + 4));
  });
  result.getColumn(statusColumn).width = 14;
  result.getColumn(statusColumn + 1).width = 70;
  result.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: statusColumn + 1 } };

  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Upload', params.label]);
  summary.addRow(['File', params.fileName]);
  summary.addRow(['Processed at', params.finishedAt.toISOString()]);
  summary.addRow([]);
  summary.addRow(['Status', 'Rows']);
  for (const [status, count] of Object.entries(params.summary)) summary.addRow([status, count]);
  summary.getColumn(1).width = 18;
  summary.getColumn(2).width = 50;
  summary.getRow(5).font = { bold: true };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
