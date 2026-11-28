import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { HydratedDocument, Model } from 'mongoose';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import { RequestContextStore } from 'src/core/context/request-context';

import {
  Expense,
  ExpenseSchema,
} from 'src/core/database/mongo/schema/expense.schema';
import {
  ExpenseRate,
  ExpenseRateSchema,
  WithdrawalCharge,
  WithdrawalChargeSchema,
} from 'src/core/database/mongo/schema/expense-config.schema';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';
import {
  RouteSession,
  RouteSessionSchema,
} from 'src/core/database/mongo/schema/route-session.schema';

import {
  EXPENSE_OPTION_BY_TAG,
  ExpenseStatus,
  ExpenseTag,
} from 'src/shared/enums/expense.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

import { EXPENSE } from './expense.constants';
import {
  ExpenseQueryDto,
  ReplaceWithdrawalChargesDto,
  UpdateExpenseStatusDto,
  UpsertExpenseRatesDto,
} from './dto/expense.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

const ALLOWED_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  [ExpenseStatus.PENDING]: [ExpenseStatus.APPROVED, ExpenseStatus.REJECTED],
  [ExpenseStatus.APPROVED]: [ExpenseStatus.SYNCED_TO_ERP],
  [ExpenseStatus.REJECTED]: [],
  [ExpenseStatus.SYNCED_TO_ERP]: [],
};

/* ======================================================
 * DATE HELPERS (server local time)
 * ====================================================== */

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/** Calendar days between two dates, inclusive */
const inclusiveDays = (from: Date, to: Date) =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS) +
  1;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Employee tag is maintained on the employee profile; defaults to LOCAL */
type EmployeeWithTag = Employee & { expenseTag?: string };

const resolveExpenseTag = (tag?: string): ExpenseTag =>
  Object.values(ExpenseTag).includes(tag as ExpenseTag)
    ? (tag as ExpenseTag)
    : ExpenseTag.LOCAL;

@Injectable()
export class ExpenseService extends MongoRepository<Expense> {
  private readonly rateModel: Model<HydratedDocument<ExpenseRate>>;
  private readonly chargeModel: Model<HydratedDocument<WithdrawalCharge>>;
  private readonly employeeModel: Model<HydratedDocument<Employee>>;
  private readonly workSessionModel: Model<HydratedDocument<WorkSession>>;
  private readonly routeSessionModel: Model<HydratedDocument<RouteSession>>;

  constructor(mongo: MongoService) {
    super(mongo.getModel<Expense>(Expense.name, ExpenseSchema));
    this.rateModel = mongo.getModel<ExpenseRate>(
      ExpenseRate.name,
      ExpenseRateSchema,
    );
    this.chargeModel = mongo.getModel<WithdrawalCharge>(
      WithdrawalCharge.name,
      WithdrawalChargeSchema,
    );
    this.employeeModel = mongo.getModel<Employee>(
      Employee.name,
      EmployeeSchema,
    );
    this.workSessionModel = mongo.getModel<WorkSession>(
      WorkSession.name,
      WorkSessionSchema,
    );
    this.routeSessionModel = mongo.getModel<RouteSession>(
      RouteSession.name,
      RouteSessionSchema,
    );
  }

  /* ======================================================
   * REQUEST (APP)
   * ====================================================== */

  /** Prefill for the request form — computes everything without saving */
  async preview() {
    const data = await this.buildRequest(this.currentUserId());
    return { statusCode: HttpStatus.OK, message: EXPENSE.PREVIEW, data };
  }

  async create() {
    const userId = this.currentUserId();
    const data = await this.buildRequest(userId);

    const existing = await this.findOne(
      {
        userId,
        weekStart: data.weekStart,
        status: { $ne: ExpenseStatus.REJECTED },
      },
      { lean: true },
    );
    if (existing) throw new ConflictException(EXPENSE.DUPLICATE);

    const doc = await this.save({
      expenseId: IdGenerator.generate('Expense', 8),
      ...data,
      status: ExpenseStatus.PENDING,
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: EXPENSE.CREATED,
      data: doc,
    };
  }

  async findMine(query: ExpenseQueryDto) {
    return this.findAll({ ...query, userId: this.currentUserId() });
  }

  /* ======================================================
   * ADMIN
   * ====================================================== */

  async findAll(query: ExpenseQueryDto) {
    const { page = 1, limit = 20 } = query;
    const result = await this.paginate(this.buildFilter(query), {
      page,
      limit,
      sort: { requestedDate: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByExpenseId(expenseId: string) {
    const doc = await this.findOne({ expenseId }, { lean: true });
    if (!doc) throw new NotFoundException(EXPENSE.NOT_FOUND);
    return { statusCode: HttpStatus.OK, message: EXPENSE.FETCHED, data: doc };
  }

  async updateStatus(expenseId: string, dto: UpdateExpenseStatusDto) {
    const existing = await this.findOne({ expenseId }, { lean: true });
    if (!existing) throw new NotFoundException(EXPENSE.NOT_FOUND);

    if (!ALLOWED_TRANSITIONS[existing.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `${EXPENSE.INVALID_STATUS_CHANGE}: ${existing.status} → ${dto.status}`,
      );
    }

    const now = new Date();
    const update: Partial<Expense> = {
      status: dto.status,
      actionBy: RequestContextStore.getStore()?.userId,
      actionAt: now,
      actionRemarks: dto.remarks,
    };
    if (dto.status === ExpenseStatus.SYNCED_TO_ERP) update.erpSyncedAt = now;

    const doc = await this.updateOne({ expenseId }, update, { new: true });
    return { statusCode: HttpStatus.OK, message: EXPENSE.UPDATED, data: doc };
  }

  async delete(expenseId: string) {
    const existing = await this.findOne({ expenseId }, { lean: true });
    if (!existing) throw new NotFoundException(EXPENSE.NOT_FOUND);
    if (existing.status !== ExpenseStatus.PENDING) {
      throw new BadRequestException(EXPENSE.DELETE_NOT_ALLOWED);
    }

    await this.softDelete({ expenseId });
    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.DELETED,
      data: existing,
    };
  }

  /** ERP integration export — field names per ERP mapping schema */
  async erpExport(query: ExpenseQueryDto) {
    const filter = this.buildFilter({
      status: ExpenseStatus.APPROVED,
      ...query,
    });
    const items = await this.findLean(filter, { sort: { requestedDate: 1 } });

    const data = items.map((e) => ({
      expenseId: e.expenseId,
      'Man Number': e.manNumber ?? '',
      'Employee Name': e.employeeName,
      'Requested Date': e.requestedDate,
      'From Date': e.fromDate,
      'To Date': e.toDate,
      'No of days': e.noOfDays,
      'To be adjusted days': e.toBeAdjustedDays,
      'Payable days': e.payableDays,
      'Per Day Value': e.perDayValue,
      'Total Amount': e.totalAmount,
      'Withdrawal Charges': e.withdrawalCharges,
      Remarks: e.remarks,
    }));

    return { statusCode: HttpStatus.OK, message: EXPENSE.ERP_FETCHED, data };
  }

  /* ======================================================
   * REFERENCE TABLES
   * ====================================================== */

  async getRates() {
    const data = await this.rateModel
      .find({})
      .sort({ expenseTag: 1 })
      .lean<ExpenseRate[]>();
    return { statusCode: HttpStatus.OK, message: EXPENSE.RATES_FETCHED, data };
  }

  async upsertRates(dto: UpsertExpenseRatesDto) {
    for (const r of dto.rates) {
      await this.rateModel.updateOne(
        { expenseTag: r.expenseTag },
        {
          $set: {
            expenseTag: r.expenseTag,
            expenseOption: EXPENSE_OPTION_BY_TAG[r.expenseTag],
            perDayValue: r.perDayValue,
          },
        },
        { upsert: true },
      );
    }
    const { data } = await this.getRates();
    return { statusCode: HttpStatus.OK, message: EXPENSE.RATES_UPDATED, data };
  }

  async getWithdrawalCharges() {
    const data = await this.chargeModel
      .find({})
      .sort({ minAmount: 1 })
      .lean<WithdrawalCharge[]>();
    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.CHARGES_FETCHED,
      data,
    };
  }

  /** Replaces the whole slab table */
  async replaceWithdrawalCharges(dto: ReplaceWithdrawalChargesDto) {
    if (dto.slabs.some((s) => s.minAmount > s.maxAmount)) {
      throw new BadRequestException(EXPENSE.INVALID_SLAB);
    }

    await this.withTransaction(async (session) => {
      await this.chargeModel.deleteMany({}, { session });
      await this.chargeModel.insertMany(dto.slabs, { session });
    });

    const { data } = await this.getWithdrawalCharges();
    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.CHARGES_UPDATED,
      data,
    };
  }

  /* ======================================================
   * CALCULATION ENGINE
   * ====================================================== */

  private async buildRequest(userId: string) {
    const requestedDate = new Date();
    const today = startOfDay(requestedDate);
    const dow = today.getDay(); // 0 = Sunday

    // Submission window: Monday → Saturday of current week
    if (dow === 0) throw new BadRequestException(EXPENSE.WINDOW_CLOSED);

    const weekStart = addDays(today, -(dow - 1)); // Monday
    const toDate = addDays(weekStart, 5); // Saturday

    const employee = await this.employeeModel
      .findOne({ employeeId: userId, isDeleted: { $ne: true } })
      .lean<EmployeeWithTag>();
    if (!employee) throw new NotFoundException(EXPENSE.EMPLOYEE_NOT_FOUND);

    // Default Monday; if absent on Monday and requesting later → today
    let fromDate = weekStart;
    if (dow !== 1) {
      const presentOnMonday = await this.hasAttendance(userId, weekStart);
      if (!presentOnMonday) fromDate = today;
    }

    const noOfDays = inclusiveDays(fromDate, toDate);

    // Previous-cycle adjustment
    const { previousExpenseId, adjustedDates } =
      await this.previousCycleAbsence(userId, weekStart);
    const toBeAdjustedDays = adjustedDates.length;
    const payableDays = Math.max(0, noOfDays - toBeAdjustedDays);

    // Rate by employee tag (tag set on employee profile; defaults to LOCAL)
    const expenseTag = resolveExpenseTag(employee.expenseTag);

    const rate = await this.rateModel
      .findOne({ expenseTag })
      .lean<ExpenseRate>();
    if (!rate) {
      throw new BadRequestException(
        `${EXPENSE.RATE_NOT_CONFIGURED}: ${expenseTag}`,
      );
    }

    const perDayValue = Number(rate.perDayValue);
    const baseAmount = round2(payableDays * perDayValue);
    const withdrawalChargePercent =
      await this.lookupWithdrawalChargePercent(baseAmount);
    const withdrawalCharges = round2(
      (baseAmount * withdrawalChargePercent) / 100,
    );
    const totalAmount = round2(baseAmount + withdrawalCharges);

    const { routeIds, remarks } = await this.resolveRouteRemarks(
      userId,
      fromDate,
      requestedDate,
    );

    return {
      userId,
      manNumber: employee.manNumber,
      employeeName: employee.name,
      expenseTag,
      expenseOption: EXPENSE_OPTION_BY_TAG[expenseTag],
      requestedDate,
      weekStart,
      fromDate,
      toDate,
      noOfDays,
      toBeAdjustedDays,
      adjustedDates,
      previousExpenseId,
      payableDays,
      perDayValue,
      withdrawalChargePercent,
      withdrawalCharges,
      totalAmount,
      routeIds,
      remarks,
    };
  }

  /** Absent (unworked) days in the previous paid cycle */
  private async previousCycleAbsence(userId: string, weekStart: Date) {
    const previous = await this.findOne(
      {
        userId,
        weekStart: { $lt: weekStart },
        status: { $ne: ExpenseStatus.REJECTED },
      },
      { lean: true, sort: { weekStart: -1 } },
    );

    if (!previous) return { previousExpenseId: undefined, adjustedDates: [] };

    const from = startOfDay(new Date(previous.fromDate));
    const to = endOfDay(new Date(previous.toDate));

    const sessions = await this.workSessionModel
      .find(
        {
          userId,
          isDeleted: { $ne: true },
          dayStartTime: { $gte: from, $lte: to },
        },
        { dayStartTime: 1 },
      )
      .lean<Pick<WorkSession, 'dayStartTime'>[]>();

    const worked = new Set(
      sessions.map((s) => dayKey(new Date(s.dayStartTime))),
    );

    const adjustedDates: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!worked.has(dayKey(d))) adjustedDates.push(d);
    }

    return { previousExpenseId: previous.expenseId, adjustedDates };
  }

  private async hasAttendance(userId: string, day: Date) {
    const found = await this.workSessionModel.exists({
      userId,
      isDeleted: { $ne: true },
      dayStartTime: { $gte: startOfDay(day), $lte: endOfDay(day) },
    });
    return Boolean(found);
  }

  /** Percentage of the slab whose range contains the base amount (0 if none). */
  private async lookupWithdrawalChargePercent(baseAmount: number) {
    if (baseAmount <= 0) return 0;
    const slab = await this.chargeModel
      .findOne({
        minAmount: { $lte: baseAmount },
        maxAmount: { $gte: baseAmount },
      })
      .sort({ minAmount: -1 })
      .lean<WithdrawalCharge>();
    return slab ? Number(slab.chargePercent) : 0;
  }

  /** Remarks = routes worked (day-start route sessions) in the range, in order worked */
  private async resolveRouteRemarks(userId: string, from: Date, to: Date) {
    const sessions = await this.routeSessionModel
      .find(
        {
          userId,
          sessionDate: { $gte: startOfDay(from), $lte: endOfDay(to) },
        },
        { routeId: 1, routeName: 1 },
      )
      .sort({ startTime: 1 })
      .lean<Pick<RouteSession, 'routeId' | 'routeName'>[]>();

    const names = new Map<string, string>();
    for (const s of sessions) {
      if (s.routeId && !names.has(s.routeId)) {
        names.set(s.routeId, s.routeName || s.routeId);
      }
    }
    return {
      routeIds: [...names.keys()],
      remarks: [...names.values()].join(', '),
    };
  }

  /* ======================================================
   * UTIL
   * ====================================================== */

  private buildFilter(query: ExpenseQueryDto): FilterQuery<Expense> {
    const { searchText, status, userId, fromDate, toDate } = query;
    const filter: FilterQuery<Expense> = {};

    if (status) filter.status = status;
    if (userId) filter.userId = userId;

    if (fromDate || toDate) {
      filter.requestedDate = {};
      if (fromDate) filter.requestedDate.$gte = startOfDay(new Date(fromDate));
      if (toDate) filter.requestedDate.$lte = endOfDay(new Date(toDate));
    }

    if (searchText) {
      const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { expenseId: regex },
        { employeeName: regex },
        { manNumber: regex },
      ];
    }

    return filter;
  }

  private currentUserId(): string {
    const userId = RequestContextStore.getStore()?.userId;
    if (!userId) throw new BadRequestException(EXPENSE.EMPLOYEE_NOT_FOUND);
    return userId;
  }
}
