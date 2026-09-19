import * as XLSX from 'xlsx';

export interface ExcelColumn<T = any> {
  header: string;
  key: keyof T | string;
  formatter?: (value: any, row: T) => any;
}

export class ExcelHelper {
  /**
   * Creates an Excel workbook from column definitions and rows.
   *
   * The returned Buffer can be directly sent from a NestJS controller
   * as an XLSX file response.
   */
  static createWorkbookBuffer<T>(
    columns: ExcelColumn<T>[],
    rows: T[],
    sheetName = 'Report',
  ): Buffer {
    const headers = columns.map((column) => column.header);

    const data = rows.map((row) =>
      columns.map((column) => {
        const value = (row as any)[column.key];

        return column.formatter ? column.formatter(value, row) : (value ?? '');
      }),
    );

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      this.normalizeSheetName(sheetName),
    );

    return XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;
  }

  /**
   * Converts seconds into HH:mm:ss.
   *
   * Example:
   * 3665 -> 01:01:05
   */
  static secondsToTime(seconds: number | null | undefined): string {
    const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));

    const hours = Math.floor(totalSeconds / 3600);

    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const remainingSeconds = totalSeconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      remainingSeconds.toString().padStart(2, '0'),
    ].join(':');
  }

  /**
   * Excel worksheet names have a maximum length of 31 characters
   * and cannot contain: \ / ? * [ ]
   */
  private static normalizeSheetName(sheetName: string): string {
    return (
      String(sheetName || 'Report')
        .replace(/[\\/?*[\]]/g, '')
        .substring(0, 31) || 'Report'
    );
  }
}
