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
  endOfDay,
  logsSection,
  num,
  offerRepair,
  startOfDay,
} from './shared';
import { repair } from '../repairs';

/** One salesman's working day: start/end, routes, visits, sales and van stock. */
export const dayInspector: FeatureInspector = {
  key: 'day',
  label: 'Day (work session)',
  description:
    'Day start/end, route sessions, visits, sales and the day stock balance',
  idLabel: 'Work session ID or salesman ID',
  idPlaceholder: 'WID68740105, or EID24343401 with a date',
  acceptsDate: true,

  async inspect(db: Db, { id, date }): Promise<DebugReport> {
    const sessions = db.collection('work_sessions');
    const session =
      (await sessions.findOne({ workSessionId: id })) ??
      (await sessions.findOne(
        {
          userId: id,
          dayStartTime: { $gte: startOfDay(date), $lt: endOfDay(date) },
        },
        { sort: { dayStartTime: -1 } },
      ));

    if (!session) {
      return {
        feature: 'day',
        id,
        found: false,
        title: `No work session for ${id}${date ? ` on ${date}` : ' today'}`,
        checks: [
          check(
            'Day started',
            'FAIL',
            'No work session found',
            'The salesman did not start the day, or the day start is still waiting to sync from the phone.',
            { feature: 'sync', id },
          ),
        ],
        sections: [
          await logsSection(db, {
            userId: id,
            from: startOfDay(date),
            to: endOfDay(date),
          }),
        ],
        links: { logs: { userId: id }, syncOwnerId: id },
      };
    }

    const workSessionId = String(session.workSessionId);
    const userId = String(session.userId);
    const from = new Date(session.dayStartTime);
    const to = session.dayEndTime ? new Date(session.dayEndTime) : new Date();

    const [
      routes,
      visits,
      sales,
      nonSales,
      dailyStock,
      inventory,
      transactions,
      unloads,
      openInteractions,
      tracking,
    ] = await Promise.all([
      db
        .collection('route_sessions')
        .find({ workSessionId })
        .sort({ startTime: 1 })
        .toArray(),
      db
        .collection('shop_visits')
        .find({ workSessionId, isDeleted: { $ne: true } })
        .sort({ checkInTime: 1 })
        .toArray(),
      db
        .collection('sales')
        .find({
          vanId: session.vanId,
          date: { $gte: from, $lte: to },
          isDeleted: { $ne: true },
        })
        .toArray(),
      db.collection('non_sale').countDocuments({
        employeeId: userId,
        createdAt: { $gte: from, $lte: to },
        isDeleted: { $ne: true },
      }),
      db
        .collection('van_daily_stock')
        .find({ workSessionId, isDeleted: { $ne: true } })
        .toArray(),
      db
        .collection('inventories')
        .find({ vanId: session.vanId, isDeleted: { $ne: true } })
        .toArray(),
      db
        .collection('inventory_transactions')
        .find({
          vanId: session.vanId,
          transactionDate: { $gte: from, $lte: to },
          isDeleted: { $ne: true },
        })
        .toArray(),
      db.collection('stock_unload_requests').find({ workSessionId }).toArray(),
      db
        .collection('interaction_logs')
        .countDocuments({ workSessionId, status: 'ARRIVED' }),
      db
        .collection('live_location_points')
        .countDocuments({ 'm.workSessionId': workSessionId }),
    ]);

    const checks: DebugCheck[] = [];
    const startedToday = startOfDay(from).getTime() === startOfDay().getTime();

    // Day lifecycle
    if (session.status === 'COMPLETED') {
      checks.push(
        check(
          'Day status',
          'PASS',
          `Started ${from.toLocaleString()}, ended ${to.toLocaleString()}`,
        ),
      );
    } else if (!startedToday) {
      checks.push(
        check(
          'Day status',
          'FAIL',
          `Still ${session.status} although it started on ${from.toDateString()}`,
          'The day was never ended. The salesman cannot start a new day cleanly; end it from the app or MIS.',
        ),
      );
    } else {
      checks.push(
        check(
          'Day status',
          'INFO',
          `${session.status} since ${from.toLocaleString()}`,
        ),
      );
    }
    checks.push(
      await dataSyncCheck(db, session, [
        workSessionId,
        String(session.uuid ?? ''),
      ]),
    );

    // Routes
    const activeRoutes = routes.filter(
      (route) => route.status === 'ACTIVE' && route.isDeleted !== true,
    );
    if (!routes.length)
      checks.push(
        check('Route session', 'WARN', 'No route was started this day'),
      );
    else if (activeRoutes.length > 1)
      checks.push(
        check(
          'Route session',
          'FAIL',
          `${activeRoutes.length} route sessions are ACTIVE at once`,
          'Only one route can be active; complete the older ones.',
        ),
      );
    else
      checks.push(
        check(
          'Route session',
          'PASS',
          routes
            .map(
              (route) =>
                `${route.routeName ?? route.routeId} (${route.status}, ${route.visitedShops ?? 0}/${route.totalShops ?? 0} shops)`,
            )
            .join('; '),
        ),
      );

    // Visits
    const openVisits = visits.filter(
      (visit) => !visit.checkOutTime && visit.status !== 'COMPLETED',
    );
    checks.push(
      openVisits.length && session.status === 'COMPLETED'
        ? check(
            'Visits',
            'WARN',
            `${openVisits.length} of ${visits.length} visits were never checked out`,
            'These visits have no outcome and will look incomplete in reports.',
          )
        : check(
            'Visits',
            'PASS',
            `${visits.length} visits, ${sales.length} sales, ${nonSales} non-sales`,
          ),
    );
    if (openInteractions && session.status === 'COMPLETED') {
      checks.push(
        check(
          'Open arrivals',
          'WARN',
          `${openInteractions} shop arrival(s) still marked ARRIVED after the day ended`,
        ),
      );
    }

    // Day stock: opening + in − out + adjustment = closing
    const badRows = dailyStock.filter(
      (row) =>
        num(row.openingQty) +
          num(row.inQty) -
          num(row.outQty) +
          num(row.adjustmentQty) !==
        num(row.closingQty),
    );
    if (!dailyStock.length) {
      checks.push(
        check(
          'Day stock',
          'WARN',
          'No day stock rows for this session',
          'Stock loaded or sold this day is not tracked per day.',
        ),
      );
    } else if (badRows.length) {
      checks.push(
        check(
          'Day stock arithmetic',
          'FAIL',
          `${badRows.length} product(s) where opening + in − out + adjustment ≠ closing`,
          'A stock movement updated one figure but not the other.',
        ),
      );
    } else {
      checks.push(
        check(
          'Day stock arithmetic',
          'PASS',
          `All ${dailyStock.length} products balance`,
        ),
      );
    }

    // Day stock vs the van's live stock (only meaningful while the day is open)
    const stockByProduct = new Map(
      inventory.map((row) => [String(row.productId), num(row.quantity)]),
    );
    const txByProduct = new Map<string, { in: number; out: number }>();
    for (const tx of transactions) {
      const entry = txByProduct.get(String(tx.productId)) ?? { in: 0, out: 0 };
      if (tx.direction === 'IN') entry.in += num(tx.quantity);
      else entry.out += num(tx.quantity);
      txByProduct.set(String(tx.productId), entry);
    }
    const stockRows = dailyStock.map((row) => {
      const tx = txByProduct.get(String(row.productId)) ?? { in: 0, out: 0 };
      const vanStock = stockByProduct.get(String(row.productId));
      return {
        productId: row.productId,
        opening: num(row.openingQty),
        in: num(row.inQty),
        out: num(row.outQty),
        adjustment: num(row.adjustmentQty),
        closing: num(row.closingQty),
        balances:
          num(row.openingQty) +
            num(row.inQty) -
            num(row.outQty) +
            num(row.adjustmentQty) ===
          num(row.closingQty)
            ? 'yes'
            : 'NO',
        movementsIn: tx.in,
        movementsOut: tx.out,
        vanStockNow: vanStock ?? '—',
      };
    });
    if (session.status !== 'COMPLETED' && dailyStock.length) {
      const mismatched = stockRows.filter(
        (row) => row.vanStockNow !== '—' && row.vanStockNow !== row.closing,
      );
      checks.push(
        mismatched.length
          ? check(
              'Day stock vs van stock',
              'FAIL',
              `${mismatched.length} product(s) where today's closing differs from the van's current stock`,
              'Something changed van stock without a day stock entry (or the reverse). Compare the movements below.',
            )
          : check(
              'Day stock vs van stock',
              'PASS',
              "Today's closing matches the van's current stock",
            ),
      );
    }
    const movementMismatch = stockRows.filter(
      (row) => row.movementsOut !== row.out || row.movementsIn !== row.in,
    );
    if (movementMismatch.length) {
      checks.push(
        check(
          'Day stock vs movements',
          'WARN',
          `${movementMismatch.length} product(s) where day in/out differs from the stock transactions`,
          'Usually an offline sale or top-up that updated one side only.',
        ),
      );
    }

    // Day end
    if (session.status === 'COMPLETED') {
      checks.push(
        unloads.length
          ? check(
              'Unload request',
              'PASS',
              unloads
                .map((unload) => `${unload.unloadRequestId} ${unload.status}`)
                .join('; '),
            )
          : check(
              'Unload request',
              'INFO',
              'No unload request (stock carried forward, or nothing to unload)',
            ),
      );
    }

    // Tracking
    const points = tracking;
    checks.push(
      points
        ? check(
            'Location tracking',
            'PASS',
            `${points} location points recorded`,
          )
        : check(
            'Location tracking',
            'WARN',
            'No location points for this day',
            'Location permission may be off on the phone, or the app was killed in the background.',
          ),
    );

    // Offline sync problems during the day
    const syncFailures = await db
      .collection('offline_sync_audit_logs')
      .countDocuments({
        ownerId: userId,
        status: 'FAILED',
        createdAt: { $gte: from, $lte: to },
      });
    if (syncFailures) {
      checks.push(
        check(
          'Offline sync',
          'WARN',
          `${syncFailures} failed upload attempt(s) during this day`,
          "Some of this day's offline work may not be on the server.",
          { feature: 'sync', id: userId },
        ),
      );
    }

    offerRepair(checks, 'Day status', repair('END_DAY', workSessionId), [
      'FAIL',
    ]);
    offerRepair(checks, 'Open arrivals', repair('CLOSE_ARRIVALS', userId));

    return {
      feature: 'day',
      id: workSessionId,
      found: true,
      title: `${session.userName ?? userId} · ${from.toDateString()}`,
      subtitle: `Work session ${workSessionId} · van ${session.vanName || session.vanId}`,
      checks,
      sections: [
        {
          key: 'session',
          title: 'Work session',
          kind: 'record',
          record: clean({
            ...session,
            dayStartLocation: undefined,
            dayEndLocation: undefined,
          }),
        },
        {
          key: 'stock',
          title: 'Day stock',
          kind: 'table',
          columns: [
            'productId',
            'opening',
            'in',
            'out',
            'adjustment',
            'closing',
            'balances',
            'movementsIn',
            'movementsOut',
            'vanStockNow',
          ],
          rows: stockRows,
        },
        {
          key: 'routes',
          title: 'Route sessions',
          kind: 'table',
          columns: [
            'routeSessionId',
            'routeName',
            'status',
            'visitedShops',
            'totalShops',
            'startTime',
          ],
          rows: routes.map(clean) as any,
        },
        {
          key: 'visits',
          title: 'Visits',
          kind: 'table',
          columns: [
            'visitId',
            'outletId',
            'checkInTime',
            'checkOutTime',
            'visitType',
            'outcome',
            'status',
          ],
          rows: visits.map((visit) =>
            clean({
              ...visit,
              checkInLocation: undefined,
              customerLocation: undefined,
            }),
          ) as any,
        },
        {
          key: 'sales',
          title: 'Sales',
          kind: 'table',
          columns: [
            'saleId',
            'customerName',
            'date',
            'totalValue',
            'paymentStatus',
            'erpSyncStatus',
          ],
          rows: sales.map(clean) as any,
          linkColumn: { column: 'saleId', feature: 'sales' },
        },
        {
          key: 'unloads',
          title: 'Unload requests',
          kind: 'table',
          columns: [
            'unloadRequestId',
            'status',
            'totalQuantity',
            'totalValue',
            'createdAt',
          ],
          rows: unloads.map(clean) as any,
        },
        await auditSection(db, workSessionId),
        await logsSection(db, { userId, from, to }),
      ],
      links: {
        logs: { userId, from: from.toISOString(), to: to.toISOString() },
        syncOwnerId: userId,
        audit: { record: workSessionId },
      },
    };
  },

  async scan(db: Db, since: Date): Promise<DebugFinding[]> {
    const findings: DebugFinding[] = [];

    const neverEnded = await db
      .collection('work_sessions')
      // An open day stays a problem until someone ends it, however old, so
      // this check ignores the scan window.
      .find(
        {
          status: { $ne: 'COMPLETED' },
          dayStartTime: { $lt: startOfDay() },
          isDeleted: { $ne: true },
        },
        {
          projection: {
            workSessionId: 1,
            userName: 1,
            userId: 1,
            dayStartTime: 1,
          },
        },
      )
      .limit(100)
      .toArray();
    for (const session of neverEnded) {
      findings.push({
        severity: 'FAIL',
        problem: 'Day never ended',
        detail: `${session.userName ?? session.userId} started ${new Date(session.dayStartTime).toDateString()}`,
        time: session.dayStartTime,
        target: { feature: 'day', id: session.workSessionId },
      });
    }

    const unbalanced = await db
      .collection('van_daily_stock')
      .aggregate([
        { $match: { date: { $gte: since }, isDeleted: { $ne: true } } },
        {
          $match: {
            $expr: {
              $ne: [
                {
                  $add: [
                    { $ifNull: ['$openingQty', 0] },
                    { $ifNull: ['$inQty', 0] },
                    { $multiply: [-1, { $ifNull: ['$outQty', 0] }] },
                    { $ifNull: ['$adjustmentQty', 0] },
                  ],
                },
                { $ifNull: ['$closingQty', 0] },
              ],
            },
          },
        },
        {
          $group: {
            _id: '$workSessionId',
            products: { $sum: 1 },
            date: { $max: '$date' },
          },
        },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of unbalanced) {
      findings.push({
        severity: 'FAIL',
        problem: 'Day stock does not balance',
        detail: `${row.products} product(s) where opening + in − out ≠ closing`,
        time: row.date,
        target: { feature: 'day', id: row._id },
      });
    }

    const multiRoutes = await db
      .collection('route_sessions')
      .aggregate([
        { $match: { status: 'ACTIVE', isDeleted: { $ne: true } } },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
            workSessionId: { $last: '$workSessionId' },
            time: { $max: '$startTime' },
          },
        },
        { $match: { count: { $gt: 1 } } },
        { $limit: 100 },
      ])
      .toArray();
    for (const row of multiRoutes) {
      findings.push({
        severity: 'FAIL',
        problem: 'Several active routes',
        detail: `${row._id} has ${row.count} ACTIVE route sessions`,
        time: row.time,
        target: { feature: 'day', id: row.workSessionId },
      });
    }

    return findings;
  },
};
