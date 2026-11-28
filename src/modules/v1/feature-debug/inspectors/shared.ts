import type { Db } from 'mongodb';
import { APP_LOGS_COLLECTION } from 'src/core/logger/log-sink';
import type {
  CheckStatus,
  DebugCheck,
  DebugSection,
  RepairRef,
} from '../feature-debug.types';

/** Values from different screens are rounded differently; compare to the cent. */
export const sameAmount = (a: unknown, b: unknown, tolerance = 0.01) =>
  Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= tolerance;

export const num = (value: unknown) => Number(value ?? 0) || 0;

export const round2 = (value: number) => Math.round(value * 100) / 100;

export const check = (
  label: string,
  status: CheckStatus,
  detail: string,
  hint?: string,
  target?: DebugCheck['target'],
): DebugCheck => ({
  label,
  status,
  detail,
  ...(hint ? { hint } : {}),
  ...(target ? { target } : {}),
});

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const startOfDay = (value?: string | Date) => {
  const date = value ? new Date(value) : new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

export const endOfDay = (value?: string | Date) => {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
};

/** Strip bulky/internal fields so a record reads well in MIS. */
export const clean = (doc: Record<string, any> | null | undefined) => {
  if (!doc) return null;
  const { __v, password, ...rest } = doc;
  return rest;
};

/** Record history from the audit plugin (create/update/delete). */
export async function auditSection(
  db: Db,
  entityId: string,
): Promise<DebugSection> {
  const rows = await db
    .collection('audit_logs')
    .find(
      { entityId },
      {
        projection: {
          _id: 0,
          entity: 1,
          action: 1,
          performedBy: 1,
          createdAt: 1,
          after: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return {
    key: 'audit',
    title: 'Change history',
    kind: 'table',
    columns: ['createdAt', 'action', 'performedBy', 'after'],
    rows: rows.map((row) => ({
      ...row,
      performedBy: row.performedBy?.name ?? row.performedBy?.employeeId,
      after: row.after ? Object.keys(row.after).join(', ') : '',
    })),
  };
}

/** Offline sync attempts that touched this record. */
export async function offlineSyncSection(
  db: Db,
  ids: string[],
): Promise<DebugSection> {
  const rows = await db
    .collection('offline_sync_audit_logs')
    .find(
      { $or: [{ businessId: { $in: ids } }, { localId: { $in: ids } }] },
      {
        projection: {
          _id: 0,
          auditId: 1,
          entity: 1,
          operation: 1,
          status: 1,
          error: 1,
          ownerId: 1,
          createdAt: 1,
        },
      },
    )
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return {
    key: 'offline-sync',
    title: 'Offline sync attempts',
    kind: 'table',
    columns: ['createdAt', 'entity', 'operation', 'status', 'error'],
    rows,
  };
}

/** Server log lines that mention any of the ids (URL, message or error). */
export async function logsSection(
  db: Db,
  filter: { mentions?: string[]; userId?: string; from?: Date; to?: Date },
): Promise<DebugSection> {
  const query: Record<string, unknown> = {
    time: {
      $gte: filter.from ?? new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
      ...(filter.to ? { $lte: filter.to } : {}),
    },
  };
  if (filter.userId) query.userId = filter.userId;
  const mentions = (filter.mentions ?? []).filter(Boolean);
  if (mentions.length) {
    const regex = { $regex: mentions.map(escapeRegex).join('|') };
    query.$or = [{ url: regex }, { msg: regex }, { errorMessage: regex }];
  }

  const rows = await db
    .collection(APP_LOGS_COLLECTION)
    .find(query, {
      projection: {
        _id: 0,
        time: 1,
        levelLabel: 1,
        msg: 1,
        errorMessage: 1,
        statusCode: 1,
        reqId: 1,
        userId: 1,
      },
    })
    .sort({ time: -1 })
    .limit(50)
    .toArray()
    .catch(() => []);

  return {
    key: 'logs',
    title: 'Server logs',
    kind: 'table',
    columns: [
      'time',
      'levelLabel',
      'statusCode',
      'msg',
      'errorMessage',
      'reqId',
    ],
    rows,
  };
}

/** ERP sync state is stored with the same field names across modules. */
export function erpCheck(
  label: string,
  doc: Record<string, any>,
  prefix = 'erpSync',
): DebugCheck {
  const status = doc[`${prefix}Status`];
  const error = doc[`${prefix}Error`];
  const attempts = doc[`${prefix}Attempts`];
  const lastAttempt = doc.erpLastSyncAttemptAt ?? doc[`${prefix}LastAttemptAt`];
  if (!status) return check(label, 'INFO', 'No ERP sync state recorded');
  if (status === 'SYNCED') return check(label, 'PASS', 'Sent to ERP');
  if (status === 'FAILED') {
    return check(
      label,
      'FAIL',
      `ERP sync failed after ${attempts ?? '?'} attempt(s): ${error ?? 'no error recorded'}`,
      'Fix the cause shown, then retry from MIS → ERP Schedulers.',
    );
  }
  const ageHours = lastAttempt
    ? (Date.now() - new Date(lastAttempt).getTime()) / 36e5
    : undefined;
  return check(
    label,
    ageHours !== undefined && ageHours > 1 ? 'WARN' : 'INFO',
    `ERP status ${status}${attempts ? `, ${attempts} attempt(s)` : ''}`,
    ageHours !== undefined && ageHours > 1
      ? 'Still not sent after more than an hour; check the ERP scheduler.'
      : undefined,
  );
}

/**
 * Did this record reach the server cleanly? Combines the record's own sync
 * markers with the offline upload attempts recorded for it.
 */
export async function dataSyncCheck(
  db: Db,
  doc: Record<string, any>,
  ids: string[],
): Promise<DebugCheck> {
  const lookupIds = ids.filter(Boolean);
  const attempts = lookupIds.length
    ? await db
        .collection('offline_sync_audit_logs')
        .find(
          {
            $or: [
              { businessId: { $in: lookupIds } },
              { localId: { $in: lookupIds } },
            ],
          },
          { projection: { _id: 0, status: 1, error: 1, createdAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(20)
        .toArray()
    : [];

  const latest = attempts[0];
  const failures = attempts.filter(
    (attempt) => attempt.status === 'FAILED',
  ).length;
  const source = doc.createdOffline
    ? 'created offline'
    : `created ${String(doc.syncSource ?? 'ONLINE').toLowerCase()}`;
  const synced = doc.lastSyncedAt
    ? `, last synced ${new Date(doc.lastSyncedAt).toLocaleString()}`
    : '';

  if (latest?.status === 'FAILED') {
    return check(
      'Data sync',
      'FAIL',
      `Latest offline upload failed: ${latest.error ?? 'unknown error'} (${failures} failed attempt(s))`,
      'The phone still holds a newer change. Resolve it in Offline Sync Issues.',
    );
  }
  if (failures) {
    return check(
      'Data sync',
      'PASS',
      `Synced (${source}${synced}); ${failures} earlier attempt(s) failed before it went through`,
    );
  }
  return check('Data sync', 'PASS', `On the server (${source}${synced})`);
}

/** Offer a repair on the check with this label when it is failing/warning. */
export function offerRepair(
  checks: DebugCheck[],
  label: string,
  ref: RepairRef,
  statuses: CheckStatus[] = ['FAIL', 'WARN'],
) {
  const entry = checks.find(
    (item) => item.label === label && statuses.includes(item.status),
  );
  if (entry) entry.repair = ref;
}

/** The phone's own report from its latest check-in (diagnostics heartbeat). */
export async function phoneCheck(
  db: Db,
  userId: string,
): Promise<{ check: DebugCheck; latest: Record<string, any> | null }> {
  const latest = await db
    .collection('device_diagnostics')
    .findOne({ userId }, { sort: { lastHeartbeatAt: -1 } });
  if (!latest) {
    return {
      latest: null,
      check: check(
        'Phone check-in',
        'INFO',
        'No check-in from the phone yet (the app version with diagnostics is not installed, or it never opened)',
      ),
    };
  }
  const minutes = Math.round(
    (Date.now() - new Date(latest.lastHeartbeatAt).getTime()) / 60000,
  );
  const problems = [
    latest.queue?.failed ? `${latest.queue.failed} failed in queue` : '',
    latest.permissions && latest.permissions.backgroundLocation !== 'granted'
      ? 'background location off'
      : '',
    latest.permissions && latest.permissions.notifications !== 'granted'
      ? 'notifications off'
      : '',
    typeof latest.freeStorageMb === 'number' && latest.freeStorageMb < 500
      ? `only ${latest.freeStorageMb} MB free`
      : '',
  ].filter(Boolean);
  const detail = `App ${latest.appVersion ?? '?'} on ${latest.platform ?? ''} ${latest.osVersion ?? ''} (${latest.deviceModel ?? 'unknown device'}), last check-in ${minutes} min ago; queue ${latest.queue?.pending ?? 0} pending`;
  return {
    latest,
    check: check(
      'Phone check-in',
      problems.length ? 'WARN' : minutes > 30 ? 'INFO' : 'PASS',
      problems.length ? `${detail}; ${problems.join(', ')}` : detail,
      problems.length
        ? 'Ask the salesman to fix these settings, or request diagnostics for the app logs.'
        : undefined,
    ),
  };
}
