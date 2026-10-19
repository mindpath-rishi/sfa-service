import type { Db } from 'mongodb';
import type { SheetData } from './sheet.utils';

/**
 * One thing the server creates/updates from the file. Usually one Excel row,
 * but a route spans every row that shares its Route Name.
 */
export type ImportUnit<TPayload = unknown> = {
  rows: number[];
  payload?: TPayload;
  /** Problems found while reading the file; the unit is not sent if any. */
  errors: string[];
};

/** Outcome written into the result file's Status / Remark columns. */
export type RowOutcome = { status: string; remark: string };

export type ImportContext = {
  db: Db;
  /** Extra options from the upload, e.g. the master entity. */
  options: Record<string, string | undefined>;
};

export interface ImportDefinition<TPayload = unknown> {
  type: string;
  label: string;
  description: string;
  /** Normalised later; shown in MIS as the columns the file must have. */
  requiredHeaders: string[];
  optionalHeaders: string[];
  /** Units per file. */
  limit: number;
  /** Units per call to the module's bulk method. */
  batchSize: number;
  /**
   * Per-row DTO the module's own endpoint validates with; rows that fail it
   * are reported without being sent (the service is called directly, so the
   * global ValidationPipe does not run).
   */
  itemDto?: new () => object;
  /** Options the upload must carry (e.g. masters need `entity`). */
  options?: { key: string; label: string; values?: string[]; required: boolean }[];
  parse(sheet: SheetData, ctx: ImportContext): Promise<ImportUnit<TPayload>[]>;
  /** Results must be in the same order as `payloads`. */
  process(payloads: TPayload[], ctx: ImportContext): Promise<RowOutcome[]>;
  template(ctx: ImportContext): Promise<{ buffer: Buffer; fileName: string }>;
}

/** Statuses counted as success in summaries and coloured green. */
export const SUCCESS_STATUSES = new Set(['CREATED', 'UPDATED', 'UNCHANGED']);
