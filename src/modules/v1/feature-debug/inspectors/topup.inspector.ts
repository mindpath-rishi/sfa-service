import type { Db } from 'mongodb';
import type {
  DebugCheck,
  DebugFinding,
  DebugReport,
  FeatureInspector,
} from '../feature-debug.types';
import {
  auditSection,
  check,
  clean,
  dataSyncCheck,
  erpCheck,
  logsSection,
  num,
  offerRepair,
} from './shared';
import { repair } from '../repairs';

const DAY_MS = 24 * 36e5;

/** A van top-up: approval flow, stock actually loaded, and ERP request/stock-take sync. */
export const topupInspector: FeatureInspector = {
  key: 'topup',
  label: 'Top-ups',
  description:
    'Approval flow, stock loaded onto the van, and ERP sync per line',
  idLabel: 'Top-up ID',
  idPlaceholder: 'IID98508811',

  async inspect(db: Db, { id }): Promise<DebugReport> {
    const topup = await db
      .collection('van_inventory_topup')
      .findOne({ $or: [{ vanInventoryTopupId: id }, { erpRequestNo: id }] });
    if (!topup) {
      return {
        feature: 'topup',
        id,
        found: false,
        title: `Top-up ${id} not found`,
        checks: [
          check(
            'Top-up exists',
            'FAIL',
            'No top-up with this ID or ERP request number',
          ),
        ],
        sections: [],
        links: { logs: { search: id } },
      };
    }
    const topupId = String(topup.vanInventoryTopupId);
    const [items, loads] = await Promise.all([
      db
        .collection('van_inventory_topup_items')
        .find({ vanInventoryTopupId: topupId, isDeleted: { $ne: true } })
        .toArray(),
      db
        .collection('inventory_transactions')
        .find({
          referenceNo: topupId,
          transactionType: 'LOAD',
          isDeleted: { $ne: true },
        })
        .toArray(),
    ]);

    const checks: DebugCheck[] = [];
    const age = Date.now() - new Date(topup.date).getTime();
    const pending = ['SUBMITTED', 'APPROVED'].includes(topup.status);
    checks.push(
      check(
        'Status',
        pending && age > DAY_MS ? 'WARN' : 'INFO',
        `${topup.status}${topup.acceptedAt ? `, accepted ${new Date(topup.acceptedAt).toLocaleString()}` : ''}${topup.declinedReason ? ` · ${topup.declinedReason}` : ''}${topup.adminRejectionReason ? ` · ${topup.adminRejectionReason}` : ''}`,
        pending && age > DAY_MS
          ? `Waiting more than a day: ${topup.status === 'SUBMITTED' ? 'a supervisor must approve it' : 'the salesman must accept it in the app'}.`
          : undefined,
      ),
    );
    checks.push(
      await dataSyncCheck(db, topup, [topupId, String(topup.uuid ?? '')]),
    );

    const approvedSum = items.reduce(
      (sum, item) => sum + num(item.approvedQty),
      0,
    );
    if (!items.length)
      checks.push(check('Lines', 'FAIL', 'The top-up has no lines'));
    else if (
      approvedSum !== num(topup.totalApprovedQty) &&
      topup.totalApprovedQty !== undefined
    ) {
      checks.push(
        check(
          'Line totals',
          'WARN',
          `Lines approve ${approvedSum} pieces, the top-up says ${topup.totalApprovedQty}`,
        ),
      );
    } else
      checks.push(
        check(
          'Line totals',
          'PASS',
          `${items.length} lines, ${approvedSum} pieces approved`,
        ),
      );

    // Accepted top-ups must have put the stock on the van
    const loadedByProduct = new Map<string, number>();
    for (const tx of loads)
      loadedByProduct.set(
        String(tx.productId),
        (loadedByProduct.get(String(tx.productId)) ?? 0) + num(tx.quantity),
      );
    const lineRows = items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      requested: num(item.requestedQty),
      approved: num(item.approvedQty),
      loaded: loadedByProduct.get(String(item.productId)) ?? 0,
      erpRequest: item.erpRequestSyncStatus,
      erpRequestError: item.erpRequestSyncError,
      erpStockTake: item.erpStockTakeSyncStatus,
    }));
    if (topup.status === 'ACCEPTED') {
      const missing = lineRows.filter((row) => row.loaded !== row.approved);
      checks.push(
        missing.length
          ? check(
              'Stock loaded',
              'FAIL',
              `${missing.length} line(s) where loaded stock ≠ approved: ${missing.map((row) => `${row.productName ?? row.productId} ${row.loaded}/${row.approved}`).join(', ')}`,
              'The van stock does not include this top-up correctly.',
              { feature: 'van-stock', id: String(topup.vanId) },
            )
          : check(
              'Stock loaded',
              'PASS',
              `All ${lineRows.length} lines loaded onto van ${topup.vanId}`,
              undefined,
              { feature: 'van-stock', id: String(topup.vanId) },
            ),
      );
    } else if (loads.length) {
      checks.push(
        check(
          'Stock loaded',
          'FAIL',
          `Stock was loaded although the top-up is ${topup.status}`,
          'The van got stock for a top-up that was not accepted.',
        ),
      );
    }

    // ERP, per line
    const failed = items.filter(
      (item) => item.erpRequestSyncStatus === 'FAILED',
    );
    if (failed.length) {
      checks.push(
        check(
          'ERP request sync',
          'FAIL',
          `${failed.length} line(s) failed: ${failed[0].erpRequestSyncError ?? 'no error recorded'}`,
          'Fix the cause, then retry from MIS → ERP Schedulers.',
        ),
      );
    } else if (items.length) {
      checks.push(erpCheck('ERP request sync', items[0], 'erpRequestSync'));
    }
    if (topup.status === 'ACCEPTED' && items.length) {
      const stockTakeFailed = items.filter(
        (item) => item.erpStockTakeSyncStatus === 'FAILED',
      );
      checks.push(
        stockTakeFailed.length
          ? check(
              'ERP stock take',
              'FAIL',
              `${stockTakeFailed.length} line(s) failed: ${stockTakeFailed[0].erpStockTakeSyncError ?? ''}`,
            )
          : erpCheck('ERP stock take', items[0], 'erpStockTakeSync'),
      );
    }

    offerRepair(
      checks,
      'ERP request sync',
      repair('RETRY_ERP_TOPUPS', topupId),
      ['FAIL'],
    );

    return {
      feature: 'topup',
      id: topupId,
      found: true,
      title: `Top-up ${topupId}`,
      subtitle: `Van ${topup.vanName ?? topup.vanId} · ${new Date(topup.date).toLocaleString()} · ${topup.status}`,
      checks,
      sections: [
        {
          key: 'lines',
          title: 'Lines',
          kind: 'table',
          columns: [
            'productName',
            'requested',
            'approved',
            'loaded',
            'erpRequest',
            'erpStockTake',
            'erpRequestError',
          ],
          rows: lineRows,
        },
        { key: 'topup', title: 'Top-up', kind: 'record', record: clean(topup) },
        {
          key: 'loads',
          title: 'Load transactions',
          kind: 'table',
          columns: ['transactionDate', 'productId', 'quantity', 'status'],
          rows: loads.map(clean) as any,
        },
        await auditSection(db, topupId),
        await logsSection(db, { mentions: [topupId] }),
      ],
      links: {
        logs: { search: topupId },
        syncOwnerId: topup.employeeId,
        audit: { record: topupId },
      },
    };
  },

  async scan(db: Db, since: Date): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];

    const erpFailed = await db
      .collection('van_inventory_topup_items')
      .aggregate([
        {
          $match: {
            $or: [
              { erpRequestSyncStatus: 'FAILED' },
              { erpStockTakeSyncStatus: 'FAILED' },
            ],
            isDeleted: { $ne: true },
            createdAt: { $gte: since },
          },
        },
        {
          $group: {
            _id: '$vanInventoryTopupId',
            lines: { $sum: 1 },
            error: {
              $first: {
                $ifNull: ['$erpRequestSyncError', '$erpStockTakeSyncError'],
              },
            },
            time: { $max: '$updatedAt' },
          },
        },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of erpFailed) {
      findings.push({
        severity: 'FAIL',
        problem: 'ERP sync failed',
        detail: `${row.lines} line(s): ${row.error ?? 'no error recorded'}`,
        time: row.time,
        target: { feature: 'topup', id: row._id },
      });
    }

    const acceptedNoLoad = await db
      .collection('van_inventory_topup')
      .aggregate([
        {
          $match: {
            status: 'ACCEPTED',
            isDeleted: { $ne: true },
            date: { $gte: since },
          },
        },
        {
          $lookup: {
            from: 'inventory_transactions',
            localField: 'vanInventoryTopupId',
            foreignField: 'referenceNo',
            as: 'loads',
          },
        },
        { $match: { loads: { $size: 0 } } },
        { $project: { vanInventoryTopupId: 1, vanId: 1, date: 1 } },
        { $limit: 100 },
      ])
      .toArray();
    for (const topup of acceptedNoLoad) {
      findings.push({
        severity: 'FAIL',
        problem: 'Accepted but not loaded',
        detail: `Van ${topup.vanId} never received this stock`,
        time: topup.date,
        target: { feature: 'topup', id: topup.vanInventoryTopupId },
      });
    }

    return findings;
  },
};
