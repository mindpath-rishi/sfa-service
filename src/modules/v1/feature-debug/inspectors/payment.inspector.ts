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
  logsSection,
  num,
  round2,
  sameAmount,
} from './shared';

/** A payment and the sales it settles. */
export const paymentInspector: FeatureInspector = {
  key: 'payment',
  label: 'Payments',
  description:
    'Allocation to sales, and whether those sales agree they were paid',
  idLabel: 'Payment ID',
  idPlaceholder: 'PID82957919',

  async inspect(db: Db, { id }): Promise<DebugReport> {
    const payment = await db.collection('payments').findOne({ paymentId: id });
    if (!payment) {
      return {
        feature: 'payment',
        id,
        found: false,
        title: `Payment ${id} not found`,
        checks: [check('Payment exists', 'FAIL', 'No payment with this ID')],
        sections: [],
        links: { logs: { search: id } },
      };
    }

    const allocations: { saleId: string; amount: number }[] = (
      payment.sales ?? []
    ).filter((row: any) => !row.isDeleted);
    const sales = await db
      .collection('sales')
      .find({ saleId: { $in: allocations.map((row) => row.saleId) } })
      .toArray();
    const checks: DebugCheck[] = [];

    checks.push(
      check(
        'Status',
        payment.status === 'SUCCESS' ? 'PASS' : 'WARN',
        `${payment.status} · ${payment.paymentMode} · ${payment.amount}`,
      ),
    );
    checks.push(
      await dataSyncCheck(db, payment, [
        String(payment.paymentId),
        String(payment.uuid ?? ''),
      ]),
    );

    const allocated = round2(
      allocations.reduce((sum, row) => sum + num(row.amount), 0),
    );
    checks.push(
      !allocations.length
        ? check(
            'Allocation',
            'WARN',
            'The payment is not allocated to any sale',
            'It counts as an advance; the outlet balance may look wrong.',
          )
        : sameAmount(allocated, payment.amount)
          ? check(
              'Allocation',
              'PASS',
              `${allocated} allocated across ${allocations.length} sale(s)`,
            )
          : check(
              'Allocation',
              'FAIL',
              `Allocated ${allocated} but the payment is ${payment.amount}`,
              'Part of the money is not linked to any sale, or a sale got more than was paid.',
            ),
    );

    const rows = allocations.map((row) => {
      const sale = sales.find((entry) => entry.saleId === row.saleId);
      return {
        saleId: row.saleId,
        allocated: num(row.amount),
        saleTotal: sale ? num(sale.totalValue) : '—',
        salePaid: sale ? num(sale.paidAmount) : '—',
        salePending: sale ? num(sale.pendingAmount) : '—',
        result: !sale
          ? 'SALE MISSING'
          : sale.isDeleted
            ? 'SALE DELETED'
            : num(sale.paidAmount) + 0.01 < num(row.amount)
              ? 'SALE SHOWS LESS PAID'
              : 'OK',
      };
    });
    const broken = rows.filter((row) => row.result !== 'OK');
    if (allocations.length) {
      checks.push(
        broken.length
          ? check(
              'Sales agree',
              'FAIL',
              broken.map((row) => `${row.saleId}: ${row.result}`).join('; '),
              'The payment and the sale disagree on what was paid.',
            )
          : check(
              'Sales agree',
              'PASS',
              'Every sale records at least the amount allocated to it',
            ),
      );
    }

    return {
      feature: 'payment',
      id,
      found: true,
      title: `Payment ${id}`,
      subtitle: `${payment.customerId} · van ${payment.vanId} · ${new Date(payment.date).toLocaleString()}`,
      checks,
      sections: [
        {
          key: 'allocations',
          title: 'Allocated sales',
          kind: 'table',
          columns: [
            'saleId',
            'allocated',
            'saleTotal',
            'salePaid',
            'salePending',
            'result',
          ],
          rows,
          linkColumn: { column: 'saleId', feature: 'sales' },
        },
        {
          key: 'payment',
          title: 'Payment',
          kind: 'record',
          record: clean({ ...payment, sales: undefined }),
        },
        await auditSection(db, id),
        await logsSection(db, { mentions: [id] }),
      ],
      links: {
        logs: { search: id },
        syncOwnerId: payment.employeeId,
        audit: { record: id },
      },
    };
  },

  async scan(db: Db, since: Date): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];

    const mismatched = await db
      .collection('payments')
      .aggregate([
        { $match: { isDeleted: { $ne: true }, date: { $gte: since } } },
        {
          $project: {
            paymentId: 1,
            amount: 1,
            date: 1,
            allocated: { $sum: '$sales.amount' },
            count: { $size: { $ifNull: ['$sales', []] } },
          },
        },
        {
          $match: {
            count: { $gt: 0 },
            $expr: {
              $gt: [{ $abs: { $subtract: ['$allocated', '$amount'] } }, 0.01],
            },
          },
        },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of mismatched) {
      findings.push({
        severity: 'FAIL',
        problem: 'Allocation ≠ amount',
        detail: `Allocated ${round2(row.allocated)} of ${row.amount}`,
        time: row.date,
        target: { feature: 'payment', id: row.paymentId },
      });
    }

    const missingSale = await db
      .collection('payments')
      .aggregate([
        { $match: { isDeleted: { $ne: true }, date: { $gte: since } } },
        { $unwind: '$sales' },
        {
          $lookup: {
            from: 'sales',
            localField: 'sales.saleId',
            foreignField: 'saleId',
            as: 'sale',
          },
        },
        { $match: { sale: { $size: 0 } } },
        { $project: { paymentId: 1, date: 1, saleId: '$sales.saleId' } },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of missingSale) {
      findings.push({
        severity: 'FAIL',
        problem: 'Payment for missing sale',
        detail: `Allocated to ${row.saleId}, which does not exist`,
        time: row.date,
        target: { feature: 'payment', id: row.paymentId },
      });
    }

    return findings;
  },
};
