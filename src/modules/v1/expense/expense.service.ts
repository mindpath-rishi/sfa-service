import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';

import { HydratedDocument, Model, Types } from 'mongoose';

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
  AssignEmployeeRateDto,
  CreateExpenseRateDto,
  EmployeeRateQueryDto,
  ExpenseQueryDto,
  ReplaceWithdrawalChargesDto,
  UpdateExpenseRateDto,
  UpdateExpenseStatusDto,
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

/** Legacy employees may still carry a UPC / LOCAL tag from the fixed-tag version */
type EmployeeWithTag = Employee & { expenseTag?: string };

const LEGACY_RATE_NAME: Record<ExpenseTag, string> = {
  [ExpenseTag.UPC]: 'UPC',
  [ExpenseTag.LOCAL]: 'Local',
};

const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** "Unmapped" filter value for the employee mapping list */
const NO_RATE = 'NONE';

@Injectable()
export class ExpenseService
  extends MongoRepository<Expense>
  implements OnModuleInit
{
  private readonly logger = new Logger(ExpenseService.name);
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
    const [rates, counts] = await Promise.all([
      this.rateModel.find({}).sort({ name: 1 }).lean<ExpenseRate[]>(),
      this.employeeModel.aggregate<{ _id: string; count: number }>([
        {
          $match: {
            isDeleted: { $ne: true },
            expenseRateId: { $exists: true, $ne: null },
          },
        },
        { $group: { _id: '$expenseRateId', count: { $sum: 1 } } },
      ]),
    ]);
    const byRate = new Map(counts.map((c) => [c._id, c.count]));
    const data = rates.map((r) => ({
      ...r,
      employeeCount: byRate.get(r.rateId) ?? 0,
    }));
    return { statusCode: HttpStatus.OK, message: EXPENSE.RATES_FETCHED, data };
  }

  async createRate(dto: CreateExpenseRateDto) {
    const name = dto.name.trim();
    await this.assertRateNameFree(name);
    if (dto.isDefault) await this.clearDefaultRate();

    const doc = await this.rateModel.create({
      rateId: IdGenerator.generate('Rate', 8),
      name,
      expenseOption: dto.expenseOption,
      perDayValue: dto.perDayValue,
      isDefault: Boolean(dto.isDefault),
    });
    return {
      statusCode: HttpStatus.CREATED,
      message: EXPENSE.RATE_CREATED,
      data: doc.toObject(),
    };
  }

  async updateRate(rateId: string, dto: UpdateExpenseRateDto) {
    const existing = await this.rateModel
      .findOne({ rateId })
      .lean<ExpenseRate>();
    if (!existing) throw new NotFoundException(EXPENSE.RATE_NOT_FOUND);

    const update: Partial<ExpenseRate> = {};
    if (dto.name !== undefined) {
      update.name = dto.name.trim();
      await this.assertRateNameFree(update.name, rateId);
    }
    if (dto.expenseOption !== undefined)
      update.expenseOption = dto.expenseOption;
    if (dto.perDayValue !== undefined) update.perDayValue = dto.perDayValue;
    if (dto.isDefault !== undefined) {
      if (dto.isDefault) await this.clearDefaultRate(rateId);
      update.isDefault = dto.isDefault;
    }

    const data = await this.rateModel
      .findOneAndUpdate({ rateId }, { $set: update }, { new: true })
      .lean<ExpenseRate>();
    return { statusCode: HttpStatus.OK, message: EXPENSE.RATES_UPDATED, data };
  }

  async deleteRate(rateId: string) {
    const existing = await this.rateModel
      .findOne({ rateId })
      .lean<ExpenseRate>();
    if (!existing) throw new NotFoundException(EXPENSE.RATE_NOT_FOUND);

    const inUse = await this.employeeModel.countDocuments({
      expenseRateId: rateId,
      isDeleted: { $ne: true },
    });
    if (inUse > 0) {
      throw new BadRequestException(`${EXPENSE.RATE_IN_USE} (${inUse})`);
    }

    await this.rateModel.deleteOne({ rateId });
    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.RATE_DELETED,
      data: existing,
    };
  }

  /** Employees with their mapped per day value (rateId + name) */
  async getEmployeeRates(query: EmployeeRateQueryDto) {
    const { page = 1, limit = 20, searchText, expenseRateId } = query;
    const filter: Record<string, unknown> = { isDeleted: { $ne: true } };

    if (expenseRateId === NO_RATE) {
      filter.expenseRateId = { $in: [null, ''] };
    } else if (expenseRateId) {
      filter.expenseRateId = expenseRateId;
    }

    if (searchText) {
      const regex = new RegExp(escapeRegex(searchText), 'i');
      filter.$or = [
        { employeeId: regex },
        { name: regex },
        { manNumber: regex },
      ];
    }

    const skip = (Math.max(1, page) - 1) * limit;
    const [employees, total, rates] = await Promise.all([
      this.employeeModel
        .find(filter, {
          employeeId: 1,
          name: 1,
          manNumber: 1,
          employeeType: 1,
          status: 1,
          expenseRateId: 1,
        })
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean<EmployeeWithTag[]>(),
      this.employeeModel.countDocuments(filter),
      this.rateModel.find({}).lean<ExpenseRate[]>(),
    ]);

    const rateById = new Map(rates.map((r) => [r.rateId, r]));
    const defaultRate = rates.find((r) => r.isDefault);

    const data = employees.map((e) => {
      const mapped = e.expenseRateId
        ? rateById.get(e.expenseRateId)
        : undefined;
      return {
        employeeId: e.employeeId,
        name: e.name,
        manNumber: e.manNumber,
        employeeType: e.employeeType,
        status: e.status,
        expenseRateId: mapped?.rateId ?? null,
        expenseRateName: mapped?.name ?? null,
        // Value used when this employee raises a request
        effectiveRateName: (mapped ?? defaultRate)?.name ?? null,
        effectivePerDayValue: (mapped ?? defaultRate)?.perDayValue ?? null,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.EMPLOYEE_RATES_FETCHED,
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async assignEmployeeRate(dto: AssignEmployeeRateDto) {
    const rateId = dto.expenseRateId || null;
    if (rateId) {
      const rate = await this.rateModel.exists({ rateId });
      if (!rate) throw new NotFoundException(EXPENSE.RATE_NOT_FOUND);
    }

    const employeeIds = [...new Set(dto.employeeIds)];
    const result = await this.employeeModel.updateMany(
      { employeeId: { $in: employeeIds }, isDeleted: { $ne: true } },
      rateId
        ? { $set: { expenseRateId: rateId } }
        : { $unset: { expenseRateId: 1 } },
    );

    return {
      statusCode: HttpStatus.OK,
      message: EXPENSE.EMPLOYEE_RATES_UPDATED,
      data: { matched: result.matchedCount, modified: result.modifiedCount },
    };
  }

  private async assertRateNameFree(name: string, exceptRateId?: string) {
    const clash = await this.rateModel.exists({
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
      ...(exceptRateId ? { rateId: { $ne: exceptRateId } } : {}),
    });
    if (clash) throw new ConflictException(EXPENSE.RATE_DUPLICATE);
  }

  private async clearDefaultRate(exceptRateId?: string) {
    await this.rateModel.updateMany(
      {
        isDefault: true,
        ...(exceptRateId ? { rateId: { $ne: exceptRateId } } : {}),
      },
      { $set: { isDefault: false } },
    );
  }

  /**
   * Employee → rate: explicit mapping, then legacy UPC / LOCAL tag, then default.
   */
  private async resolveRate(employee: EmployeeWithTag) {
    if (employee.expenseRateId) {
      const mapped = await this.rateModel
        .findOne({ rateId: employee.expenseRateId })
        .lean<ExpenseRate>();
      if (mapped) return mapped;
    }
    if (employee.expenseTag) {
      const legacy = await this.rateModel
        .findOne({ expenseTag: employee.expenseTag })
        .lean<ExpenseRate>();
      if (legacy) return legacy;
    }
    return this.rateModel.findOne({ isDefault: true }).lean<ExpenseRate>();
  }

  /* ======================================================
   * MIGRATION (fixed UPC / LOCAL tags → named rates)
   * ====================================================== */

  async onModuleInit() {
    try {
      await this.migrateLegacyRates();
    } catch (err) {
      this.logger.warn(`Expense rate migration skipped: ${String(err)}`);
    }
  }

  private async migrateLegacyRates() {
    // Old unique index on expenseTag blocks rates without a tag
    await this.rateModel.collection
      .dropIndex('expenseTag_1')
      .catch(() => undefined);

    const legacy = await this.rateModel
      .find({ rateId: { $exists: false } })
      .lean<(ExpenseRate & { _id: Types.ObjectId })[]>();
    if (!legacy.length) return;

    const hasDefault = await this.rateModel.exists({ isDefault: true });
    for (const r of legacy) {
      const tag = r.expenseTag as ExpenseTag;
      await this.rateModel.updateOne(
        { _id: r._id },
        {
          $set: {
            rateId: IdGenerator.generate('Rate', 8),
            name: LEGACY_RATE_NAME[tag] ?? String(r.expenseTag),
            expenseOption:
              r.expenseOption ?? EXPENSE_OPTION_BY_TAG[tag] ?? undefined,
            isDefault: !hasDefault && tag === ExpenseTag.LOCAL,
          },
        },
      );
    }
    await this.rateModel.syncIndexes();
    this.logger.log(`Migrated ${legacy.length} legacy expense rate(s)`);
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

    // Per Day Value mapped to the employee (falls back to the default rate)
    const rate = await this.resolveRate(employee);
    if (!rate) throw new BadRequestException(EXPENSE.RATE_NOT_CONFIGURED);

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
      expenseTag: rate.name,
      expenseRateId: rate.rateId,
      expenseOption: rate.expenseOption,
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
      const regex = new RegExp(escapeRegex(searchText), 'i');
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
