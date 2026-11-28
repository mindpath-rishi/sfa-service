import type { Db } from 'mongodb';
import { APP_LOGS_COLLECTION } from 'src/core/logger/log-sink';
import type {
  DebugCheck,
  DebugFinding,
  DebugReport,
  FeatureInspector,
} from '../feature-debug.types';
import { check, logsSection, offerRepair, phoneCheck } from './shared';
import { repair } from '../repairs';

const AUDITS = 'offline_sync_audit_logs';
const RESOLUTIONS = 'offline_sync_resolutions';
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 36e5);
const since = (date?: Date | null) => {
  if (!date) return 'never';
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
};

/** Items whose most recent upload attempt failed, i.e. still stuck on the phone. */
export const stuckItems = (db: Db, match: Record<string, unknown>) =>
  db
    .collection(AUDITS)
    .aggregate([
      { $match: { createdAt: { $gte: hoursAgo(30 * 24) }, ...match } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            ownerId: '$ownerId',
            queueId: '$queueId',
            localId: '$localId',
          },
          status: { $first: '$status' },
          error: { $first: '$error' },
          entity: { $first: '$entity' },
          operation: { $first: '$operation' },
          auditId: { $first: '$auditId' },
          last: { $first: '$createdAt' },
          attempts: { $sum: 1 },
        },
      },
      { $match: { status: 'FAILED' } },
    ])
    .toArray();

/** Is this salesman's phone in step with the server, and is the server in step with ERP? */
export const syncInspector: FeatureInspector = {
  key: 'sync',
  label: 'Data sync',
  description:
    'Phone ↔ server uploads and downloads, stuck items, and the ERP backlog for one salesman',
  idLabel: 'Salesman employee ID',
  idPlaceholder: 'EID24343401',

  async inspect(db: Db, { id }): Promise<DebugReport> {
    const employee = await db
      .collection('employees')
      .findOne({ $or: [{ employeeId: id }, { manNumber: id }] });
    const ownerId = String(employee?.employeeId ?? id);
    const logs = db.collection(APP_LOGS_COLLECTION);

    const [
      position,
      lastUploadOk,
      lastUploadAny,
      lastDownload,
      stuck,
      waiting,
      failedDecisions,
      byEntity,
      activeDay,
      erpSales,
      offlineRecords,
    ] = await Promise.all([
      db
        .collection('position_master')
        .findOne(
          { employeeId: ownerId, isDeleted: { $ne: true } },
          { projection: { offlineAccessAllowed: 1, status: 1 } },
        ),
      db
        .collection(AUDITS)
        .findOne(
          { ownerId, status: 'SUCCESS' },
          { sort: { createdAt: -1 }, projection: { createdAt: 1, entity: 1 } },
        ),
      db
        .collection(AUDITS)
        .findOne(
          { ownerId },
          { sort: { createdAt: -1 }, projection: { createdAt: 1, status: 1 } },
        ),
      logs
        .findOne(
          { userId: ownerId, url: { $regex: '^/api/v\\d+/sync/download' } },
          {
            sort: { time: -1 },
            projection: { time: 1, statusCode: 1, errorMessage: 1 },
          },
        )
        .catch(() => null),
      stuckItems(db, { ownerId }),
      db.collection(RESOLUTIONS).countDocuments({ ownerId, status: 'WAITING' }),
      db.collection(RESOLUTIONS).countDocuments({ ownerId, status: 'FAILED' }),
      db
        .collection(AUDITS)
        .aggregate([
          { $match: { ownerId, createdAt: { $gte: hoursAgo(7 * 24) } } },
          {
            $group: {
              _id: { entity: '$entity', status: '$status' },
              count: { $sum: 1 },
              last: { $max: '$createdAt' },
            },
          },
        ])
        .toArray(),
      db.collection('work_sessions').findOne(
        {
          userId: ownerId,
          status: { $ne: 'COMPLETED' },
          isDeleted: { $ne: true },
        },
        { sort: { dayStartTime: -1 } },
      ),
      db
        .collection('sales')
        .aggregate([
          // Online sales name the seller in positionHierarchy, offline ones in employeeId.
          {
            $match: {
              $or: [
                { employeeId: ownerId },
                { 'positionHierarchy.employeeId': ownerId },
              ],
              isDeleted: { $ne: true },
              date: { $gte: hoursAgo(30 * 24) },
            },
          },
          { $group: { _id: '$erpSyncStatus', count: { $sum: 1 } } },
        ])
        .toArray(),
      db.collection('sales').countDocuments({
        $or: [
          { employeeId: ownerId },
          { 'positionHierarchy.employeeId': ownerId },
        ],
        createdOffline: true,
        date: { $gte: hoursAgo(7 * 24) },
      }),
    ]);

    const checks: DebugCheck[] = [];
    const phone = await phoneCheck(db, ownerId);
    checks.push(phone.check);
    const offline = position?.offlineAccessAllowed === true;
    checks.push(
      check(
        'Offline access',
        'INFO',
        offline
          ? 'Enabled: the phone queues changes and uploads them later'
          : 'Disabled: every change goes straight to the server, nothing is queued',
      ),
    );

    // Uploads (phone → server)
    if (!lastUploadAny) {
      checks.push(
        check(
          'Last upload',
          offline ? 'WARN' : 'INFO',
          'The phone has never uploaded offline changes',
          offline
            ? 'If the salesman worked offline, their changes are still only on the phone.'
            : undefined,
        ),
      );
    } else {
      const stale =
        activeDay && offline && new Date(lastUploadAny.createdAt) < hoursAgo(2);
      checks.push(
        check(
          'Last upload',
          stale ? 'WARN' : 'PASS',
          `Last upload ${since(lastUploadAny.createdAt)}; last successful ${since(lastUploadOk?.createdAt)}`,
          stale
            ? 'A day is open but the phone has not uploaded for over 2 hours: it may be offline, logged out, or the app closed.'
            : undefined,
        ),
      );
    }

    // Downloads (server → phone)
    if (offline) {
      checks.push(
        !lastDownload
          ? check(
              'Last download',
              'WARN',
              'No download recorded in the stored logs',
              'The phone may be using old master data (prices, schemes, outlets).',
            )
          : lastDownload.statusCode >= 400
            ? check(
                'Last download',
                'FAIL',
                `Last download ${since(lastDownload.time)} failed (${lastDownload.statusCode}): ${lastDownload.errorMessage ?? ''}`,
              )
            : check(
                'Last download',
                new Date(lastDownload.time) < hoursAgo(24) ? 'WARN' : 'PASS',
                `Last download ${since(lastDownload.time)}`,
              ),
      );
    }

    // Stuck items
    const conflicts = stuck.filter(
      (item) => item.error === 'VERSION_CONFLICT',
    ).length;
    checks.push(
      stuck.length
        ? check(
            'Stuck on the phone',
            'FAIL',
            `${stuck.length} change(s) keep failing (${conflicts} conflict(s)); the phone retries them forever`,
            'Open Offline Sync Issues and decide for each one.',
          )
        : check('Stuck on the phone', 'PASS', 'No change is stuck'),
    );
    if (waiting)
      checks.push(
        check(
          'Decisions waiting',
          'INFO',
          `${waiting} decision(s) will apply on this phone's next sync`,
        ),
      );
    if (failedDecisions)
      checks.push(
        check(
          'Decisions failed',
          'FAIL',
          `${failedDecisions} decision(s) failed when the phone retried`,
          'Open the issue in Offline Sync Issues to see why.',
        ),
      );

    // Server → ERP
    const erp = Object.fromEntries(
      erpSales.map((row) => [row._id ?? 'NONE', row.count]),
    );
    if (erp.FAILED)
      checks.push(
        check(
          'ERP sync of sales',
          'FAIL',
          `${erp.FAILED} sale(s) failed to reach ERP in the last 30 days (${erp.SYNCED ?? 0} sent, ${erp.PENDING ?? 0} pending)`,
          'Retry from MIS → ERP Schedulers once the cause is fixed.',
        ),
      );
    else if (erp.PENDING)
      checks.push(
        check(
          'ERP sync of sales',
          'WARN',
          `${erp.PENDING} sale(s) still waiting to be sent to ERP`,
        ),
      );
    else
      checks.push(
        check(
          'ERP sync of sales',
          'PASS',
          `${erp.SYNCED ?? 0} sale(s) sent to ERP in the last 30 days`,
        ),
      );
    if (offlineRecords)
      checks.push(
        check(
          'Offline sales',
          'INFO',
          `${offlineRecords} sale(s) created offline in the last 7 days`,
        ),
      );
    offerRepair(checks, 'Last download', repair('FORCE_RESYNC', ownerId));
    offerRepair(
      checks,
      'Phone check-in',
      repair('REQUEST_DIAGNOSTICS', ownerId),
      ['WARN'],
    );

    type EntityRow = {
      entity: string;
      success: number;
      failed: number;
      pending: number;
      last?: Date;
    };
    const entityRows = new Map<string, EntityRow>();
    for (const row of byEntity) {
      const entry: EntityRow = entityRows.get(row._id.entity) ?? {
        entity: row._id.entity,
        success: 0,
        failed: 0,
        pending: 0,
      };
      if (row._id.status === 'SUCCESS') entry.success += row.count;
      else if (row._id.status === 'FAILED') entry.failed += row.count;
      else entry.pending += row.count;
      if (!entry.last || row.last > entry.last) entry.last = row.last;
      entityRows.set(row._id.entity, entry);
    }

    return {
      feature: 'sync',
      id: ownerId,
      found: Boolean(employee),
      title: `Data sync · ${employee?.name ?? ownerId}`,
      subtitle: activeDay
        ? `Day in progress since ${new Date(activeDay.dayStartTime).toLocaleString()}`
        : 'No day in progress',
      checks,
      sections: [
        {
          key: 'stuck',
          title: 'Stuck changes',
          kind: 'table',
          columns: ['entity', 'operation', 'error', 'attempts', 'last'],
          rows: stuck.map(({ _id, ...row }) => ({
            ...row,
            queueId: _id.queueId,
            localId: _id.localId,
          })),
        },
        {
          key: 'by-entity',
          title: 'Uploads by record type (7 days)',
          kind: 'table',
          columns: ['entity', 'success', 'failed', 'pending', 'last'],
          rows: [...entityRows.values()].sort((a, b) => b.failed - a.failed),
        },
        await logsSection(db, {
          userId: ownerId,
          mentions: ['/sync/'],
          from: hoursAgo(7 * 24),
        }),
      ],
      links: {
        logs: { userId: ownerId, search: '/sync/' },
        syncOwnerId: ownerId,
      },
      tools: [
        repair('REQUEST_DIAGNOSTICS', ownerId),
        repair('FORCE_RESYNC', ownerId),
        repair('DEBUG_LOGGING', ownerId),
      ],
    };
  },

  async scan(db: Db): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];

    // Stuck changes, one finding per salesman
    const stuck = await stuckItems(db, {});
    const byOwner = new Map<
      string,
      { count: number; conflicts: number; last: Date }
    >();
    for (const item of stuck) {
      const entry = byOwner.get(item._id.ownerId) ?? {
        count: 0,
        conflicts: 0,
        last: item.last,
      };
      entry.count += 1;
      if (item.error === 'VERSION_CONFLICT') entry.conflicts += 1;
      if (item.last > entry.last) entry.last = item.last;
      byOwner.set(item._id.ownerId, entry);
    }
    for (const [ownerId, entry] of byOwner) {
      findings.push({
        severity: 'FAIL',
        problem: 'Changes stuck on phone',
        detail: `${entry.count} change(s) keep failing (${entry.conflicts} conflict(s))`,
        time: entry.last,
        target: { feature: 'sync', id: ownerId },
      });
    }

    // Open day, offline access on, but the phone went quiet
    const openDays = await db
      .collection('work_sessions')
      .find(
        {
          status: { $ne: 'COMPLETED' },
          isDeleted: { $ne: true },
          dayStartTime: { $gte: hoursAgo(24) },
        },
        { projection: { userId: 1, userName: 1 } },
      )
      .toArray();
    for (const day of openDays) {
      const position = await db.collection('position_master').findOne(
        {
          employeeId: day.userId,
          offlineAccessAllowed: true,
          isDeleted: { $ne: true },
        },
        { projection: { _id: 1 } },
      );
      if (!position) continue;
      const lastUpload = await db
        .collection(AUDITS)
        .findOne(
          { ownerId: day.userId },
          { sort: { createdAt: -1 }, projection: { createdAt: 1 } },
        );
      if (!lastUpload || new Date(lastUpload.createdAt) < hoursAgo(2)) {
        findings.push({
          severity: 'WARN',
          problem: 'Phone not syncing',
          detail: `${day.userName ?? day.userId} has a day open but last uploaded ${since(lastUpload?.createdAt)}`,
          time: lastUpload?.createdAt,
          target: { feature: 'sync', id: String(day.userId) },
        });
      }
    }

    // Decisions that did not apply
    const failedDecisions = await db
      .collection(RESOLUTIONS)
      .find(
        { status: 'FAILED' },
        { projection: { ownerId: 1, error: 1, appliedAt: 1 } },
      )
      .limit(50)
      .toArray();
    for (const row of failedDecisions) {
      findings.push({
        severity: 'FAIL',
        problem: 'Sync decision failed',
        detail: String(row.error ?? 'Failed when the phone retried'),
        time: row.appliedAt,
        target: { feature: 'sync', id: String(row.ownerId) },
      });
    }

    // ERP backlog, one line per kind
    const [salesFailed, topupFailed] = await Promise.all([
      db
        .collection('sales')
        .countDocuments({ erpSyncStatus: 'FAILED', isDeleted: { $ne: true } }),
      db.collection('van_inventory_topup_items').countDocuments({
        erpRequestSyncStatus: 'FAILED',
        isDeleted: { $ne: true },
      }),
    ]);
    if (salesFailed)
      findings.push({
        severity: 'FAIL',
        problem: 'Sales not sent to ERP',
        detail: `${salesFailed} sale(s) failed ERP sync; scan Sales for each one`,
      });
    if (topupFailed)
      findings.push({
        severity: 'FAIL',
        problem: 'Top-ups not sent to ERP',
        detail: `${topupFailed} top-up line(s) failed ERP sync; scan Top-ups for each one`,
      });

    return findings;
  },
};
