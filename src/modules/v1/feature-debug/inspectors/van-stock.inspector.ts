import type { Db } from 'mongodb';
import type { DebugCheck, DebugFinding, DebugReport, FeatureInspector } from '../feature-debug.types';
import { auditSection, check, clean, logsSection, num } from './shared';

const DAY_MS = 24 * 36e5;
const PENDING_TOPUP = ['SUBMITTED', 'APPROVED'];

/** Per-product stock movements (posted only) for one van, optionally per product. */
const ledger = (db: Db, match: Record<string, unknown>) =>
  db.collection('inventory_transactions').aggregate([
    { $match: { status: 'POSTED', isDeleted: { $ne: true }, ...match } },
    {
      $group: {
        _id: { vanId: '$vanId', productId: '$productId' },
        in: { $sum: { $cond: [{ $eq: ['$direction', 'IN'] }, '$quantity', 0] } },
        out: { $sum: { $cond: [{ $eq: ['$direction', 'OUT'] }, '$quantity', 0] } },
        last: { $max: '$transactionDate' },
      },
    },
  ]).toArray();

/** Does the van's stock agree with what was loaded, sold and returned? */
export const vanStockInspector: FeatureInspector = {
  key: 'van-stock',
  label: 'Van stock',
  description: 'Current van stock vs its movement ledger, negative stock, pending top-ups and unloads',
  idLabel: 'Van ID',
  idPlaceholder: '414',

  async inspect(db: Db, { id }): Promise<DebugReport> {
    const [van, inventory, movements, openDay, topups, unloads] = await Promise.all([
      db.collection('vans').findOne({ $or: [{ vanId: id }, { vanNumber: id }] }),
      db.collection('inventories').find({ vanId: id, isDeleted: { $ne: true } }).toArray(),
      ledger(db, { vanId: id }),
      db.collection('work_sessions').findOne({ vanId: id, status: { $ne: 'COMPLETED' }, isDeleted: { $ne: true } }, { sort: { dayStartTime: -1 } }),
      db.collection('van_inventory_topup').find({ vanId: id, isDeleted: { $ne: true } }).sort({ date: -1 }).limit(20).toArray(),
      db.collection('stock_unload_requests').find({ vanId: id }).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);

    const checks: DebugCheck[] = [];
    checks.push(
      van
        ? check('Van', van.status === 'ACTIVE' || !van.status ? 'PASS' : 'WARN', `${van.name ?? van.vanNumber ?? id} · ${van.status ?? 'no status'}${van.breakdownReason ? ` (${van.breakdownReason})` : ''}`)
        : check('Van', inventory.length ? 'WARN' : 'FAIL', `No van master record for ${id}`, inventory.length ? 'Stock exists for a van that is not in the van master.' : undefined),
    );

    const negative = inventory.filter((row) => num(row.quantity) < 0);
    checks.push(
      negative.length
        ? check('Negative stock', 'FAIL', `${negative.length} product(s) below zero: ${negative.map((row) => `${row.productId} (${row.quantity})`).join(', ')}`, 'More was sold than loaded; a load is missing or a sale was deducted twice.')
        : check('Negative stock', 'PASS', `${inventory.length} products, none below zero`),
    );
    const overReserved = inventory.filter((row) => num(row.reservedQuantity) > num(row.quantity));
    if (overReserved.length) {
      checks.push(check('Reserved stock', 'WARN', `${overReserved.length} product(s) reserve more than is on the van`));
    }

    // Ledger: loads − sales/unloads should equal the stock on the van
    const ledgerByProduct = new Map(movements.map((row) => [String(row._id.productId), row]));
    const rows = [...new Set([...inventory.map((row) => String(row.productId)), ...ledgerByProduct.keys()])].map((productId) => {
      const stock = inventory.find((row) => String(row.productId) === productId);
      const moves = ledgerByProduct.get(productId);
      const expected = num(moves?.in) - num(moves?.out);
      return {
        productId,
        onVan: stock ? num(stock.quantity) : 0,
        loadedIn: num(moves?.in),
        movedOut: num(moves?.out),
        ledgerBalance: expected,
        difference: (stock ? num(stock.quantity) : 0) - expected,
        lastMovement: moves?.last,
      };
    });
    const drift = rows.filter((row) => row.difference !== 0);
    checks.push(
      drift.length
        ? check('Stock vs ledger', 'WARN', `${drift.length} product(s) where van stock differs from loads minus sales`, 'Stock was changed without a transaction (manual edit, import, or a failed offline sale). Opening stock loaded before transactions existed also shows here.')
        : check('Stock vs ledger', 'PASS', 'Every product matches its movement history'),
    );

    checks.push(
      openDay
        ? check('Day in progress', 'INFO', `${openDay.userName ?? openDay.userId} since ${new Date(openDay.dayStartTime).toLocaleString()}`, undefined, { feature: 'day', id: String(openDay.workSessionId) })
        : check('Day in progress', 'INFO', 'No open day on this van'),
    );

    const staleTopups = topups.filter((topup) => PENDING_TOPUP.includes(topup.status) && Date.now() - new Date(topup.date).getTime() > DAY_MS);
    if (staleTopups.length) {
      checks.push(check('Pending top-ups', 'WARN', `${staleTopups.length} top-up(s) waiting more than a day: ${staleTopups.map((topup) => `${topup.vanInventoryTopupId} (${topup.status})`).join(', ')}`, 'Approve, accept or reject them so the van stock is correct.', { feature: 'topup', id: String(staleTopups[0].vanInventoryTopupId) }));
    }
    const pendingUnloads = unloads.filter((unload) => unload.status === 'PENDING');
    if (pendingUnloads.length) {
      checks.push(check('Pending unloads', 'WARN', `${pendingUnloads.length} unload request(s) not yet approved`));
    }

    return {
      feature: 'van-stock',
      id,
      found: Boolean(van) || inventory.length > 0,
      title: `Van ${van?.name ?? id}`,
      subtitle: van ? [van.vanNumber, van.driverName].filter(Boolean).join(' · ') : undefined,
      checks,
      sections: [
        { key: 'stock', title: 'Stock vs ledger', kind: 'table', columns: ['productId', 'onVan', 'loadedIn', 'movedOut', 'ledgerBalance', 'difference', 'lastMovement'], rows: rows.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)) },
        { key: 'topups', title: 'Recent top-ups', kind: 'table', columns: ['vanInventoryTopupId', 'date', 'status', 'totalRequestedQty', 'totalApprovedQty'], rows: topups.map(clean) as any, linkColumn: { column: 'vanInventoryTopupId', feature: 'topup' } },
        { key: 'unloads', title: 'Recent unloads', kind: 'table', columns: ['unloadRequestId', 'createdAt', 'status', 'totalQuantity'], rows: unloads.map(clean) as any },
        { key: 'van', title: 'Van', kind: 'record', record: clean(van) },
        await auditSection(db, id),
        await logsSection(db, { mentions: [`vanId=${id}`, `/van/${id}`] }),
      ],
      links: { logs: { search: id } },
    };
  },

  async scan(db: Db, since: Date): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];

    const negative = await db.collection('inventories').find({ quantity: { $lt: 0 }, isDeleted: { $ne: true } }, { projection: { vanId: 1, productId: 1, quantity: 1, updatedAt: 1 } }).limit(200).toArray();
    const byVan = new Map<string, string[]>();
    for (const row of negative) byVan.set(row.vanId, [...(byVan.get(row.vanId) ?? []), `${row.productId} (${row.quantity})`]);
    for (const [vanId, products] of byVan) {
      findings.push({ severity: 'FAIL', problem: 'Negative stock', detail: products.slice(0, 5).join(', ') + (products.length > 5 ? ` +${products.length - 5} more` : ''), target: { feature: 'van-stock', id: vanId } });
    }

    // Vans that moved stock recently and no longer match their ledger
    const recent = await ledger(db, { transactionDate: { $gte: since } });
    const vans = [...new Set(recent.map((row) => String(row._id.vanId)))].slice(0, 100);
    for (const vanId of vans) {
      const [inventory, moves] = await Promise.all([
        db.collection('inventories').find({ vanId, isDeleted: { $ne: true } }, { projection: { productId: 1, quantity: 1 } }).toArray(),
        ledger(db, { vanId }),
      ]);
      const stock = new Map(inventory.map((row) => [String(row.productId), num(row.quantity)]));
      const drift = moves.filter((row) => (stock.get(String(row._id.productId)) ?? 0) !== num(row.in) - num(row.out)).length;
      if (drift) findings.push({ severity: 'WARN', problem: 'Stock differs from ledger', detail: `${drift} product(s) where stock ≠ loads − sales`, target: { feature: 'van-stock', id: vanId } });
    }

    const staleTopups = await db.collection('van_inventory_topup').find({ status: { $in: PENDING_TOPUP }, date: { $lt: new Date(Date.now() - DAY_MS) }, isDeleted: { $ne: true } }, { projection: { vanInventoryTopupId: 1, vanId: 1, status: 1, date: 1 } }).limit(100).toArray();
    for (const topup of staleTopups) {
      findings.push({ severity: 'WARN', problem: 'Top-up waiting over a day', detail: `Van ${topup.vanId}: ${topup.status}`, time: topup.date, target: { feature: 'topup', id: topup.vanInventoryTopupId } });
    }

    const staleUnloads = await db.collection('stock_unload_requests').find({ status: 'PENDING', createdAt: { $lt: new Date(Date.now() - DAY_MS) } }, { projection: { unloadRequestId: 1, vanId: 1, createdAt: 1 } }).limit(100).toArray();
    for (const unload of staleUnloads) {
      findings.push({ severity: 'WARN', problem: 'Unload waiting over a day', detail: `Van ${unload.vanId}: ${unload.unloadRequestId}`, time: unload.createdAt, target: { feature: 'van-stock', id: unload.vanId } });
    }

    return findings;
  },
};
