/**
 * Expense integration test (real MongoDB)
 * ---------------------------------------
 *   EXPENSE_IT_MONGO_URI="mongodb://localhost:27017/?replicaSet=rs0&directConnection=true" \
 *   npm run test:expense-integration
 *
 * Runs outside Jest (the Mongo driver handshake fails inside Jest's VM sandbox).
 * Uses a throwaway database sfa_expense_it_<timestamp> and drops it afterwards.
 * Needs a replica set: withdrawal-charge replace uses a transaction.
 */
import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import mongoose, { Connection } from 'mongoose';

import { RequestContextStore } from '../src/core/context/request-context';
import { MongoService } from '../src/core/database/mongo/mongo.service';
import { softDeletePlugin } from '../src/core/database/mongo/plugins/soft-delete.plugin';
import { timestampsPlugin } from '../src/core/database/mongo/plugins/timestamps.plugin';
import { ExpenseService } from '../src/modules/v1/expense/expense.service';
import { ExpenseStatus, ExpenseTag } from '../src/shared/enums/expense.enums';

const URI = process.env.EXPENSE_IT_MONGO_URI;
const USER = 'IT-EMP-1';
const OTHER = 'IT-EMP-2';

const d = (y: number, m: number, day: number, h = 0) =>
  new Date(y, m - 1, day, h);

/* ---------------- controllable clock (only `new Date()` / Date.now) ----------------
 * Returns real Date instances (shared prototype) so Mongoose/BSON `instanceof Date`
 * checks keep working for values read back from the database.
 */
const RealDate = Date;
let fakeNow: number | null = null;
function ClockDate(this: unknown, ...args: unknown[]) {
  if (!new.target) return new RealDate(fakeNow ?? RealDate.now()).toString();
  return args.length
    ? new RealDate(...(args as [number]))
    : new RealDate(fakeNow ?? RealDate.now());
}
ClockDate.prototype = RealDate.prototype;
ClockDate.now = () => fakeNow ?? RealDate.now();
ClockDate.parse = RealDate.parse;
ClockDate.UTC = RealDate.UTC;
globalThis.Date = ClockDate as unknown as DateConstructor;
const at = (date: Date) => (fakeNow = date.getTime());

const asUser = <T>(userId: string, fn: () => Promise<T>) =>
  RequestContextStore.run({ userId }, fn);

const rejectsWith = async (
  p: Promise<unknown>,
  cls: new (...a: never[]) => Error,
) => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof cls, `expected ${cls.name}, got ${String(e)}`);
    return;
  }
  assert.fail(`expected ${cls.name} but promise resolved`);
};

async function main() {
  if (!URI) {
    console.log('EXPENSE_IT_MONGO_URI not set — skipping');
    return;
  }

  const dbName = `sfa_expense_it_${RealDate.now()}`;
  const connection: Connection = mongoose.createConnection(URI, {
    dbName,
    serverSelectionTimeoutMS: 5000,
  });
  connection.plugin(timestampsPlugin);
  connection.plugin(softDeletePlugin);
  await connection.asPromise();
  const col = (name: string) => connection.collection(name);

  const service = new ExpenseService(new MongoService(connection));
  await Promise.all(
    Object.values(connection.models).map((m) => m.syncIndexes()),
  );

  const present = (userId: string, ...days: Date[]) =>
    col('work_sessions').insertMany(
      days.map((day, i) => ({
        workSessionId: `WS-${userId}-${+day}-${i}`,
        userId,
        dayStartTime: new RealDate(+day + 9 * 3600e3),
        isDeleted: false,
      })),
    );

  const tests: [string, () => Promise<void>][] = [];
  const test = (name: string, fn: () => Promise<void>) =>
    tests.push([name, fn]);

  /* ---------------- seed ---------------- */
  await col('employees').insertMany([
    {
      employeeId: USER,
      name: 'Asha Banda',
      manNumber: 'MN-100',
      isDeleted: false,
    },
    {
      employeeId: OTHER,
      name: 'Joseph Phiri',
      manNumber: 'MN-200',
      expenseTag: 'UPC',
      isDeleted: false,
    },
  ]);
  await col('beat_master').insertMany([
    { beatId: 'B1', name: 'Kabwata', isDeleted: false },
    { beatId: 'B2', name: 'Matero', isDeleted: false },
    { beatId: 'B9', name: 'Old Beat', isDeleted: true },
  ]);

  /* ---------------- scenarios (run in order) ---------------- */
  test('rate needed before any request', async () => {
    at(d(2026, 11, 16, 8));
    await assert.rejects(
      asUser(USER, () => service.preview()),
      /Per day value is not configured/,
    );
  });

  test('rates upsert is idempotent; slabs replace in a transaction', async () => {
    await service.upsertRates({
      rates: [
        { expenseTag: ExpenseTag.LOCAL, perDayValue: 90 },
        { expenseTag: ExpenseTag.UPC, perDayValue: 250 },
      ],
    });
    const { data: rates } = await service.upsertRates({
      rates: [{ expenseTag: ExpenseTag.LOCAL, perDayValue: 100 }],
    });
    assert.equal(rates.length, 2);
    const local = rates.find((r) => r.expenseTag === ExpenseTag.LOCAL)!;
    assert.equal(local.perDayValue, 100);
    assert.equal(local.expenseOption, 'DAILY_EXPENSE');

    await service.replaceWithdrawalCharges({
      slabs: [{ minAmount: 0, maxAmount: 1, charge: 99 }],
    });
    const { data: slabs } = await service.replaceWithdrawalCharges({
      slabs: [
        { minAmount: 501, maxAmount: 1000, charge: 15 },
        { minAmount: 1, maxAmount: 500, charge: 10 },
        { minAmount: 1001, maxAmount: 5000, charge: 25 },
      ],
    });
    assert.deepEqual(
      slabs.map((s) => s.charge),
      [10, 15, 25],
    );
  });

  test('week 1 Monday request stores all ERP fields + remarks', async () => {
    at(d(2026, 11, 16, 8));
    const { data } = await asUser(USER, () =>
      service.create({ beatIds: ['B2', 'B1', 'B9'] }),
    );
    const s = await col('expenses').findOne({ expenseId: data.expenseId });
    assert.ok(s);
    assert.equal(s.userId, USER);
    assert.equal(s.manNumber, 'MN-100');
    assert.equal(s.employeeName, 'Asha Banda');
    assert.equal(s.expenseTag, 'LOCAL');
    assert.equal(s.status, 'PENDING');
    assert.equal(s.noOfDays, 6);
    assert.equal(s.toBeAdjustedDays, 0);
    assert.equal(s.payableDays, 6);
    assert.equal(s.perDayValue, 100);
    assert.equal(s.withdrawalCharges, 15);
    assert.equal(s.totalAmount, 615);
    assert.equal(s.remarks, 'Matero, Kabwata'); // deleted beat excluded
    assert.equal(s.isDeleted, false);
    assert.equal(+s.fromDate, +d(2026, 11, 16));
    assert.equal(+s.toDate, +d(2026, 11, 21));
    assert.equal(+s.requestedDate, +d(2026, 11, 16, 8));
    assert.ok(s.createdAt);
  });

  test('duplicate in the same week → 409', async () => {
    at(d(2026, 11, 19, 10));
    await rejectsWith(
      asUser(USER, () => service.create({})),
      ConflictException,
    );
  });

  test('UPC employee, absent Monday, requests Thursday', async () => {
    at(d(2026, 11, 19, 10));
    const { data } = await asUser(OTHER, () => service.create({}));
    assert.equal(data.expenseTag, 'UPC');
    assert.equal(data.expenseOption, 'FOOD_AND_NIGHT_STAY');
    assert.equal(+data.fromDate, +d(2026, 11, 19));
    assert.equal(data.noOfDays, 3);
    assert.equal(data.totalAmount, 750 + 15);
  });

  test('Sunday → window closed', async () => {
    at(d(2026, 11, 22, 10));
    await assert.rejects(
      asUser(USER, () => service.preview()),
      /window is closed/,
    );
  });

  test('week 2 deducts absent days of approved week 1', async () => {
    const { data: week1 } = await asUser(USER, () => service.findMine({}));
    assert.equal(week1.length, 1);
    await asUser('ADMIN-1', () =>
      service.updateStatus(week1[0].expenseId, {
        status: ExpenseStatus.APPROVED,
      }),
    );
    const approved = await col('expenses').findOne({
      expenseId: week1[0].expenseId,
    });
    assert.equal(approved!.actionBy, 'ADMIN-1');

    await present(USER, d(2026, 11, 16), d(2026, 11, 17), d(2026, 11, 18)); // Thu–Sat absent
    await present(USER, d(2026, 11, 23)); // present Monday week 2

    at(d(2026, 11, 25, 9));
    const { data } = await asUser(USER, () => service.create({}));
    assert.equal(data.noOfDays, 6);
    assert.equal(data.toBeAdjustedDays, 3);
    assert.equal(data.payableDays, 3);
    assert.equal(data.previousExpenseId, week1[0].expenseId);
    assert.equal(data.totalAmount, 310);
    assert.deepEqual(
      data.adjustedDates.map((x) => +x),
      [d(2026, 11, 19), d(2026, 11, 20), d(2026, 11, 21)].map((x) => +x),
    );
  });

  test('invalid status change → 400', async () => {
    const { data } = await asUser(USER, () =>
      service.findMine({ status: ExpenseStatus.APPROVED }),
    );
    await assert.rejects(
      service.updateStatus(data[0].expenseId, {
        status: ExpenseStatus.REJECTED,
      }),
      /Invalid status change/,
    );
  });

  test('ERP export: approved only, then mark synced', async () => {
    const { data: rows } = await service.erpExport({});
    assert.equal(rows.length, 1);
    assert.equal(rows[0]['Man Number'], 'MN-100');
    assert.equal(rows[0]['Employee Name'], 'Asha Banda');
    assert.equal(rows[0]['No of days'], 6);
    assert.equal(rows[0]['Total Amount'], 615);
    assert.equal(rows[0].Remarks, 'Matero, Kabwata');

    await service.updateStatus(rows[0].expenseId!, {
      status: ExpenseStatus.SYNCED_TO_ERP,
    });
    assert.equal((await service.erpExport({})).data.length, 0);
    assert.equal(
      (await service.erpExport({ status: ExpenseStatus.SYNCED_TO_ERP })).data
        .length,
      1,
    );
    const doc = await col('expenses').findOne({
      expenseId: rows[0].expenseId!,
    });
    assert.ok(doc!.erpSyncedAt instanceof RealDate);
  });

  test('reject allows re-raise in the same week', async () => {
    const { data: mine } = await asUser(OTHER, () => service.findMine({}));
    await service.updateStatus(mine[0].expenseId, {
      status: ExpenseStatus.REJECTED,
      remarks: 'Wrong week',
    });
    at(d(2026, 11, 20, 9));
    const { data } = await asUser(OTHER, () => service.create({}));
    assert.equal(data.noOfDays, 2);
  });

  test('list / search / status filter / pagination', async () => {
    const all = await service.findAll({ page: 1, limit: 2 });
    assert.equal(all.meta.total, 4);
    assert.equal(all.data.length, 2);

    const search = await service.findAll({ searchText: 'phiri' });
    assert.equal(search.data.length, 2);
    assert.ok(search.data.every((e) => e.userId === OTHER));

    const regexSafe = await service.findAll({ searchText: 'MN-(' });
    assert.equal(regexSafe.data.length, 0);

    const pending = await service.findAll({ status: ExpenseStatus.PENDING });
    assert.deepEqual(pending.data.map((e) => e.userId).sort(), [USER, OTHER]);
  });

  test('delete pending → soft deleted, then 404', async () => {
    const { data } = await service.findAll({
      status: ExpenseStatus.PENDING,
      userId: OTHER,
    });
    const id = data[0].expenseId;
    await service.delete(id);
    await rejectsWith(service.findByExpenseId(id), NotFoundException);
    const raw = await col('expenses').findOne({ expenseId: id });
    assert.equal(raw!.isDeleted, true);
  });

  /* ---------------- run ---------------- */
  let failed = 0;
  try {
    for (const [name, fn] of tests) {
      try {
        await fn();
        console.log(`  ✓ ${name}`);
      } catch (e) {
        failed++;
        console.log(`  ✗ ${name}\n    ${(e as Error).message}`);
      }
    }
  } finally {
    fakeNow = null;
    await connection.dropDatabase();
    await connection.close();
  }

  console.log(
    `\n${tests.length - failed}/${tests.length} passed (db ${dbName} dropped)`,
  );
  if (failed) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
