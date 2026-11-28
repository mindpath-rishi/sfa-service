import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RequestContextStore } from 'src/core/context/request-context';
import { ExpenseOption, ExpenseStatus } from 'src/shared/enums/expense.enums';

import { ExpenseService } from './expense.service';
import { EXPENSE } from './expense.constants';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import {
  AssignEmployeeRateDto,
  CreateExpenseRateDto,
  ReplaceWithdrawalChargesDto,
  UpdateExpenseStatusDto,
} from './dto/expense.dto';

/* ======================================================
 * IN-MEMORY FAKES
 * ====================================================== */

type Range = { $gte?: Date | number; $lte?: Date | number; $lt?: Date };

const inRange = (value: Date | number, r: Range) => {
  const v = +value;
  if (r.$gte !== undefined && v < +r.$gte) return false;
  if (r.$lte !== undefined && v > +r.$lte) return false;
  if (r.$lt !== undefined && v >= +r.$lt) return false;
  return true;
};

/** Mongoose-like chain: .sort() / .lean() */
const chain = <T>(value: T) => {
  const q = {
    sort: () => q,
    lean: () => Promise.resolve(value),
  };
  return q;
};

type ExpenseRow = {
  expenseId: string;
  userId: string;
  status: ExpenseStatus;
  weekStart?: Date;
  fromDate?: Date;
  toDate?: Date;
  isDeleted?: boolean;
  [key: string]: unknown;
};

type ExpenseFilter = {
  expenseId?: string;
  userId?: string;
  status?: { $ne: ExpenseStatus };
  weekStart?: Date | { $lt: Date };
};

type ListFilter = {
  userId?: string;
  requestedDate: { $gte: Date; $lte: Date };
  $or: { expenseId: RegExp }[];
};

const USER = 'EMP-1';

// Local dates (service works in server local time)
const d = (y: number, m: number, day: number, h = 0) =>
  new Date(y, m - 1, day, h);

// Week of Mon 23 Nov 2026 → Sat 28 Nov 2026
const MON = d(2026, 11, 23);
const PREV_MON = d(2026, 11, 16);
const PREV_SAT = d(2026, 11, 21);

describe('ExpenseService', () => {
  let service: ExpenseService;

  let employees: Record<string, unknown>[];
  type RateRow = {
    rateId: string;
    name: string;
    expenseOption: ExpenseOption;
    perDayValue: number;
    isDefault?: boolean;
    expenseTag?: string;
  };
  let rates: RateRow[];
  let slabs: { minAmount: number; maxAmount: number; chargePercent: number }[];
  let sessions: { userId: string; dayStartTime: Date }[];
  let routeSessions: {
    userId: string;
    routeId: string;
    routeName?: string;
    sessionDate: Date;
    startTime: Date;
  }[];
  let expenses: ExpenseRow[];

  let repoSave: jest.SpyInstance;
  let repoUpdateOne: jest.SpyInstance;
  let repoSoftDelete: jest.SpyInstance;
  let repoFindLean: jest.SpyInstance<Promise<unknown>, unknown[]>;
  let chargeModel: Record<string, jest.Mock>;
  let rateModel: Record<string, jest.Mock>;
  let employeeModel: Record<string, jest.Mock>;

  const at = (date: Date) => jest.setSystemTime(date);

  const run = <T>(fn: () => Promise<T>, userId: string | null = USER) =>
    RequestContextStore.run({ userId: userId ?? undefined }, fn);

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });

    employees = [
      { employeeId: USER, name: 'Asha Banda', manNumber: 'MN-100' },
      {
        employeeId: 'EMP-UPC',
        name: 'Joseph Phiri',
        manNumber: 'MN-200',
        expenseRateId: 'R-UPC',
      },
    ];
    rates = [
      {
        rateId: 'R-LOCAL',
        name: 'Local',
        expenseOption: ExpenseOption.DAILY_EXPENSE,
        perDayValue: 100,
        isDefault: true,
        expenseTag: 'LOCAL',
      },
      {
        rateId: 'R-UPC',
        name: 'UPC',
        expenseOption: ExpenseOption.FOOD_AND_NIGHT_STAY,
        perDayValue: 250,
        expenseTag: 'UPC',
      },
    ];
    slabs = [
      { minAmount: 1, maxAmount: 500, chargePercent: 2 },
      { minAmount: 501, maxAmount: 1000, chargePercent: 2.5 },
      { minAmount: 1001, maxAmount: 5000, chargePercent: 3 },
    ];
    sessions = [];
    routeSessions = [];
    expenses = [];

    employeeModel = {
      findOne: jest.fn((f: { employeeId: string }) =>
        chain(employees.find((e) => e.employeeId === f.employeeId) ?? null),
      ),
      aggregate: jest.fn().mockResolvedValue([{ _id: 'R-UPC', count: 1 }]),
      countDocuments: jest.fn((f: { expenseRateId: string }) =>
        Promise.resolve(
          employees.filter((e) => e.expenseRateId === f.expenseRateId).length,
        ),
      ),
      updateMany: jest
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    };
    const matches = (r: RateRow, f: Record<string, unknown>) =>
      Object.entries(f).every(([k, v]) =>
        v instanceof RegExp
          ? v.test(String(r[k as keyof RateRow]))
          : v && typeof v === 'object' && '$ne' in v
            ? r[k as keyof RateRow] !== v.$ne
            : r[k as keyof RateRow] === v,
      );
    rateModel = {
      findOne: jest.fn((f: Record<string, unknown>) =>
        chain(rates.find((r) => matches(r, f)) ?? null),
      ),
      exists: jest.fn((f: Record<string, unknown>) =>
        Promise.resolve(rates.some((r) => matches(r, f)) ? { _id: 'x' } : null),
      ),
      find: jest.fn(() => chain(rates)),
      create: jest.fn((doc: RateRow) =>
        Promise.resolve({ toObject: () => doc }),
      ),
      updateMany: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({}),
      findOneAndUpdate: jest.fn(() => chain({})),
    };
    chargeModel = {
      findOne: jest.fn(
        (f: { minAmount: { $lte: number }; maxAmount: { $gte: number } }) =>
          chain(
            slabs.find(
              (s) =>
                s.minAmount <= f.minAmount.$lte &&
                s.maxAmount >= f.maxAmount.$gte,
            ) ?? null,
          ),
      ),
      find: jest.fn(() => chain(slabs)),
      deleteMany: jest.fn().mockResolvedValue({}),
      insertMany: jest.fn().mockResolvedValue([]),
    };
    const workSessionModel = {
      find: jest.fn((f: { userId: string; dayStartTime: Range }) =>
        chain(
          sessions.filter(
            (s) =>
              s.userId === f.userId && inRange(s.dayStartTime, f.dayStartTime),
          ),
        ),
      ),
      exists: jest.fn((f: { userId: string; dayStartTime: Range }) =>
        Promise.resolve(
          sessions.some(
            (s) =>
              s.userId === f.userId && inRange(s.dayStartTime, f.dayStartTime),
          )
            ? { _id: 'x' }
            : null,
        ),
      ),
    };
    const routeSessionModel = {
      find: jest.fn((f: { userId: string; sessionDate: Range }) =>
        chain(
          routeSessions
            .filter(
              (r) =>
                r.userId === f.userId && inRange(r.sessionDate, f.sessionDate),
            )
            .sort((a, b) => +a.startTime - +b.startTime),
        ),
      ),
    };

    const models: Record<string, unknown> = {
      Expense: {},
      ExpenseRate: rateModel,
      WithdrawalCharge: chargeModel,
      Employee: employeeModel,
      WorkSession: workSessionModel,
      RouteSession: routeSessionModel,
    };
    const mongo = { getModel: jest.fn((name: string) => models[name]) };

    service = new ExpenseService(mongo as unknown as MongoService);

    /* Repository methods backed by `expenses` array */
    const byId = (filter: unknown) =>
      expenses.find(
        (e) => e.expenseId === (filter as ExpenseFilter).expenseId,
      )!;

    jest.spyOn(service, 'findOne').mockImplementation((raw) => {
      const filter = raw as ExpenseFilter;
      let rows = expenses.filter((e) => !e.isDeleted);
      if (filter.expenseId)
        rows = rows.filter((e) => e.expenseId === filter.expenseId);
      if (filter.userId) rows = rows.filter((e) => e.userId === filter.userId);
      const notStatus = filter.status?.$ne;
      if (notStatus) rows = rows.filter((e) => e.status !== notStatus);
      const week = filter.weekStart;
      if (week instanceof Date) {
        rows = rows.filter((e) => +e.weekStart! === +week);
      } else if (week) {
        rows = rows
          .filter((e) => e.weekStart! < week.$lt)
          .sort((a, b) => +b.weekStart! - +a.weekStart!);
      }
      return Promise.resolve((rows[0] ?? null) as never);
    });
    repoSave = jest.spyOn(service, 'save').mockImplementation((data) => {
      expenses.push(data as ExpenseRow);
      return Promise.resolve(data as never);
    });
    repoUpdateOne = jest
      .spyOn(service, 'updateOne')
      .mockImplementation((filter, update) => {
        const row = byId(filter);
        Object.assign(row, update);
        return Promise.resolve(row as never);
      });
    repoSoftDelete = jest
      .spyOn(service, 'softDelete')
      .mockImplementation((filter) => {
        const row = byId(filter);
        row.isDeleted = true;
        return Promise.resolve(row as never);
      });
    repoFindLean = jest.spyOn(service, 'findLean').mockResolvedValue([]);
    jest
      .spyOn(service, 'withTransaction')
      .mockImplementation((cb) => cb({} as never));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const present = (...days: Date[]) =>
    sessions.push(
      ...days.map((day) => ({
        userId: USER,
        dayStartTime: new Date(+day + 9 * 3600e3),
      })),
    );

  const previousCycle = (overrides: Record<string, unknown> = {}) =>
    expenses.push({
      expenseId: 'EXP-PREV',
      userId: USER,
      weekStart: PREV_MON,
      fromDate: PREV_MON,
      toDate: PREV_SAT,
      status: ExpenseStatus.APPROVED,
      ...overrides,
    });

  /* ======================================================
   * 2. SUBMISSION WINDOW & DATE SELECTION
   * ====================================================== */

  describe('date selection', () => {
    it('defaults to Monday → Saturday when requested on Monday', async () => {
      at(d(2026, 11, 23, 8));
      const { data } = await run(() => service.preview());

      expect(data.fromDate).toEqual(MON);
      expect(data.toDate).toEqual(d(2026, 11, 28));
      expect(data.toDate.getDay()).toBe(6);
      expect(data.weekStart).toEqual(MON);
      expect(data.noOfDays).toBe(6);
    });

    it('starts from request date when absent on Monday', async () => {
      at(d(2026, 11, 25, 11)); // Wednesday
      const { data } = await run(() => service.preview());

      expect(data.fromDate).toEqual(d(2026, 11, 25));
      expect(data.toDate).toEqual(d(2026, 11, 28));
      expect(data.noOfDays).toBe(4);
    });

    it('keeps Monday as from date when present on Monday but requesting later', async () => {
      present(MON);
      at(d(2026, 11, 25, 11));
      const { data } = await run(() => service.preview());

      expect(data.fromDate).toEqual(MON);
      expect(data.noOfDays).toBe(6);
    });

    it('allows a Saturday request for a single day', async () => {
      at(d(2026, 11, 28, 16));
      const { data } = await run(() => service.preview());

      expect(data.fromDate).toEqual(d(2026, 11, 28));
      expect(data.noOfDays).toBe(1);
    });

    it('rejects requests on Sunday', async () => {
      at(d(2026, 11, 29, 10));
      await expect(run(() => service.preview())).rejects.toThrow(
        EXPENSE.WINDOW_CLOSED,
      );
    });

    it('records the request timestamp', async () => {
      const now = d(2026, 11, 23, 9);
      now.setMinutes(42);
      at(now);
      const { data } = await run(() => service.preview());
      expect(data.requestedDate).toEqual(now);
    });
  });

  /* ======================================================
   * 3. CYCLE CALCULATION ENGINE
   * ====================================================== */

  describe('cycle calculation', () => {
    beforeEach(() => at(d(2026, 11, 23, 8)));

    it('has no adjustment without a previous cycle', async () => {
      const { data } = await run(() => service.preview());
      expect(data.toBeAdjustedDays).toBe(0);
      expect(data.previousExpenseId).toBeUndefined();
      expect(data.payableDays).toBe(6);
    });

    it('deducts absent days from the previous cycle', async () => {
      previousCycle();
      // present Mon, Tue, Thu, Fri → absent Wed 18, Sat 21
      present(PREV_MON, d(2026, 11, 17), d(2026, 11, 19), d(2026, 11, 20));

      const { data } = await run(() => service.preview());

      expect(data.previousExpenseId).toBe('EXP-PREV');
      expect(data.toBeAdjustedDays).toBe(2);
      expect(data.adjustedDates).toEqual([d(2026, 11, 18), PREV_SAT]);
      expect(data.payableDays).toBe(4);
    });

    it('counts a day with multiple sessions only once', async () => {
      previousCycle();
      present(
        PREV_MON,
        PREV_MON,
        d(2026, 11, 17),
        d(2026, 11, 18),
        d(2026, 11, 19),
        d(2026, 11, 20),
        PREV_SAT,
      );
      const { data } = await run(() => service.preview());
      expect(data.toBeAdjustedDays).toBe(0);
    });

    it('uses the previous cycle range, not a full week, when it started mid-week', async () => {
      previousCycle({ fromDate: d(2026, 11, 19) }); // Thu → Sat
      present(d(2026, 11, 19));
      const { data } = await run(() => service.preview());
      expect(data.adjustedDates).toEqual([d(2026, 11, 20), PREV_SAT]);
    });

    it('ignores a rejected previous request (no advance was paid)', async () => {
      previousCycle({ status: ExpenseStatus.REJECTED });
      const { data } = await run(() => service.preview());
      expect(data.toBeAdjustedDays).toBe(0);
    });

    it('uses only the most recent previous cycle', async () => {
      previousCycle();
      expenses.push({
        expenseId: 'EXP-OLDER',
        userId: USER,
        weekStart: d(2026, 11, 9),
        fromDate: d(2026, 11, 9),
        toDate: d(2026, 11, 14),
        status: ExpenseStatus.SYNCED_TO_ERP,
      });
      const { data } = await run(() => service.preview());
      expect(data.previousExpenseId).toBe('EXP-PREV');
    });

    it('does not let payable days go below zero', async () => {
      at(d(2026, 11, 27, 8)); // Friday, absent Monday → 2 days
      previousCycle(); // fully absent → 6 days to adjust

      const { data } = await run(() => service.preview());

      expect(data.noOfDays).toBe(2);
      expect(data.toBeAdjustedDays).toBe(6);
      expect(data.payableDays).toBe(0);
      expect(data.withdrawalCharges).toBe(0);
      expect(data.totalAmount).toBe(0);
    });

    it('Total = payable × per day value + withdrawal charge (%)', async () => {
      const { data } = await run(() => service.preview());
      // 6 × 100 = 600 → slab 501–1000 → 2.5% → 15
      expect(data.withdrawalChargePercent).toBe(2.5);
      expect(data.perDayValue).toBe(100);
      expect(data.withdrawalCharges).toBe(15);
      expect(data.totalAmount).toBe(615);
    });

    it('picks the withdrawal slab on inclusive boundaries', async () => {
      rates[0].perDayValue = 500 / 6; // 6 × 83.33.. = 500 → first slab (2%)
      const { data } = await run(() => service.preview());
      expect(data.withdrawalChargePercent).toBe(2);
      expect(data.withdrawalCharges).toBe(10);
      expect(data.totalAmount).toBe(510);
    });

    it('charges nothing when no slab matches', async () => {
      rates[0].perDayValue = 10_000;
      const { data } = await run(() => service.preview());
      expect(data.withdrawalChargePercent).toBe(0);
      expect(data.withdrawalCharges).toBe(0);
      expect(data.totalAmount).toBe(60_000);
    });

    it('rounds amounts to 2 decimals', async () => {
      rates[0].perDayValue = 33.333;
      const { data } = await run(() => service.preview());
      // 6 × 33.333 = 199.998 → 200.00, slab 1–500 → 2% → +4
      expect(data.totalAmount).toBe(204);
    });

    it('rounds the percentage charge to 2 decimals', async () => {
      rates[0].perDayValue = 55.555; // 6 × 55.555 = 333.33 → 2% = 6.6666
      const { data } = await run(() => service.preview());
      expect(data.withdrawalCharges).toBe(6.67);
      expect(data.totalAmount).toBe(340);
    });
  });

  /* ======================================================
   * EMPLOYEE TAG & RATE
   * ====================================================== */

  describe('employee tag & rate', () => {
    beforeEach(() => at(d(2026, 11, 23, 8)));

    it('uses the default rate when the employee is not mapped', async () => {
      const { data } = await run(() => service.preview());
      expect(data.expenseTag).toBe('Local');
      expect(data.expenseRateId).toBe('R-LOCAL');
      expect(data.expenseOption).toBe('DAILY_EXPENSE');
    });

    it('uses the mapped rate and its option', async () => {
      const { data } = await run(() => service.preview(), 'EMP-UPC');
      expect(data.expenseTag).toBe('UPC');
      expect(data.expenseOption).toBe('FOOD_AND_NIGHT_STAY');
      expect(data.perDayValue).toBe(250);
      expect(data.totalAmount).toBe(1500 + 45); // 3% of 1500
      expect(data.manNumber).toBe('MN-200');
      expect(data.employeeName).toBe('Joseph Phiri');
    });

    it('honours a legacy UPC tag on the employee', async () => {
      employees[0].expenseTag = 'UPC';
      const { data } = await run(() => service.preview());
      expect(data.expenseRateId).toBe('R-UPC');
    });

    it('falls back to default when the mapped rate no longer exists', async () => {
      employees[0].expenseRateId = 'GONE';
      const { data } = await run(() => service.preview());
      expect(data.expenseRateId).toBe('R-LOCAL');
    });

    it('fails when nothing is mapped and no default is set', async () => {
      rates = rates.filter((r) => !r.isDefault);
      await expect(run(() => service.preview())).rejects.toThrow(
        EXPENSE.RATE_NOT_CONFIGURED,
      );
    });

    it('fails for an unknown employee', async () => {
      await expect(run(() => service.preview(), 'NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('fails without a logged-in user', async () => {
      await expect(run(() => service.preview(), null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  /* ======================================================
   * REMARKS (ROUTES WORKED)
   * ====================================================== */

  describe('remarks', () => {
    const route = (
      routeId: string,
      routeName: string | undefined,
      day: Date,
      h: number,
      userId = USER,
    ) =>
      routeSessions.push({
        userId,
        routeId,
        routeName,
        sessionDate: day,
        startTime: new Date(+day + h * 3600_000),
      });

    it('lists routes worked from fromDate to now, in order worked, without duplicates', async () => {
      at(d(2026, 11, 25, 10)); // Wed
      present(MON);
      route('R1', 'Kitwe Local', MON, 8);
      route('R2', 'Ndola', MON, 13); // mid-day route change
      route('R1', 'Kitwe Local', d(2026, 11, 24), 8);
      route('R3', undefined, d(2026, 11, 25), 8); // falls back to id
      route('R9', 'Other user', MON, 8, 'EMP-2');
      route('R8', 'Last week', PREV_SAT, 8);

      const { data } = await run(() => service.preview());
      expect(data.routeIds).toEqual(['R1', 'R2', 'R3']);
      expect(data.remarks).toBe('Kitwe Local, Ndola, R3');
    });

    it('starts from today when absent on Monday', async () => {
      at(d(2026, 11, 25, 10)); // Wed, no Monday attendance
      route('R1', 'Kitwe Local', d(2026, 11, 24), 8);
      route('R2', 'Ndola', d(2026, 11, 25), 8);

      const { data } = await run(() => service.preview());
      expect(data.remarks).toBe('Ndola');
    });

    it('is empty when no route has been started', async () => {
      at(MON);
      const { data } = await run(() => service.preview());
      expect(data.routeIds).toEqual([]);
      expect(data.remarks).toBe('');
    });
  });

  /* ======================================================
   * CREATE
   * ====================================================== */

  describe('create', () => {
    beforeEach(() => at(d(2026, 11, 23, 8)));

    it('saves a PENDING request with all ERP fields', async () => {
      routeSessions.push({
        userId: USER,
        routeId: 'R1',
        routeName: 'Kitwe Local',
        sessionDate: MON,
        startTime: d(2026, 11, 23, 7),
      });
      const res = await run(() => service.create());

      expect(res.statusCode).toBe(201);
      expect(repoSave).toHaveBeenCalledTimes(1);
      expect(expenses[0]).toMatchObject({
        userId: USER,
        manNumber: 'MN-100',
        employeeName: 'Asha Banda',
        status: ExpenseStatus.PENDING,
        noOfDays: 6,
        toBeAdjustedDays: 0,
        payableDays: 6,
        perDayValue: 100,
        withdrawalCharges: 15,
        totalAmount: 615,
        remarks: 'Kitwe Local',
        routeIds: ['R1'],
      });
      expect(expenses[0].expenseId).toMatch(/^EID\d{8}$/);
    });

    it('blocks a second request in the same week', async () => {
      await run(() => service.create());
      at(d(2026, 11, 25, 9));
      await expect(run(() => service.create())).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('allows a new request after the week’s request was rejected', async () => {
      await run(() => service.create());
      expenses[0].status = ExpenseStatus.REJECTED;
      await expect(run(() => service.create())).resolves.toMatchObject({
        statusCode: 201,
      });
      expect(expenses).toHaveLength(2);
    });

    it('allows a request in the following week and adjusts from this one', async () => {
      await run(() => service.create());
      present(MON, d(2026, 11, 24), d(2026, 11, 25)); // absent Thu, Fri, Sat
      at(d(2026, 11, 30, 8)); // next Monday

      const res = await run(() => service.create());
      expect(res.data).toMatchObject({
        toBeAdjustedDays: 3,
        payableDays: 3,
        previousExpenseId: expenses[0].expenseId,
      });
    });
  });

  /* ======================================================
   * STATUS / DELETE
   * ====================================================== */

  describe('status & delete', () => {
    const seed = (status: ExpenseStatus) =>
      expenses.push({ expenseId: 'EXP-1', userId: USER, status });

    it.each([
      [ExpenseStatus.PENDING, ExpenseStatus.APPROVED],
      [ExpenseStatus.PENDING, ExpenseStatus.REJECTED],
      [ExpenseStatus.APPROVED, ExpenseStatus.SYNCED_TO_ERP],
    ])('allows %s → %s', async (from, to) => {
      seed(from);
      await run(
        () => service.updateStatus('EXP-1', { status: to, remarks: 'ok' }),
        'ADMIN-1',
      );
      expect(expenses[0]).toMatchObject({
        status: to,
        actionBy: 'ADMIN-1',
        actionRemarks: 'ok',
      });
    });

    it.each([
      [ExpenseStatus.PENDING, ExpenseStatus.SYNCED_TO_ERP],
      [ExpenseStatus.REJECTED, ExpenseStatus.APPROVED],
      [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED],
      [ExpenseStatus.SYNCED_TO_ERP, ExpenseStatus.APPROVED],
      [ExpenseStatus.PENDING, ExpenseStatus.PENDING],
    ])('blocks %s → %s', async (from, to) => {
      seed(from);
      await expect(
        service.updateStatus('EXP-1', { status: to }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repoUpdateOne).not.toHaveBeenCalled();
    });

    it('stamps erpSyncedAt when synced', async () => {
      at(d(2026, 11, 26, 12));
      seed(ExpenseStatus.APPROVED);
      await service.updateStatus('EXP-1', {
        status: ExpenseStatus.SYNCED_TO_ERP,
      });
      expect(expenses[0].erpSyncedAt).toEqual(d(2026, 11, 26, 12));
    });

    it('404s for an unknown expense', async () => {
      await expect(
        service.updateStatus('NOPE', { status: ExpenseStatus.APPROVED }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.findByExpenseId('NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.delete('NOPE')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes only pending requests', async () => {
      seed(ExpenseStatus.APPROVED);
      await expect(service.delete('EXP-1')).rejects.toThrow(
        EXPENSE.DELETE_NOT_ALLOWED,
      );

      expenses[0].status = ExpenseStatus.PENDING;
      await service.delete('EXP-1');
      expect(repoSoftDelete).toHaveBeenCalledWith({ expenseId: 'EXP-1' });
    });
  });

  /* ======================================================
   * 4. ERP EXPORT & LISTING
   * ====================================================== */

  describe('ERP export & listing', () => {
    const row = {
      expenseId: 'EXP-1',
      manNumber: 'MN-100',
      employeeName: 'Asha Banda',
      requestedDate: d(2026, 11, 23, 8),
      fromDate: MON,
      toDate: d(2026, 11, 28),
      noOfDays: 6,
      toBeAdjustedDays: 1,
      payableDays: 5,
      perDayValue: 100,
      totalAmount: 515,
      withdrawalCharges: 15,
      remarks: 'Kabwata, Matero',
    };

    it('maps every ERP field name', async () => {
      repoFindLean.mockResolvedValue([row]);
      const { data } = await service.erpExport({});
      expect(data[0]).toEqual({
        expenseId: 'EXP-1',
        'Man Number': 'MN-100',
        'Employee Name': 'Asha Banda',
        'Requested Date': row.requestedDate,
        'From Date': row.fromDate,
        'To Date': row.toDate,
        'No of days': 6,
        'To be adjusted days': 1,
        'Payable days': 5,
        'Per Day Value': 100,
        'Total Amount': 515,
        'Withdrawal Charges': 15,
        Remarks: 'Kabwata, Matero',
      });
    });

    it('exports APPROVED by default and honours an explicit status', async () => {
      await service.erpExport({});
      expect(repoFindLean.mock.calls[0][0]).toMatchObject({
        status: ExpenseStatus.APPROVED,
      });

      await service.erpExport({ status: ExpenseStatus.SYNCED_TO_ERP });
      expect(repoFindLean.mock.calls[1][0]).toMatchObject({
        status: ExpenseStatus.SYNCED_TO_ERP,
      });
    });

    it('builds date-range and escaped search filters', async () => {
      const paginate = jest
        .spyOn(service, 'paginate')
        .mockResolvedValue({ items: [], meta: {} } as unknown as Awaited<
          ReturnType<ExpenseService['paginate']>
        >);

      await service.findAll({
        page: 1,
        limit: 20,
        searchText: 'MN-1 (a)',
        fromDate: '2026-11-01',
        toDate: '2026-11-30',
      });

      const filter = paginate.mock.calls[0][0] as ListFilter;
      expect(filter.requestedDate.$gte).toEqual(d(2026, 11, 1));
      expect(filter.requestedDate.$lte).toEqual(
        new Date(2026, 10, 30, 23, 59, 59, 999),
      );
      const regex = filter.$or[0].expenseId;
      expect(regex.test('MN-1 (a)')).toBe(true);
      expect(regex.test('MN-1 a')).toBe(false);
    });

    it('findMine is scoped to the logged-in user', async () => {
      const paginate = jest
        .spyOn(service, 'paginate')
        .mockResolvedValue({ items: [], meta: {} } as unknown as Awaited<
          ReturnType<ExpenseService['paginate']>
        >);
      await run(() => service.findMine({ userId: 'SOMEONE-ELSE' }));
      expect((paginate.mock.calls[0][0] as ListFilter).userId).toBe(USER);
    });
  });

  /* ======================================================
   * REFERENCE TABLES
   * ====================================================== */

  describe('reference tables', () => {
    it('lists rates with mapped employee counts', async () => {
      const { data } = await service.getRates();
      expect(data.map((r) => [r.name, r.employeeCount])).toEqual([
        ['Local', 0],
        ['UPC', 1],
      ]);
    });

    it('creates a named rate and moves the default flag', async () => {
      const { data } = await service.createRate({
        name: '  Metro ',
        expenseOption: ExpenseOption.DAILY_EXPENSE,
        perDayValue: 300,
        isDefault: true,
      });
      expect(data).toMatchObject({
        name: 'Metro',
        perDayValue: 300,
        isDefault: true,
      });
      expect(rateModel.updateMany).toHaveBeenCalledWith(
        { isDefault: true },
        { $set: { isDefault: false } },
      );
    });

    it('rejects a duplicate name (case-insensitive)', async () => {
      await expect(
        service.createRate({
          name: 'local',
          expenseOption: ExpenseOption.DAILY_EXPENSE,
          perDayValue: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s when updating an unknown rate', async () => {
      await expect(
        service.updateRate('NOPE', { perDayValue: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks deleting a rate mapped to employees', async () => {
      await expect(service.deleteRate('R-UPC')).rejects.toThrow(
        EXPENSE.RATE_IN_USE,
      );
      await service.deleteRate('R-LOCAL');
      expect(rateModel.deleteOne).toHaveBeenCalledWith({ rateId: 'R-LOCAL' });
    });

    it('maps and unmaps employees', async () => {
      await service.assignEmployeeRate({
        employeeIds: [USER, USER],
        expenseRateId: 'R-UPC',
      });
      expect(employeeModel.updateMany).toHaveBeenLastCalledWith(
        { employeeId: { $in: [USER] }, isDeleted: { $ne: true } },
        { $set: { expenseRateId: 'R-UPC' } },
      );
      await service.assignEmployeeRate({
        employeeIds: [USER],
        expenseRateId: null,
      });
      expect(employeeModel.updateMany).toHaveBeenLastCalledWith(
        expect.anything(),
        { $unset: { expenseRateId: 1 } },
      );
      await expect(
        service.assignEmployeeRate({
          employeeIds: [USER],
          expenseRateId: 'NOPE',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('replaces withdrawal slabs', async () => {
      const next = [{ minAmount: 0, maxAmount: 100, chargePercent: 5 }];
      await service.replaceWithdrawalCharges({ slabs: next });
      expect(chargeModel.deleteMany).toHaveBeenCalled();
      expect(chargeModel.insertMany).toHaveBeenCalledWith(next, {
        session: {},
      });
    });

    it('rejects a slab with min > max', async () => {
      await expect(
        service.replaceWithdrawalCharges({
          slabs: [{ minAmount: 200, maxAmount: 100, chargePercent: 5 }],
        }),
      ).rejects.toThrow(EXPENSE.INVALID_SLAB);
      expect(chargeModel.deleteMany).not.toHaveBeenCalled();
    });
  });
});

/* ======================================================
 * DTO VALIDATION
 * ====================================================== */

describe('Expense DTO validation', () => {
  const errors = async <T extends object>(cls: new () => T, body: unknown) =>
    (await validate(plainToInstance(cls, body) as object)).map(
      (e) => e.property,
    );

  it('UpdateExpenseStatusDto requires a valid status', async () => {
    expect(
      await errors(UpdateExpenseStatusDto, { status: 'APPROVED' }),
    ).toEqual([]);
    expect(await errors(UpdateExpenseStatusDto, { status: 'PAID' })).toEqual([
      'status',
    ]);
    expect(
      await errors(UpdateExpenseStatusDto, {
        status: 'REJECTED',
        remarks: 'x'.repeat(501),
      }),
    ).toEqual(['remarks']);
  });

  it('CreateExpenseRateDto requires label, option and value', async () => {
    expect(
      await errors(CreateExpenseRateDto, {
        name: 'Metro',
        expenseOption: 'DAILY_EXPENSE',
        perDayValue: 10,
      }),
    ).toEqual([]);
    expect(
      await errors(CreateExpenseRateDto, {
        name: '',
        expenseOption: 'X',
        perDayValue: -1,
      }),
    ).toEqual(['name', 'expenseOption', 'perDayValue']);
  });

  it('AssignEmployeeRateDto needs at least one employee', async () => {
    expect(
      await errors(AssignEmployeeRateDto, {
        employeeIds: [],
        expenseRateId: 'R',
      }),
    ).toEqual(['employeeIds']);
  });

  it('ReplaceWithdrawalChargesDto rejects negative amounts', async () => {
    expect(
      await errors(ReplaceWithdrawalChargesDto, {
        slabs: [{ minAmount: 0, maxAmount: 10, chargePercent: 1 }],
      }),
    ).toEqual([]);
    expect(
      await errors(ReplaceWithdrawalChargesDto, {
        slabs: [{ minAmount: -1, maxAmount: 10, chargePercent: 1 }],
      }),
    ).toEqual(['slabs']);
  });
});
