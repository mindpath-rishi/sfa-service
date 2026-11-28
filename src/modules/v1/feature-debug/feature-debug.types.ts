import type { Db } from 'mongodb';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export const REPAIR_ACTIONS = [
  'END_DAY',
  'CLOSE_ARRIVALS',
  'REVERSE_DUPLICATE_DEDUCTION',
  'RETRY_ERP_SALE',
  'RETRY_ERP_TOPUPS',
  'FORCE_RESYNC',
  'REQUEST_DIAGNOSTICS',
  'LOGOUT_DEVICES',
  'DEBUG_LOGGING',
] as const;
export type RepairAction = (typeof REPAIR_ACTIONS)[number];

/** A fix the MIS can offer next to a check (runs only after confirmation). */
export type RepairRef = {
  action: RepairAction;
  id: string;
  label: string;
  confirm: string;
};

/** A link from one report to another feature's inspector. */
export type InspectTarget = { feature: FeatureKey; id: string };

export type DebugCheck = {
  label: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, when the status is WARN or FAIL. */
  hint?: string;
  target?: InspectTarget;
  repair?: RepairRef;
};

export type DebugSection =
  | {
      key: string;
      title: string;
      kind: 'record';
      record: Record<string, unknown> | null;
    }
  | {
      key: string;
      title: string;
      kind: 'table';
      rows: Record<string, unknown>[];
      /** Columns to show first; other fields stay visible when a row is expanded. */
      columns: string[];
      /** Column whose value opens another inspector. */
      linkColumn?: { column: string; feature: FeatureKey };
    };

export type DebugReport = {
  feature: FeatureKey;
  id: string;
  found: boolean;
  title: string;
  subtitle?: string;
  checks: DebugCheck[];
  sections: DebugSection[];
  /** Tools that apply to the whole subject (e.g. ask the phone for diagnostics). */
  tools?: RepairRef[];
  /** Where the MIS can jump for more context. */
  links: {
    logs?: { userId?: string; search?: string; from?: string; to?: string };
    syncOwnerId?: string;
    audit?: { module?: string; record: string };
  };
};

export type DebugFinding = {
  severity: 'FAIL' | 'WARN';
  problem: string;
  detail: string;
  time?: Date | string;
  target?: InspectTarget;
};

export type FeatureKey =
  | 'sales'
  | 'day'
  | 'salesman'
  | 'van-stock'
  | 'topup'
  | 'payment'
  | 'sync';

export type InspectInput = { id: string; date?: string };

export interface FeatureInspector {
  key: FeatureKey;
  label: string;
  description: string;
  idLabel: string;
  idPlaceholder: string;
  /** Inspectors that also take a day (e.g. van stock on a date). */
  acceptsDate?: boolean;
  inspect(db: Db, input: InspectInput): Promise<DebugReport>;
  scan(db: Db, since: Date): Promise<DebugFinding[]>;
}
