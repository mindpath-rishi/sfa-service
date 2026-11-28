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
  offlineSyncSection,
  round2,
  offerRepair,
  sameAmount,
} from './shared';
import { repair } from '../repairs';

/** A sale, its items, the stock it took off the van, its payment and ERP state. */
export const salesInspector: FeatureInspector = {
  key: 'sales',
  label: 'Sales',
  description:
    'Totals, stock deduction, payment, visit and ERP sync for one sale',
  idLabel: 'Sale ID',
  idPlaceholder: 'SID40565255 (or the app checkout ID)',

  async inspect(db: Db, { id }): Promise<DebugReport> {
    const sale = await db
      .collection('sales')
      .findOne({ $or: [{ saleId: id }, { clientSaleId: id }] });
    if (!sale) {
      return {
        feature: 'sales',
        id,
        found: false,
        title: `Sale ${id} not found`,
        checks: [
          check(
            'Sale exists',
            'FAIL',
            'No sale with this sale ID or checkout ID',
            'If the salesman was offline, check Offline Sync Issues for their pending uploads.',
          ),
        ],
        sections: [await offlineSyncSection(db, [id])],
        links: { logs: { search: id } },
      };
    }

    const saleId = String(sale.saleId);
    const [items, transactions, payments, visit, sameCheckout] =
      await Promise.all([
        db
          .collection('sale_items')
          .find({ saleId, isDeleted: { $ne: true } })
          .toArray(),
        db
          .collection('inventory_transactions')
          .find({ referenceNo: saleId, isDeleted: { $ne: true } })
          .toArray(),
        db
          .collection('payments')
          .find({ 'sales.saleId': saleId, isDeleted: { $ne: true } })
          .toArray(),
        sale.visitId
          ? db.collection('shop_visits').findOne({ visitId: sale.visitId })
          : null,
        sale.clientSaleId
          ? db.collection('sales').countDocuments({
              clientSaleId: sale.clientSaleId,
              isDeleted: { $ne: true },
            })
          : 1,
      ]);

    // Online sales record the seller in positionHierarchy, offline ones in employeeId.
    const salesmanId =
      sale.employeeId ??
      transactions.find((tx) => tx.employeeId)?.employeeId ??
      (sale.positionHierarchy ?? []).find((level: any) => level.employeeId)
        ?.employeeId;

    const checks: DebugCheck[] = [];
    checks.push(
      sale.isDeleted
        ? check(
            'Sale status',
            'WARN',
            `Sale is deleted (status ${sale.status})`,
          )
        : check(
            'Sale status',
            'PASS',
            `${sale.status} · ${sale.type} · ${sale.paymentStatus}`,
          ),
    );

    // 1. Items add up to the sale
    const itemValue = round2(
      items.reduce((sum, item) => sum + num(item.totalValue), 0),
    );
    const itemQty = items.reduce((sum, item) => sum + num(item.quantity), 0);
    if (!items.length) {
      checks.push(
        check(
          'Sale items',
          'FAIL',
          'The sale has no items',
          'The items were not saved; check the logs for the request that created this sale.',
        ),
      );
    } else {
      const valueOk =
        sameAmount(itemValue, sale.subtotal) ||
        sameAmount(itemValue, sale.totalValue);
      checks.push(
        valueOk
          ? check(
              'Item value',
              'PASS',
              `${items.length} items worth ${itemValue} match the sale`,
            )
          : check(
              'Item value',
              'FAIL',
              `Items total ${itemValue} but the sale says subtotal ${sale.subtotal} / total ${sale.totalValue}`,
              'An item was added or changed without recalculating the sale totals.',
            ),
      );
      checks.push(
        itemQty === num(sale.totalQty)
          ? check(
              'Item quantity',
              'PASS',
              `${itemQty} pieces in items and on the sale`,
            )
          : check(
              'Item quantity',
              'WARN',
              `Items have ${itemQty} pieces, the sale says ${sale.totalQty}`,
            ),
      );
    }

    // 2. Stock taken off the van exactly once per product
    // Reversed transactions (e.g. by the duplicate-deduction repair) no longer count.
    const saleTx = transactions.filter(
      (tx) => tx.transactionType === 'SALE' && tx.status !== 'REVERSED',
    );
    const deductedByProduct = new Map<string, { qty: number; count: number }>();
    for (const tx of saleTx) {
      const entry = deductedByProduct.get(String(tx.productId)) ?? {
        qty: 0,
        count: 0,
      };
      entry.qty += num(tx.quantity) * (tx.direction === 'IN' ? -1 : 1);
      entry.count += 1;
      deductedByProduct.set(String(tx.productId), entry);
    }
    const stockRows = items.map((item) => {
      const deducted = deductedByProduct.get(String(item.productId));
      const expected = num(item.quantity) - num(item.returnQty);
      return {
        productId: item.productId,
        productName: item.productName,
        sold: expected,
        deducted: deducted?.qty ?? 0,
        transactions: deducted?.count ?? 0,
        result: !deducted
          ? 'NOT DEDUCTED'
          : deducted.count > 1
            ? 'DEDUCTED TWICE'
            : deducted.qty === expected
              ? 'OK'
              : 'DIFFERENT',
      };
    });
    const extraProducts = [...deductedByProduct.keys()].filter(
      (productId) =>
        !items.some((item) => String(item.productId) === productId),
    );
    const notDeducted = stockRows.filter(
      (row) => row.result === 'NOT DEDUCTED',
    );
    const twice = stockRows.filter((row) => row.result === 'DEDUCTED TWICE');
    const different = stockRows.filter((row) => row.result === 'DIFFERENT');
    if (!items.length) {
      // nothing to compare
    } else if (twice.length) {
      checks.push(
        check(
          'Van stock deducted',
          'FAIL',
          `Stock was deducted more than once for ${twice.map((row) => row.productName ?? row.productId).join(', ')}`,
          'A retried request deducted stock again. Reverse the extra transaction and correct the van stock.',
        ),
      );
    } else if (notDeducted.length) {
      checks.push(
        check(
          'Van stock deducted',
          'FAIL',
          `No stock deduction for ${notDeducted.map((row) => row.productName ?? row.productId).join(', ')}`,
          'The van still shows this stock as available; post a SALE transaction for it.',
        ),
      );
    } else if (different.length) {
      checks.push(
        check(
          'Van stock deducted',
          'WARN',
          `Deducted quantity differs for ${different.map((row) => row.productName ?? row.productId).join(', ')}`,
          'Check returns and scheme free goods on these lines.',
        ),
      );
    } else {
      checks.push(
        check(
          'Van stock deducted',
          'PASS',
          `Every item was deducted exactly once (${saleTx.length} transactions)`,
        ),
      );
    }
    if (extraProducts.length) {
      checks.push(
        check(
          'Extra stock movements',
          'INFO',
          `Stock also moved for products not on the sale: ${extraProducts.join(', ')} (usually scheme free goods)`,
        ),
      );
    }

    // 3. Payment
    const allocated = round2(
      payments.reduce(
        (sum, payment) =>
          sum +
          (payment.sales ?? [])
            .filter((row: any) => row.saleId === saleId)
            .reduce((s: number, row: any) => s + num(row.amount), 0),
        0,
      ),
    );
    if (sale.paymentStatus === 'PAID' || num(sale.paidAmount) > 0) {
      checks.push(
        !payments.length
          ? check(
              'Payment',
              'FAIL',
              `The sale says ${sale.paidAmount} was paid, but no payment record points to it`,
              'The payment was not saved; the outlet balance will be wrong.',
            )
          : sameAmount(allocated, sale.paidAmount)
            ? check(
                'Payment',
                'PASS',
                `${allocated} collected across ${payments.length} payment(s)`,
              )
            : check(
                'Payment',
                'FAIL',
                `Payments allocate ${allocated} to this sale, but the sale says ${sale.paidAmount} was paid`,
              ),
      );
    } else {
      checks.push(
        check(
          'Payment',
          'INFO',
          `Unpaid (${sale.paymentStatus}); pending ${sale.pendingAmount ?? sale.totalValue}`,
        ),
      );
    }
    if (
      !sameAmount(
        num(sale.paidAmount) + num(sale.pendingAmount),
        sale.totalValue,
      )
    ) {
      checks.push(
        check(
          'Paid + pending',
          'WARN',
          `Paid ${sale.paidAmount} + pending ${sale.pendingAmount} ≠ total ${sale.totalValue}`,
        ),
      );
    }

    // 4. Visit
    if (!sale.visitId)
      checks.push(check('Shop visit', 'WARN', 'The sale has no visit ID'));
    else if (!visit)
      checks.push(
        check(
          'Shop visit',
          'FAIL',
          `Visit ${sale.visitId} does not exist`,
          'The sale will be missing from visit and route reports.',
        ),
      );
    else
      checks.push(
        check(
          'Shop visit',
          visit.status === 'COMPLETED' ? 'PASS' : 'WARN',
          `Visit ${visit.visitId} is ${visit.status}`,
          visit.status === 'COMPLETED'
            ? undefined
            : 'The salesman never checked out of this visit.',
          { feature: 'day', id: String(visit.workSessionId) },
        ),
      );

    // 5. Duplicates from retries
    if (sameCheckout > 1) {
      checks.push(
        check(
          'Duplicate submission',
          'FAIL',
          `${sameCheckout} sales share checkout ID ${sale.clientSaleId}`,
          'The same checkout was saved more than once; keep one and delete the others.',
        ),
      );
    }

    // 6. Phone → server, then server → ERP
    checks.push(
      await dataSyncCheck(db, sale, [
        saleId,
        String(sale.uuid ?? ''),
        String(sale.clientSaleId ?? ''),
      ]),
    );
    checks.push(erpCheck('ERP sync', sale));
    offerRepair(checks, 'ERP sync', repair('RETRY_ERP_SALE', saleId));
    if (twice.length)
      offerRepair(
        checks,
        'Van stock deducted',
        repair('REVERSE_DUPLICATE_DEDUCTION', saleId),
        ['FAIL'],
      );

    return {
      feature: 'sales',
      id: saleId,
      found: true,
      title: `Sale ${saleId}`,
      subtitle: `${sale.customerName ?? sale.customerId} · van ${sale.vanName ?? sale.vanId} · ${new Date(sale.date).toLocaleString()} · ${sale.totalValue}`,
      checks,
      sections: [
        { key: 'sale', title: 'Sale', kind: 'record', record: clean(sale) },
        {
          key: 'stock',
          title: 'Stock deduction per item',
          kind: 'table',
          columns: [
            'productName',
            'sold',
            'deducted',
            'transactions',
            'result',
          ],
          rows: stockRows,
        },
        {
          key: 'items',
          title: 'Items',
          kind: 'table',
          columns: [
            'productName',
            'caseQty',
            'pieceQty',
            'quantity',
            'returnQty',
            'totalValue',
          ],
          rows: items.map(clean) as any,
        },
        {
          key: 'transactions',
          title: 'Stock transactions',
          kind: 'table',
          columns: [
            'transactionDate',
            'transactionType',
            'direction',
            'productId',
            'quantity',
            'status',
          ],
          rows: transactions.map(clean) as any,
        },
        {
          key: 'payments',
          title: 'Payments',
          kind: 'table',
          columns: ['paymentId', 'date', 'amount', 'paymentMode', 'status'],
          rows: payments.map(clean) as any,
          linkColumn: { column: 'paymentId', feature: 'payment' },
        },
        await auditSection(db, saleId),
        await offlineSyncSection(
          db,
          [
            saleId,
            String(sale.uuid ?? ''),
            String(sale.clientSaleId ?? ''),
          ].filter(Boolean),
        ),
        await logsSection(db, {
          mentions: [saleId, sale.clientSaleId].filter(Boolean),
        }),
      ],
      links: {
        logs: { search: saleId },
        syncOwnerId: salesmanId,
        audit: { module: 'sales', record: saleId },
      },
    };
  },

  async scan(db: Db, since: Date): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];
    const sales = db.collection('sales');

    const erpFailed = await sales
      .find(
        {
          erpSyncStatus: 'FAILED',
          isDeleted: { $ne: true },
          date: { $gte: since },
        },
        { projection: { saleId: 1, erpSyncError: 1, date: 1 } },
      )
      .sort({ date: -1 })
      .limit(100)
      .toArray();
    for (const sale of erpFailed) {
      findings.push({
        severity: 'FAIL',
        problem: 'ERP sync failed',
        detail: String(sale.erpSyncError ?? 'no error recorded'),
        time: sale.date,
        target: { feature: 'sales', id: sale.saleId },
      });
    }

    const withoutItems = await sales
      .aggregate([
        { $match: { isDeleted: { $ne: true }, date: { $gte: since } } },
        {
          $lookup: {
            from: 'sale_items',
            localField: 'saleId',
            foreignField: 'saleId',
            as: 'items',
          },
        },
        { $match: { items: { $size: 0 } } },
        { $project: { saleId: 1, date: 1 } },
        { $limit: 100 },
      ])
      .toArray();
    for (const sale of withoutItems) {
      findings.push({
        severity: 'FAIL',
        problem: 'Sale has no items',
        detail: 'Items were not saved with the sale',
        time: sale.date,
        target: { feature: 'sales', id: sale.saleId },
      });
    }

    const withoutStock = await sales
      .aggregate([
        { $match: { isDeleted: { $ne: true }, date: { $gte: since } } },
        {
          $lookup: {
            from: 'inventory_transactions',
            localField: 'saleId',
            foreignField: 'referenceNo',
            as: 'tx',
          },
        },
        { $match: { tx: { $size: 0 } } },
        { $project: { saleId: 1, date: 1 } },
        { $limit: 100 },
      ])
      .toArray();
    for (const sale of withoutStock) {
      findings.push({
        severity: 'FAIL',
        problem: 'Stock not deducted',
        detail: 'No stock transaction references this sale',
        time: sale.date,
        target: { feature: 'sales', id: sale.saleId },
      });
    }

    const doubleDeducted = await db
      .collection('inventory_transactions')
      .aggregate([
        {
          $match: {
            transactionType: 'SALE',
            status: { $ne: 'REVERSED' },
            isDeleted: { $ne: true },
            transactionDate: { $gte: since },
          },
        },
        {
          $group: {
            _id: { saleId: '$referenceNo', productId: '$productId' },
            count: { $sum: 1 },
            time: { $max: '$transactionDate' },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of doubleDeducted) {
      findings.push({
        severity: 'FAIL',
        problem: 'Stock deducted twice',
        detail: `Product ${row._id.productId} deducted ${row.count} times`,
        time: row.time,
        target: { feature: 'sales', id: row._id.saleId },
      });
    }

    const duplicates = await sales
      .aggregate([
        {
          $match: {
            clientSaleId: { $exists: true, $ne: null },
            isDeleted: { $ne: true },
            date: { $gte: since },
          },
        },
        {
          $group: {
            _id: '$clientSaleId',
            count: { $sum: 1 },
            saleId: { $first: '$saleId' },
            time: { $max: '$date' },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of duplicates) {
      findings.push({
        severity: 'FAIL',
        problem: 'Duplicate sale',
        detail: `${row.count} sales share checkout ID ${row._id}`,
        time: row.time,
        target: { feature: 'sales', id: row.saleId },
      });
    }

    const paidWithoutPayment = await sales
      .aggregate([
        {
          $match: {
            paymentStatus: 'PAID',
            isDeleted: { $ne: true },
            date: { $gte: since },
          },
        },
        {
          $lookup: {
            from: 'payments',
            localField: 'saleId',
            foreignField: 'sales.saleId',
            as: 'payments',
          },
        },
        { $match: { payments: { $size: 0 } } },
        { $project: { saleId: 1, date: 1, paidAmount: 1 } },
        { $limit: 100 },
      ])
      .toArray();
    for (const sale of paidWithoutPayment) {
      findings.push({
        severity: 'FAIL',
        problem: 'Paid sale without payment',
        detail: `Marked paid (${sale.paidAmount}) but no payment record`,
        time: sale.date,
        target: { feature: 'sales', id: sale.saleId },
      });
    }

    return findings;
  },
};
