/**
 * Employee Service
 * ----------------
 * Purpose : Handles business logic for employee lifecycle management
 * Used by : EmployeeController
 *
 * Responsibilities:
 * - Create employee profiles and linked auth users
 * - Restore soft-deleted employees
 * - Fetch employee lists with filters and pagination
 * - Retrieve single employee profiles
 * - Update employee information
 * - Soft-delete employees and linked users
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Employee and User records are tightly coupled
 * - Soft deletes are used to preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { UserStatus } from 'src/modules/v1/user/user.enum';

import { UserService } from 'src/modules/v1/user/user.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee.query.dto';
import { EMPLOYEE } from './employee.constants';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { InjectModel } from '@nestjs/mongoose';
import { Sale } from 'src/core/database/mongo/schema/sale.schema';
import { Payment } from 'src/core/database/mongo/schema/payment.schema';
import { Model } from 'mongoose';
import { ShopVisit } from 'src/core/database/mongo/schema/shop-visit.schema';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';
import { SaleStatus } from 'src/shared/enums/sale.enums';
import { ActivityStatus } from 'src/shared/enums/activity.enums';
import { Activity } from 'src/core/database/mongo/schema/activity.schema';
import { RequestContextStore } from 'src/core/context/request-context';
import { LeaveStatus } from 'src/shared/enums/leave.enums';
import { Leave } from 'src/core/database/mongo/schema/leave.schema';
import { TargetStatus } from 'src/shared/enums/target.enums';
import { Target } from 'src/core/database/mongo/schema/target.schema';
import { Customer } from 'src/core/database/mongo/schema/customer.schema';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';
import { RouteCustomerMapping } from 'src/core/database/mongo/schema/route-customer-mapping.schema';
import { Route } from 'src/core/database/mongo/schema/route.schema';
import { VanStatus } from 'src/shared/enums/van.enums';
import { Van } from 'src/core/database/mongo/schema/van.schema';
import { NonSaleStatus } from 'src/shared/enums/non-sale.enums';
import { NonSale } from 'src/core/database/mongo/schema/non-sale.schema';
import { SaleItem } from 'src/core/database/mongo/schema/sale-item.schema';
import { WorkSession } from 'src/core/database/mongo/schema/work-session.schema';
import { RouteSession } from 'src/core/database/mongo/schema/route-session.schema';
import { VanDailyStock } from 'src/core/database/mongo/schema/van-daily-stock.schema';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

const parseCalendarDate = (value?: string) => {
  if (!value) return new Date();

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const formatCalendarDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

@Injectable()
export class EmployeeService extends MongoRepository<Employee> {
  constructor(
    mongo: MongoService,
    private readonly userService: UserService,
    @InjectModel(Sale.name)
    private readonly saleModal: Model<Sale>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<Payment>,
    @InjectModel(ShopVisit.name)
    private readonly shopVisitModel: Model<ShopVisit>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(Leave.name)
    private readonly leaveModel: Model<Leave>,
    @InjectModel(Target.name)
    private readonly targetModel: Model<Target>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(RouteCustomerMapping.name)
    private readonly routeCustomerMappingModel: Model<RouteCustomerMapping>,
    @InjectModel(Route.name)
    private readonly routeModel: Model<Route>,
    @InjectModel(Van.name)
    private readonly vanModel: Model<Van>,
    @InjectModel(NonSale.name)
    private readonly nonSaleModel: Model<NonSale>,
    @InjectModel(SaleItem.name)
    private readonly saleItemModel: Model<SaleItem>,
    @InjectModel(WorkSession.name)
    private readonly workSessionModel: Model<WorkSession>,
    @InjectModel(RouteSession.name)
    private readonly routeSessionModel: Model<RouteSession>,
    @InjectModel(VanDailyStock.name)
    private readonly vanDailyStockModel: Model<VanDailyStock>,
  ) {
    super(mongo.getModel(Employee.name, EmployeeSchema));
  }

  /**
   * Create Employee
   * ---------------
   * Purpose : Create a new employee profile and linked authentication user
   *
   * Flow:
   * - Check for existing employee (including soft-deleted)
   * - Restore soft-deleted employee if found
   * - Generate unique employeeId
   * - Create employee profile
   * - Create linked auth user
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active employees
   */
  async create(payload: CreateEmployeeDto) {
    return this.withTransaction(async (session) => {
      // Check existing employee (including soft-deleted)
      const existingEmployee = await this.findOne(
        {
          $or: [{ mobile: payload.mobile }, { email: payload.email }],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active employees
      if (existingEmployee && !existingEmployee.isDeleted) {
        throw new ConflictException(EMPLOYEE.DUPLICATE);
      }

      // Restore soft-deleted employee and linked user
      if (existingEmployee?.isDeleted) {
        await this.updateById(
          existingEmployee._id.toString(),
          {
            name: payload.name,
            roleId: payload.roleId,
            permissionOverrides: payload.permissionOverrides
              ? {
                  allow: payload.permissionOverrides.allow || [],
                  deny: payload.permissionOverrides.deny || [],
                }
              : undefined,
            status: UserStatus.ACTIVE,
            isDeleted: false,
          },
          { session },
        );

        await this.userService.restoreUser(
          {
            profileId: existingEmployee.employeeId,
            mobile: payload.mobile,
            email: payload.email,
            password: payload.password,
            isDeleted: false,
            status: UserStatus.ACTIVE,
            loginId: payload.loginId,
          },
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: EMPLOYEE.CREATED,
          data: { employeeId: existingEmployee.employeeId },
        };
      }

      // Generate unique business employeeId
      const MAX_TRIES = 10;
      let employeeId = '';

      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        employeeId = IdGenerator.generate('EID', 8);
        if (!(await this.exists({ employeeId }, session))) break;

        if (attempt === MAX_TRIES) {
          throw new ConflictException(
            'Unable to generate unique employeeId. Try again.',
          );
        }
      }

      // Create employee profile
      const employee = await this.save(
        {
          employeeId,
          mobile: payload.mobile,
          name: payload.name,
          email: payload.email,
          roleId: payload.roleId,
          permissionOverrides: payload.permissionOverrides
            ? {
                allow: payload.permissionOverrides.allow || [],
                deny: payload.permissionOverrides.deny || [],
              }
            : undefined,
          status: UserStatus.ACTIVE,
        },
        { session },
      );

      // Create linked authentication user
      await this.userService.createUser(
        {
          profileId: employeeId,
          mobile: payload.mobile,
          email: payload.email,
          password: payload.password,
          loginId: payload.loginId,
        },
        session,
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: EMPLOYEE.CREATED,
        data: employee,
      };
    });
  }

  /**
   * Get Employees (List)
   * -------------------
   * Purpose : Retrieve employees with filtering and pagination
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Pagination & sorting
   */
  async findAll(query: EmployeeQueryDto) {
    const {
      status,
      roleId,
      reportingEmployeeId,
      searchText,
      page = 1,
      limit = 20,
    } = query;

    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }

    if (roleId) {
      filter.roleId = roleId;
    }

    if (reportingEmployeeId) {
      filter.reportingEmployeeId = reportingEmployeeId;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');

      filter.$or = [
        { employeeId: regex },
        { name: regex },
        { mobile: regex },
        { email: regex },
      ];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Employee by ID
   * ------------------
   * Purpose : Retrieve a single employee profile
   *
   * Throws:
   * - NotFoundException if employee does not exist
   */
  async findByEmployeeId(employeeId: string) {
    const employee = await this.findOne({ employeeId }, { lean: true });

    if (!employee) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.FETCHED,
      data: employee,
    };
  }

  /**
   * Update Employee
   * ---------------
   * Purpose : Update editable employee profile fields
   *
   * Notes:
   * - Identity fields remain unchanged
   */
  async update(employeeId: string, dto: UpdateEmployeeDto) {
    const employee = await this.updateOne({ employeeId }, dto);

    if (!employee) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.UPDATED,
      data: employee,
    };
  }

  /**
   * Delete Employee (Soft Delete)
   * -----------------------------
   * Purpose : Deactivate employee and linked authentication user
   *
   * Flow:
   * - Soft-delete employee record
   * - Soft-delete linked auth user
   *
   * Notes:
   * - Operation is transactional
   * - Records remain for audit purposes
   */
  async delete(employeeId: string) {
    const deletedEmployee = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { employeeId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(EMPLOYEE.NOT_FOUND);
      }

      await this.softDelete({ employeeId }, { session });
      await this.userService.delete(employeeId, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.DELETED,
      data: deletedEmployee,
    };
  }

  // async getManagerStats(query: { date?: string }) {
  //   const managerId = RequestContextStore.getStore()?.userId;
  //   console.log(managerId, '==========================333================');

  //   const startOfDay = query?.date ? new Date(query.date) : new Date();

  //   startOfDay.setHours(0, 0, 0, 0);

  //   const endOfDay = new Date(startOfDay);
  //   endOfDay.setHours(23, 59, 59, 999);

  //   console.log(
  //     managerId,
  //     startOfDay,
  //     endOfDay,
  //     '==========================350=============',
  //   );

  //   /* =====================================================
  //    * TEAM MEMBERS
  //    * ===================================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   const totalUsers = employeeIds.length;

  //   if (!totalUsers) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager stats fetched successfully',
  //       data: {
  //         userSummary: {
  //           retailing: 0,
  //           officeWork: 0,
  //           leave: 0,
  //           absent: 0,
  //           total: 0,
  //         },
  //         callSummary: {
  //           productivity: 0,
  //           covered: 0,
  //           pc: 0,
  //           tc: 0,
  //           sc: 0,
  //           qtyCases: 0,
  //         },
  //       },
  //     };
  //   }

  //   const [
  //     retailingUsers,
  //     officeUsers,
  //     leaveUsers,
  //     sales,
  //     visitedCount,
  //     productiveCustomers,
  //   ] = await Promise.all([
  //     /* ========================================
  //      * RETAILING USERS
  //      * ======================================== */
  //     this.activityModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: ActivityStatus.ACTIVE,
  //       name: 'Retailing',
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * OFFICE WORK USERS
  //      * ======================================== */
  //     this.activityModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: ActivityStatus.ACTIVE,
  //       name: 'Office Work',
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * LEAVE USERS
  //      * ======================================== */
  //     this.leaveModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: LeaveStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * SALES SUMMARY
  //      * ======================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: { $in: employeeIds },
  //           date: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: SaleStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           pc: {
  //             $sum: '$totalPieces',
  //           },

  //           tc: {
  //             $sum: '$totalCases',
  //           },

  //           sc: {
  //             $sum: '$totalValue',
  //           },

  //           qtyCases: {
  //             $sum: '$totalCases',
  //           },
  //         },
  //       },
  //     ]),

  //     /* ========================================
  //      * TOTAL VISITS
  //      * ======================================== */
  //     this.shopVisitModel.countDocuments({
  //       employeeId: { $in: employeeIds },
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //     }),

  //     /* ========================================
  //      * PRODUCTIVE CALLS
  //      * ======================================== */
  //     this.saleModal.distinct('customerId', {
  //       employeeId: { $in: employeeIds },
  //       date: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: SaleStatus.COMPLETED,
  //     }),
  //   ]);

  //   const retailing = retailingUsers.length;
  //   const officeWork = officeUsers.length;
  //   const leave = leaveUsers.length;

  //   const absent = Math.max(totalUsers - retailing - officeWork - leave, 0);

  //   const covered = productiveCustomers.length;

  //   const productivity =
  //     visitedCount > 0
  //       ? Number(((covered / visitedCount) * 100).toFixed(0))
  //       : 0;

  //   const salesSummary = sales[0] || {
  //     pc: 0,
  //     tc: 0,
  //     sc: 0,
  //     qtyCases: 0,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager stats fetched successfully',
  //     data: {
  //       userSummary: {
  //         retailing,
  //         officeWork,
  //         leave,
  //         absent,
  //         total: totalUsers,
  //       },

  //       callSummary: {
  //         productivity,
  //         covered,
  //         pc: salesSummary.pc,
  //         tc: salesSummary.tc,
  //         sc: salesSummary.sc,
  //         qtyCases: Number(
  //           salesSummary.qtyCases.toFixed?.(1) ?? salesSummary.qtyCases,
  //         ),
  //       },
  //     },
  //   };
  // }

  async getManagerStats(query: {
    date?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const managerId = RequestContextStore.getStore()?.userId;

    const selectedDate = query?.date
      ? parseCalendarDate(query.date)
      : new Date();
    const startOfDay = query?.startDate
      ? parseCalendarDate(query.startDate)
      : query?.date
        ? parseCalendarDate(query.date)
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = query?.endDate
      ? parseCalendarDate(query.endDate)
      : query?.date
        ? parseCalendarDate(query.date)
        : new Date();
    endOfDay.setHours(23, 59, 59, 999);

    /* =====================================================
     * TEAM MEMBERS
     * ===================================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees.map((employee) => employee.employeeId);

    const totalUsers = employeeIds.length;

    if (!totalUsers) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Manager stats fetched successfully',
        data: {
          userSummary: {
            retailing: 0,
            officeWork: 0,
            leave: 0,
            absent: 0,
            total: 0,
          },
          callSummary: {
            productivity: 0,
            covered: 0,
            pc: 0,
            tc: 0,
            sc: 0,
            qtyCases: 0,
            qtyTonnage: 0,
            qtyValue: 0,
          },
        },
      };
    }

    const vans = await this.vanModel.find(
      {
        associatedUsers: {
          $in: employeeIds,
        },
        status: VanStatus.ACTIVE,
      },
      {
        associatedRoutes: 1,
      },
    );

    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || [])
            .filter((route) => {
              const fromDate = route.fromDate ? new Date(route.fromDate) : null;
              const toDate = route.toDate ? new Date(route.toDate) : null;

              return (
                route.routeId &&
                (!fromDate || fromDate <= endOfDay) &&
                (!toDate || toDate >= startOfDay)
              );
            })
            .map((route) => route.routeId),
        ),
      ),
    ];

    const assignedCustomerIds = routeIds.length
      ? await this.routeCustomerMappingModel.distinct('customerId', {
          routeId: {
            $in: routeIds,
          },
          status: RouteCustomerMappingStatus.ACTIVE,
          effectiveFrom: {
            $lte: endOfDay,
          },
          $or: [
            { effectiveTo: null },
            { effectiveTo: { $exists: false } },
            { effectiveTo: { $gte: startOfDay } },
          ],
        })
      : [];

    const totalAssignedOutlets = assignedCustomerIds.length;

    const [
      retailingUsers,
      officeUsers,
      leaveUsers,
      sales,
      tc,
      visitedOutletIds,
      productiveCalls,
    ] = await Promise.all([
      /* ========================================
       * RETAILING USERS
       * ======================================== */
      this.activityModel.distinct('userId', {
        userId: { $in: employeeIds },
        status: {
          $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
        },
        name: 'Retailing',
        startTime: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      }),

      /* ========================================
       * OFFICE WORK USERS
       * ======================================== */
      this.activityModel.distinct('userId', {
        userId: { $in: employeeIds },
        status: {
          $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
        },
        name: { $in: ['Official Work', 'Office Work'] },
        startTime: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      }),

      /* ========================================
       * LEAVE USERS
       * ======================================== */
      this.leaveModel.distinct('userId', {
        userId: { $in: employeeIds },
        status: LeaveStatus.COMPLETED,
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      }),

      /* ========================================
       * SALES SUMMARY
       * ======================================== */
      this.saleModal.aggregate([
        {
          $match: {
            employeeId: { $in: employeeIds },
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: SaleStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,

            // Sales Value
            sc: {
              $sum: '$totalValue',
            },

            totalOrders: {
              $sum: 1,
            },

            // Qty Cases
            qtyCases: {
              $sum: '$netCases',
            },

            // Qty Tonnage
            qtyTonnage: {
              $sum: '$totalWeight',
            },
          },
        },
      ]),

      /* ========================================
       * TOTAL CALLS (TC)
       * ======================================== */
      this.shopVisitModel.countDocuments({
        employeeId: { $in: employeeIds },
        checkInTime: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        status: ShopVisitStatus.COMPLETED,
      }),

      /* ========================================
       * VISITED OUTLETS (UTC)
       * ======================================== */
      this.shopVisitModel.distinct('outletId', {
        employeeId: { $in: employeeIds },
        checkInTime: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        status: ShopVisitStatus.COMPLETED,
      }),

      /* ========================================
       * PRODUCTIVE CALLS (PC)
       * ======================================== */
      this.saleModal.countDocuments({
        employeeId: { $in: employeeIds },
        date: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        status: SaleStatus.COMPLETED,
      }),
    ]);

    /* =====================================================
     * USER SUMMARY
     * ===================================================== */

    const retailing = retailingUsers.length;
    const officeWork = officeUsers.length;
    const leave = leaveUsers.length;

    const activeUsers = new Set([...retailingUsers, ...officeUsers]);

    const absent = Math.max(totalUsers - activeUsers.size - leave, 0);

    /* =====================================================
     * CALL SUMMARY
     * ===================================================== */

    // Productive Calls
    const pc = productiveCalls;

    // Covered % = distinct visited outlets / distinct total outlets.
    const covered =
      totalAssignedOutlets > 0
        ? Number(
            ((visitedOutletIds.length / totalAssignedOutlets) * 100).toFixed(0),
          )
        : 0;

    // Productivity %
    const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(0)) : 0;

    const salesSummary = sales[0] || {
      sc: 0,
      totalOrders: 0,
      qtyCases: 0,
      qtyTonnage: 0,
    };

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager stats fetched successfully',
      data: {
        userSummary: {
          retailing,
          officeWork,
          leave,
          absent,
          total: totalUsers,
        },

        callSummary: {
          productivity,
          covered,

          // Productive Calls
          pc,

          // Total Calls
          tc,

          // Sales Coverage %
          sc: covered,
          qtyValue: salesSummary.sc,

          // Total Cases Sold
          qtyCases: Number(
            salesSummary.qtyCases?.toFixed?.(1) ?? salesSummary.qtyCases ?? 0,
          ),

          // Total Tonnage Sold
          qtyTonnage: Number(
            salesSummary.qtyTonnage?.toFixed?.(2) ??
              salesSummary.qtyTonnage ??
              0,
          ),
        },
      },
    };
  }

  async getEmployeeStats(employeeId: string) {
    // 📅 Get start & end of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const visitDateFilter = {
      checkInTime: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    const saleDateFilter = {
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    const [visitData, salesData, collectionData] = await Promise.all([
      // 🏪 Shop Visits (Today)
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId,
            ...visitDateFilter,
            status: ShopVisitStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: 1 },
          },
        },
      ]),

      // 🧾 Sales Orders (Today)
      this.saleModal.aggregate([
        {
          $match: {
            employeeId,
            ...saleDateFilter,
            status: SaleStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalOrderValue: { $sum: '$totalValue' },
            totalCases: { $sum: '$netCases' },
            totalWeight: { $sum: '$totalWeight' },
          },
        },
      ]),

      // 💰 Payment Collections (Today)
      this.paymentModel.aggregate([
        {
          $match: {
            employeeId,
            createdAt: { $gte: startOfDay, $lte: endOfDay },
          },
        },
        {
          $group: {
            _id: null,
            totalCollections: { $sum: 1 },
            totalCollectionValue: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    return {
      statusCode: 200,
      message: 'Today employee stats fetched successfully',
      data: {
        visits: visitData[0]?.totalVisits || 0,
        tc: visitData[0]?.totalVisits || 0,
        pc: salesData[0]?.totalOrders || 0,

        orders: {
          count: salesData[0]?.totalOrders || 0,
          value: salesData[0]?.totalOrderValue || 0,
          cases: salesData[0]?.totalCases || 0,
          weight: salesData[0]?.totalWeight || 0,
        },

        collections: {
          count: collectionData[0]?.totalCollections || 0,
          value: collectionData[0]?.totalCollectionValue || 0,
        },
      },
    };
  }

  async getSalesmanPocketAndTarget(
    date?: string,
    metric: 'cases' | 'tonnage' | 'value' = 'cases',
    startDateParam?: string,
    endDateParam?: string,
  ) {
    const employeeId = RequestContextStore.getStore()?.userId;

    if (!employeeId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = endDateParam
      ? parseCalendarDate(endDateParam)
      : date
        ? parseCalendarDate(date)
        : new Date();
    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? parseCalendarDate(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange
      ? parseCalendarDate(endDateParam || startDateParam!)
      : now;
    endDate.setHours(23, 59, 59, 999);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    if (endDate > todayEnd) {
      endDate.setTime(todayEnd.getTime());
    }

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const lmtdDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      Math.min(
        now.getDate(),
        new Date(now.getFullYear(), now.getMonth(), 0).getDate(),
      ),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );

    const lmtdStartDate = new Date(
      lmtdDate.getFullYear(),
      lmtdDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const normalizedMetric = ['cases', 'tonnage', 'value'].includes(metric)
      ? metric
      : 'cases';

    const [
      targets,
      salesSummary,
      lmtdTargets,
      lmtdSalesSummary,
      totalVisits,
      uniqueVisitedOutlets,
      retailingDays,
      vanStockSummary,
    ] = await Promise.all([
      this.targetModel.aggregate([
        {
          $match: {
            userId: employeeId,
            status: TargetStatus.ACTIVE,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            targetCases: { $sum: '$targetCases' },
            targetTonnage: { $sum: '$targetTonnage' },
            targetValue: { $sum: '$targetValue' },
          },
        },
      ]),

      this.saleModal.aggregate([
        {
          $match: {
            employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalCases: { $sum: '$netCases' },
            totalTonnage: { $sum: '$totalWeight' },
            totalValue: { $sum: '$totalValue' },
            saleIds: { $addToSet: '$saleId' },
            uniqueBilledOutlets: { $addToSet: '$customerId' },
          },
        },
      ]),

      this.targetModel.aggregate([
        {
          $match: {
            userId: employeeId,
            status: TargetStatus.ACTIVE,
            startDate: { $lte: lmtdDate },
            endDate: { $gte: lmtdStartDate },
          },
        },
        {
          $group: {
            _id: null,
            targetCases: { $sum: '$targetCases' },
            targetTonnage: { $sum: '$targetTonnage' },
            targetValue: { $sum: '$targetValue' },
          },
        },
      ]),

      this.saleModal.aggregate([
        {
          $match: {
            employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: lmtdStartDate,
              $lte: lmtdDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalCases: { $sum: '$netCases' },
            totalTonnage: { $sum: '$totalWeight' },
            totalValue: { $sum: '$totalValue' },
          },
        },
      ]),

      this.shopVisitModel.countDocuments({
        employeeId,
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      this.shopVisitModel.distinct('outletId', {
        employeeId,
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      this.activityModel.aggregate([
        {
          $match: {
            userId: employeeId,
            name: 'Retailing',
            status: {
              $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
            },
            startTime: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$startTime',
                timezone: REPORT_TIMEZONE,
              },
            },
          },
        },
        {
          $count: 'days',
        },
      ]),

      this.vanDailyStockModel.aggregate([
        {
          $match: {
            employeeId,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $addFields: {
            unitQty: {
              $cond: [{ $gt: ['$unitQtyInCase', 0] }, '$unitQtyInCase', 1],
            },
          },
        },
        {
          $group: {
            _id: null,
            openingCases: { $sum: { $divide: ['$openingQty', '$unitQty'] } },
            topupCases: { $sum: { $divide: ['$inQty', '$unitQty'] } },
            salesCases: { $sum: { $divide: ['$outQty', '$unitQty'] } },
          },
        },
      ]),
    ]);

    const targetSummary = targets[0] || {
      targetCases: 0,
      targetTonnage: 0,
      targetValue: 0,
    };

    const sales = salesSummary[0] || {
      totalOrders: 0,
      totalCases: 0,
      totalTonnage: 0,
      totalValue: 0,
      saleIds: [],
      uniqueBilledOutlets: [],
    };
    const stock = vanStockSummary[0] || {
      openingCases: 0,
      topupCases: 0,
      salesCases: 0,
    };
    const openingStockCases = Number(stock.openingCases || 0);
    const topupStockCases = Number(stock.topupCases || 0);
    const totalStockCases = openingStockCases + topupStockCases;
    const stockSalesCases = Number(stock.salesCases || 0);
    const utilizationPercentage =
      totalStockCases > 0
        ? Number(((stockSalesCases / totalStockCases) * 100).toFixed(2))
        : 0;

    const lmtdTargetSummary = lmtdTargets[0] || {
      targetCases: 0,
      targetTonnage: 0,
      targetValue: 0,
    };

    const lmtdSales = lmtdSalesSummary[0] || {
      totalCases: 0,
      totalTonnage: 0,
      totalValue: 0,
    };

    const totalLinesSold = sales.saleIds.length
      ? await this.saleItemModel.countDocuments({
          saleId: {
            $in: sales.saleIds,
          },
        })
      : 0;
    const openActivityEnd =
      endDate.getTime() > Date.now() ? new Date() : endDate;

    const [
      activityDaySummary,
      visitDaySummary,
      salesDaySummary,
      leaveDaySummary,
    ] = await Promise.all([
      this.activityModel.aggregate([
        {
          $match: {
            userId: employeeId,
            status: {
              $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
            },
            startTime: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$startTime',
                timezone: REPORT_TIMEZONE,
              },
            },
            retailing: {
              $sum: {
                $cond: [{ $eq: ['$name', 'Retailing'] }, 1, 0],
              },
            },
            officialWork: {
              $sum: {
                $cond: [{ $ne: ['$name', 'Retailing'] }, 1, 0],
              },
            },
            totalActivities: { $sum: 1 },
            retailingDurationMs: {
              $sum: {
                $cond: [
                  { $eq: ['$name', 'Retailing'] },
                  {
                    $subtract: [
                      { $ifNull: ['$endTime', openActivityEnd] },
                      '$startTime',
                    ],
                  },
                  0,
                ],
              },
            },
            totalDurationMs: {
              $sum: {
                $subtract: [
                  { $ifNull: ['$endTime', openActivityEnd] },
                  '$startTime',
                ],
              },
            },
          },
        },
      ]),
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId,
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$checkInTime',
                timezone: REPORT_TIMEZONE,
              },
            },
            tc: { $sum: 1 },
            firstCallTime: { $min: '$checkInTime' },
          },
        },
      ]),
      this.saleModal.aggregate([
        {
          $match: {
            employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$date',
                timezone: REPORT_TIMEZONE,
              },
            },
            pc: { $sum: 1 },
            upc: { $addToSet: '$customerId' },
            cases: { $sum: '$netCases' },
            netValue: { $sum: '$totalValue' },
            firstPcTime: { $min: '$date' },
          },
        },
      ]),
      this.leaveModel.aggregate([
        {
          $match: {
            userId: employeeId,
            status: LeaveStatus.COMPLETED,
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: REPORT_TIMEZONE,
              },
            },
            leave: { $sum: 1 },
          },
        },
      ]),
    ]);

    const formatTime = (value?: Date | string | null) => {
      if (!value) return null;
      const parsedDate = new Date(value);
      if (Number.isNaN(parsedDate.getTime())) return null;

      return parsedDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    };

    const formatAverageTime = (
      values: Array<Date | string | null | undefined>,
    ) => {
      const minutes = values
        .map((value) => {
          if (!value) return null;

          const parsedDate = new Date(value);
          if (Number.isNaN(parsedDate.getTime())) return null;

          return parsedDate.getHours() * 60 + parsedDate.getMinutes();
        })
        .filter((value): value is number => value !== null);

      if (!minutes.length) return null;

      const averageMinutes = Math.round(
        minutes.reduce((sum, value) => sum + value, 0) / minutes.length,
      );
      const averageDate = new Date();
      averageDate.setHours(
        Math.floor(averageMinutes / 60),
        averageMinutes % 60,
        0,
        0,
      );

      return formatTime(averageDate);
    };

    const formatDurationMinutes = (value: number) => {
      if (!Number.isFinite(value) || value < 1) return '< 1 min';

      const hours = Math.floor(value / 60);
      const minutes = value % 60;

      if (!hours) return `${minutes} min${minutes === 1 ? '' : 's'}`;
      if (!minutes) return `${hours} hr${hours === 1 ? '' : 's'}`;

      return `${hours} hr${hours === 1 ? '' : 's'} ${minutes} min${
        minutes === 1 ? '' : 's'
      }`;
    };

    const formatAverageDuration = (
      values: Array<number | null | undefined>,
    ) => {
      const minutes = values
        .map((value) => Math.max(Math.round(Number(value || 0) / 60000), 0))
        .filter((value) => value > 0);

      if (!minutes.length) return null;

      const averageMinutes = Math.round(
        minutes.reduce((sum, value) => sum + value, 0) / minutes.length,
      );

      return formatDurationMinutes(averageMinutes);
    };

    const formatDayLabel = (value: Date) =>
      value.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

    const toMap = (rows: any[]) =>
      rows.reduce((map, row) => {
        map.set(row._id, row);
        return map;
      }, new Map<string, any>());

    const activityDayMap = toMap(activityDaySummary);
    const visitDayMap = toMap(visitDaySummary);
    const salesDayMap = toMap(salesDaySummary);
    const leaveDayMap = toMap(leaveDaySummary);
    const avgFirstCallTime = formatAverageTime(
      visitDaySummary.map((item) => item.firstCallTime),
    );
    const avgFirstPcTime = formatAverageTime(
      salesDaySummary.map((item) => item.firstPcTime),
    );
    const avgRetailingTime = formatAverageDuration(
      activityDaySummary.map((item) => item.retailingDurationMs),
    );
    const avgTotalTime = formatAverageDuration(
      activityDaySummary.map((item) => item.totalDurationMs),
    );
    const dayWiseSummary: any[] = [];
    const dayCursor = new Date(startDate);

    while (dayCursor <= endDate) {
      const dayKey = formatCalendarDate(dayCursor);
      const activity = activityDayMap.get(dayKey) || {};
      const visits = visitDayMap.get(dayKey) || {};
      const daySales = salesDayMap.get(dayKey) || {};
      const leave = leaveDayMap.get(dayKey) || {};
      const retailing = Number(activity.retailing || 0);
      const officialWork = Number(activity.officialWork || 0);
      const leaveCount = Number(leave.leave || 0);
      const totalActivities = Number(activity.totalActivities || 0);
      const tcCount = Number(visits.tc || 0);
      const pcCount = Number(daySales.pc || 0);
      const hasWorkRecord = totalActivities > 0 || tcCount > 0 || pcCount > 0;
      const absent = leaveCount > 0 || hasWorkRecord ? 0 : 1;
      const dayStatus =
        leaveCount > 0
          ? 'Leave'
          : retailing > 0 || tcCount > 0 || pcCount > 0
            ? 'Retailing'
            : officialWork > 0
              ? 'Official Work'
              : 'Absent';

      dayWiseSummary.push({
        date: dayKey,
        label: formatDayLabel(dayCursor),
        dayStatus,
        retailing,
        officialWork,
        leave: leaveCount,
        absent,
        totalActivities,
        retailingDuration: formatDurationMinutes(
          Math.max(
            Math.round(Number(activity.retailingDurationMs || 0) / 60000),
            0,
          ),
        ),
        totalDuration: formatDurationMinutes(
          Math.max(
            Math.round(Number(activity.totalDurationMs || 0) / 60000),
            0,
          ),
        ),
        tc: tcCount,
        pc: pcCount,
        upc: daySales.upc?.length || 0,
        netValue: Number((daySales.netValue || 0).toFixed(2)),
        cases: Number((daySales.cases || 0).toFixed(2)),
        firstCallTime: formatTime(visits.firstCallTime),
        firstPcTime: formatTime(daySales.firstPcTime),
      });

      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    const pc = Number(sales.totalOrders || 0);
    const tc = Number(totalVisits || 0);
    const upc = sales.uniqueBilledOutlets?.length || 0;
    const utc = uniqueVisitedOutlets.length;
    const retailingDayCount = retailingDays?.[0]?.days || 0;
    const targetCases = Number(targetSummary.targetCases || 0);
    const achievedCases = Number(sales.totalCases || 0);
    const targetTonnage = Number(targetSummary.targetTonnage || 0);
    const achievedTonnage = Number(sales.totalTonnage || 0);
    const targetValue = Number(targetSummary.targetValue || 0);
    const achievedValue = Number(sales.totalValue || 0);
    const remainingCases = Math.max(targetCases - achievedCases, 0);
    const remainingTonnage = Math.max(targetTonnage - achievedTonnage, 0);
    const remainingValue = Math.max(targetValue - achievedValue, 0);
    const selectedTarget =
      normalizedMetric === 'tonnage'
        ? targetTonnage
        : normalizedMetric === 'value'
          ? targetValue
          : targetCases;
    const selectedAchieved =
      normalizedMetric === 'tonnage'
        ? achievedTonnage
        : normalizedMetric === 'value'
          ? achievedValue
          : achievedCases;
    const selectedRemaining = Math.max(selectedTarget - selectedAchieved, 0);
    const lmtdTarget =
      normalizedMetric === 'tonnage'
        ? Number(lmtdTargetSummary.targetTonnage || 0)
        : normalizedMetric === 'value'
          ? Number(lmtdTargetSummary.targetValue || 0)
          : Number(lmtdTargetSummary.targetCases || 0);
    const lmtdAchieved =
      normalizedMetric === 'tonnage'
        ? Number(lmtdSales.totalTonnage || 0)
        : normalizedMetric === 'value'
          ? Number(lmtdSales.totalValue || 0)
          : Number(lmtdSales.totalCases || 0);
    const elapsedDays =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
    const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);
    const achievementPercentage =
      targetCases > 0
        ? Number(((achievedCases / targetCases) * 100).toFixed(2))
        : 0;
    const selectedAchievementPercentage =
      selectedTarget > 0
        ? Number(((selectedAchieved / selectedTarget) * 100).toFixed(2))
        : 0;
    const lmtdAchievementPercentage =
      lmtdTarget > 0
        ? Number(((lmtdAchieved / lmtdTarget) * 100).toFixed(2))
        : 0;
    const improvement = Number(
      (selectedAchievementPercentage - lmtdAchievementPercentage).toFixed(2),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman pocket and target fetched successfully',
      data: {
        startDate,
        endDate,
        retailingDays: retailingDayCount,
        avgRetailingTime,
        avgTotalTime,

        target: {
          metric: normalizedMetric,
          selected: {
            target: Number(selectedTarget.toFixed(2)),
            achieved: Number(selectedAchieved.toFixed(2)),
            remaining: Number(selectedRemaining.toFixed(2)),
            achievementPercentage: selectedAchievementPercentage,
            mtd: selectedAchievementPercentage,
            lmtd: lmtdAchievementPercentage,
            improvement,
            crr:
              elapsedDays > 0
                ? Number((selectedAchieved / elapsedDays).toFixed(2))
                : 0,
            rrr:
              remainingDays > 0
                ? Number((selectedRemaining / remainingDays).toFixed(2))
                : 0,
          },
          targetCases,
          achievedCases,
          remainingCases,
          targetTonnage,
          achievedTonnage,
          remainingTonnage,
          targetValue,
          achievedValue,
          remainingValue,
          achievementPercentage,
          crr:
            elapsedDays > 0
              ? Number((achievedCases / elapsedDays).toFixed(2))
              : 0,
          rrr:
            remainingDays > 0
              ? Number((remainingCases / remainingDays).toFixed(2))
              : 0,
        },

        pocket: {
          tc,
          avgTc:
            retailingDayCount > 0
              ? Number((tc / retailingDayCount).toFixed(2))
              : 0,
          pc,
          avgPc:
            retailingDayCount > 0
              ? Number((pc / retailingDayCount).toFixed(2))
              : 0,
          upc,
          utc,
          totalLinesSold,
          lpc: pc > 0 ? Number((totalLinesSold / pc).toFixed(2)) : 0,
          avgFirstCallTime,
          avgFirstPcTime,
        },
        vanUtilization: {
          openingStockCases: Number(openingStockCases.toFixed(2)),
          topupStockCases: Number(topupStockCases.toFixed(2)),
          totalStockCases: Number(totalStockCases.toFixed(2)),
          salesCases: Number(stockSalesCases.toFixed(2)),
          utilizationPercentage,
        },
        dayWiseSummary,
      },
    };
  }

  async getSalesmanDayWiseSummary(
    date?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const pocketSummary = await this.getSalesmanPocketAndTarget(
      date,
      'cases',
      startDate,
      endDate,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman day wise summary fetched successfully',
      data: pocketSummary.data?.dayWiseSummary || [],
    };
  }

  async getSalesmanProductSales(
    date?: string,
    startDateParam?: string,
    endDateParam?: string,
    groupBy:
      | 'PRIMARYCATEGORY'
      | 'SECONDARYCATEGORY'
      | 'SKU' = 'PRIMARYCATEGORY',
  ) {
    const employeeId = RequestContextStore.getStore()?.userId;

    if (!employeeId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = endDateParam
      ? parseCalendarDate(endDateParam)
      : date
        ? parseCalendarDate(date)
        : new Date();
    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? parseCalendarDate(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange
      ? parseCalendarDate(endDateParam || startDateParam!)
      : now;
    endDate.setHours(23, 59, 59, 999);

    const normalizedGroupBy = [
      'PRIMARYCATEGORY',
      'SECONDARYCATEGORY',
      'SKU',
    ].includes(groupBy)
      ? groupBy
      : 'PRIMARYCATEGORY';

    const [salesSummary, tc] = await Promise.all([
      this.saleModal.aggregate([
        {
          $match: {
            employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalValue: { $sum: '$totalValue' },
            totalCases: { $sum: '$netCases' },
            saleIds: { $addToSet: '$saleId' },
          },
        },
      ]),
      this.shopVisitModel.countDocuments({
        employeeId,
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),
    ]);

    const sales = salesSummary[0] || {
      totalOrders: 0,
      totalValue: 0,
      totalCases: 0,
      saleIds: [],
    };
    const saleIds = sales.saleIds || [];

    const groupIdExpression =
      normalizedGroupBy === 'SKU'
        ? { $ifNull: ['$product.productId', '$productId'] }
        : normalizedGroupBy === 'SECONDARYCATEGORY'
          ? {
              $ifNull: [
                '$product.unitType',
                { $ifNull: ['$product.categoryId', 'UNKNOWN'] },
              ],
            }
          : { $ifNull: ['$product.categoryId', 'UNKNOWN'] };

    const groupNameExpression =
      normalizedGroupBy === 'SKU'
        ? { $ifNull: ['$product.name', '$productName'] }
        : normalizedGroupBy === 'SECONDARYCATEGORY'
          ? {
              $ifNull: [
                '$product.unitType',
                { $ifNull: ['$category.name', 'Unknown'] },
              ],
            }
          : { $ifNull: ['$category.name', 'Unknown'] };

    const [itemSummary, productSales] = saleIds.length
      ? await Promise.all([
          this.saleItemModel.aggregate([
            {
              $match: {
                saleId: { $in: saleIds },
              },
            },
            {
              $group: {
                _id: null,
                totalValue: { $sum: '$totalValue' },
                totalPieces: { $sum: '$quantity' },
                totalCases: {
                  $sum: {
                    $add: [
                      { $ifNull: ['$caseQty', 0] },
                      {
                        $cond: [
                          { $gt: ['$unitQtyInCase', 0] },
                          {
                            $divide: [
                              { $ifNull: ['$pieceQty', 0] },
                              '$unitQtyInCase',
                            ],
                          },
                          0,
                        ],
                      },
                    ],
                  },
                },
                skuIds: { $addToSet: '$productId' },
                lineCount: { $sum: 1 },
              },
            },
          ]),
          this.saleItemModel.aggregate([
            {
              $match: {
                saleId: { $in: saleIds },
              },
            },
            {
              $lookup: {
                from: 'product_master',
                localField: 'productId',
                foreignField: 'productId',
                as: 'product',
              },
            },
            {
              $unwind: {
                path: '$product',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'productcategories',
                localField: 'product.categoryId',
                foreignField: 'categoryId',
                as: 'category',
              },
            },
            {
              $unwind: {
                path: '$category',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $group: {
                _id: groupIdExpression,
                name: { $first: groupNameExpression },
                value: { $sum: '$totalValue' },
                pcs: { $sum: '$quantity' },
                cases: {
                  $sum: {
                    $add: [
                      { $ifNull: ['$caseQty', 0] },
                      {
                        $cond: [
                          { $gt: ['$unitQtyInCase', 0] },
                          {
                            $divide: [
                              { $ifNull: ['$pieceQty', 0] },
                              '$unitQtyInCase',
                            ],
                          },
                          0,
                        ],
                      },
                    ],
                  },
                },
              },
            },
            {
              $sort: {
                value: -1,
              },
            },
          ]),
        ])
      : [[], []];

    const itemTotals = itemSummary[0] || {
      totalValue: 0,
      totalPieces: 0,
      totalCases: 0,
      skuIds: [],
      lineCount: 0,
    };
    const pc = Number(sales.totalOrders || 0);
    const totalValue = Number(itemTotals.totalValue || sales.totalValue || 0);
    const totalCases = Number(itemTotals.totalCases || sales.totalCases || 0);

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman product sales fetched successfully',
      data: {
        overview: {
          sc: itemTotals.skuIds?.length || 0,
          tc: Number(tc || 0),
          pc,
          netValue: Number(totalValue.toFixed(2)),
          cases: Number(totalCases.toFixed(2)),
          lpc:
            pc > 0
              ? Number((Number(itemTotals.lineCount || 0) / pc).toFixed(2))
              : 0,
        },
        categories: productSales.map((item) => ({
          id: item._id,
          name: item.name || 'Unknown',
          value: Number((item.value || 0).toFixed(2)),
          pcs: Number((item.pcs || 0).toFixed(2)),
          cases: Number((item.cases || 0).toFixed(2)),
          growth:
            totalValue > 0
              ? Number(
                  ((Number(item.value || 0) / totalValue) * 100).toFixed(2),
                )
              : 0,
        })),
      },
    };
  }

  async getSalesmanDispatchOrders(
    date?: string,
    startDateParam?: string,
    endDateParam?: string,
  ) {
    const employeeId = RequestContextStore.getStore()?.userId;

    if (!employeeId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = endDateParam
      ? parseCalendarDate(endDateParam)
      : date
        ? parseCalendarDate(date)
        : new Date();
    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? parseCalendarDate(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange
      ? parseCalendarDate(endDateParam || startDateParam!)
      : now;
    endDate.setHours(23, 59, 59, 999);

    const orders = await this.saleModal
      .find({
        employeeId,
        status: SaleStatus.COMPLETED,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ date: -1 })
      .lean();

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman dispatch orders fetched successfully',
      data: orders.map((order: any) => ({
        orderId: order.saleId,
        orderNo: order.saleId,
        outletName: order.customerName,
        outlet: order.customerName,
        invoiceNo: order.saleId,
        status: 'Pending Dispatch',
        orderDate: order.date,
        dispatchDate: null,
        vehicleNo: order.vanName,
        cases: Number(order.netCases || order.totalCases || 0),
        pieces: Number(order.totalPieces || order.totalQty || 0),
        netValue: Number(order.totalValue || 0),
      })),
    };
  }

  async shareSalesmanReport(
    type: 'MST' | 'MSR' | 'DSR',
    params?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const reportType = type === 'MSR' ? 'MST' : type;
    const summary = await this.getSalesmanPocketAndTarget(
      params?.date,
      'cases',
      params?.startDate,
      params?.endDate,
    );
    const data = summary.data;
    const startDate = data?.startDate ? new Date(data.startDate) : new Date();
    const endDate = data?.endDate ? new Date(data.endDate) : startDate;
    const rangeLabel =
      formatCalendarDate(startDate) === formatCalendarDate(endDate)
        ? formatCalendarDate(startDate)
        : `${formatCalendarDate(startDate)} to ${formatCalendarDate(endDate)}`;
    const pocket = data?.pocket || {};
    const target = data?.target || {};
    const selectedTarget = target?.selected || {};

    const shareText = [
      `${reportType} Report`,
      `Period: ${rangeLabel}`,
      `TC: ${Number(pocket.tc || 0)}`,
      `PC: ${Number(pocket.pc || 0)}`,
      `UPC: ${Number(pocket.upc || 0)}`,
      `UTC: ${Number(pocket.utc || 0)}`,
      `LPC: ${Number(pocket.lpc || 0)}`,
      `Cases: ${Number(target.achievedCases || selectedTarget.achieved || 0)}`,
      `Target: ${Number(target.targetCases || selectedTarget.target || 0)}`,
      `Achievement: ${Number(
        target.achievementPercentage ||
          selectedTarget.achievementPercentage ||
          0,
      )}%`,
    ].join('\n');

    return {
      statusCode: HttpStatus.OK,
      message: `${reportType} sharing content prepared successfully`,
      data: {
        type: reportType,
        message: shareText,
        shareText,
        text: shareText,
      },
    };
  }

  async getPrimaryCategoryTargetSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    /* ==========================================
     * MTD DATE RANGE
     * ========================================== */
    const now = date ? parseCalendarDate(date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees.map((employee) => employee.employeeId);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Target summary fetched successfully',
        data: {
          startDate,
          endDate,
          targetCases: 0,
          achievedCases: 0,
          remainingCases: 0,
          achievementPercentage: 0,
          display: {
            percentage: '0%',
            achievedCases: '0 Cases',
            remainingMessage: 'No target assigned for current month',
          },
        },
      };
    }

    /* ==========================================
     * TARGETS + ACHIEVEMENT
     * ========================================== */
    const [targets, sales] = await Promise.all([
      this.targetModel.aggregate([
        {
          $match: {
            userId: {
              $in: employeeIds,
            },
            status: TargetStatus.ACTIVE,
            startDate: {
              $lte: endDate,
            },
            endDate: {
              $gte: startDate,
            },
          },
        },
        {
          $group: {
            _id: null,

            targetCases: {
              $sum: '$targetCases',
            },

            targetTonnage: {
              $sum: '$targetTonnage',
            },

            targetValue: {
              $sum: '$targetValue',
            },
          },
        },
      ]),

      this.saleModal.aggregate([
        {
          $match: {
            employeeId: {
              $in: employeeIds,
            },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,

            achievedCases: {
              $sum: '$netCases',
            },

            achievedTonnage: {
              $sum: '$totalWeight',
            },

            achievedValue: {
              $sum: '$totalValue',
            },
          },
        },
      ]),
    ]);

    const targetSummary = targets[0] || {
      targetCases: 0,
      targetTonnage: 0,
      targetValue: 0,
    };

    const achievementSummary = sales[0] || {
      achievedCases: 0,
      achievedTonnage: 0,
      achievedValue: 0,
    };

    const targetCases = targetSummary.targetCases;
    const achievedCases = achievementSummary.achievedCases;

    const remainingCases = Math.max(targetCases - achievedCases, 0);

    const achievementPercentage =
      targetCases > 0
        ? Number(((achievedCases / targetCases) * 100).toFixed(2))
        : 0;

    return {
      statusCode: HttpStatus.OK,
      message: 'Target summary fetched successfully',
      data: {
        startDate,
        endDate,

        targetCases,
        achievedCases,
        remainingCases,

        targetTonnage: targetSummary.targetTonnage,
        achievedTonnage: achievementSummary.achievedTonnage,

        targetValue: targetSummary.targetValue,
        achievedValue: achievementSummary.achievedValue,

        achievementPercentage,

        display: {
          percentage: `${achievementPercentage}%`,
          achievedCases: `${Math.round(achievedCases).toLocaleString()} Cases`,
          remainingMessage: `Only ${remainingCases.toLocaleString()} more Cases to achieve your target`,
        },
      },
    };
  }

  async getUserWiseTargetSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = date ? parseCalendarDate(date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees.map((employee) => employee.employeeId);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'User target summary fetched successfully',
        data: [],
      };
    }

    const [targets, achievements] = await Promise.all([
      this.targetModel.aggregate([
        {
          $match: {
            userId: { $in: employeeIds },
            status: TargetStatus.ACTIVE,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$userId',
            targetCases: {
              $sum: '$targetCases',
            },
            targetTonnage: {
              $sum: '$targetTonnage',
            },
            targetValue: {
              $sum: '$targetValue',
            },
          },
        },
      ]),

      this.saleModal.aggregate([
        {
          $match: {
            employeeId: { $in: employeeIds },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: '$employeeId',
            achievementCases: {
              $sum: '$netCases', // or netCases
            },
            achievementTonnage: {
              $sum: '$totalWeight',
            },
            achievementValue: {
              $sum: '$totalValue',
            },
          },
        },
      ]),
    ]);

    const targetMap = new Map(targets.map((item) => [item._id, item]));

    const achievementMap = new Map(
      achievements.map((item) => [item._id, item]),
    );

    const totalDaysInMonth = monthEndDate.getDate();

    const elapsedDays =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    const remainingDays = Math.max(totalDaysInMonth - elapsedDays, 1);

    const result = employees.map((employee) => {
      const target = targetMap.get(employee.employeeId) || {};

      const achievement = achievementMap.get(employee.employeeId) || {};

      const targetCases = Number(target.targetCases || 0);

      const targetTonnage = Number(target.targetTonnage || 0);

      const targetValue = Number(target.targetValue || 0);

      const achievementCases = Number(achievement.achievementCases || 0);

      const achievementTonnage = Number(achievement.achievementTonnage || 0);

      const achievementValue = Number(achievement.achievementValue || 0);

      const remainingCases = Math.max(targetCases - achievementCases, 0);

      const remainingTonnage = Math.max(targetTonnage - achievementTonnage, 0);

      const remainingValue = Math.max(targetValue - achievementValue, 0);

      const crr = elapsedDays > 0 ? achievementCases / elapsedDays : 0;

      const rrr = remainingDays > 0 ? remainingCases / remainingDays : 0;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        // designation: employee.roleName || '',
        targetCases: Number(targetCases.toFixed(2)),
        achievementCases: Number(achievementCases.toFixed(2)),
        remainingCases: Number(remainingCases.toFixed(2)),
        targetTonnage: Number(targetTonnage.toFixed(2)),
        achievementTonnage: Number(achievementTonnage.toFixed(2)),
        remainingTonnage: Number(remainingTonnage.toFixed(2)),
        targetValue: Number(targetValue.toFixed(2)),
        achievementValue: Number(achievementValue.toFixed(2)),
        remainingValue: Number(remainingValue.toFixed(2)),
        achievementPercentage:
          targetCases > 0
            ? Number(((achievementCases / targetCases) * 100).toFixed(2))
            : 0,
        rrr: Number(rrr.toFixed(2)),
        crr: Number(crr.toFixed(2)),
        hasTarget: targetCases > 0 || targetTonnage > 0 || targetValue > 0,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'User target summary fetched successfully',
      data: result.sort((a, b) => b.achievementCases - a.achievementCases),
    };
  }

  async getUserPrimaryCategoryTarget(query: {
    employeeId: string;
    date?: string;
  }) {
    const now = query?.date ? parseCalendarDate(query.date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    const [targets, achievements] = await Promise.all([
      this.targetModel.aggregate([
        {
          $match: {
            userId: query.employeeId,
            status: TargetStatus.ACTIVE,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: '$categoryId',
            category: { $first: '$category' },
            targetCases: { $sum: '$targetCases' },
            targetTonnage: { $sum: '$targetTonnage' },
            targetValue: { $sum: '$targetValue' },
          },
        },
      ]),

      this.saleModal.aggregate([
        {
          $match: {
            employeeId: query.employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $lookup: {
            from: 'sale_items',
            localField: 'saleId',
            foreignField: 'saleId',
            as: 'items',
          },
        },
        {
          $unwind: '$items',
        },
        {
          $lookup: {
            from: 'product_master',
            localField: 'items.productId',
            foreignField: 'productId',
            as: 'product',
          },
        },
        {
          $unwind: {
            path: '$product',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'productcategories',
            localField: 'product.categoryId',
            foreignField: 'categoryId',
            as: 'category',
          },
        },
        {
          $unwind: {
            path: '$category',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: {
              $ifNull: ['$product.categoryId', 'UNKNOWN'],
            },
            category: {
              $first: {
                $ifNull: ['$category.name', 'Unknown'],
              },
            },
            achievementCases: {
              $sum: {
                $add: [
                  { $ifNull: ['$items.caseQty', 0] },
                  {
                    $cond: [
                      { $gt: ['$items.unitQtyInCase', 0] },
                      {
                        $divide: [
                          { $ifNull: ['$items.pieceQty', 0] },
                          '$items.unitQtyInCase',
                        ],
                      },
                      0,
                    ],
                  },
                ],
              },
            },
            achievementTonnage: { $sum: '$items.totalNetWeight' },
            achievementValue: { $sum: '$items.totalValue' },
          },
        },
      ]),
    ]);

    const categoryMap = new Map<string, any>();

    for (const target of targets) {
      categoryMap.set(target._id, {
        categoryId: target._id,
        category: target.category,
        targetCases: Number(target.targetCases || 0),
        targetTonnage: Number(target.targetTonnage || 0),
        targetValue: Number(target.targetValue || 0),
        achievementCases: 0,
        achievementTonnage: 0,
        achievementValue: 0,
      });
    }

    for (const achievement of achievements) {
      const current = categoryMap.get(achievement._id) || {
        categoryId: achievement._id,
        category: achievement.category,
        targetCases: 0,
        targetTonnage: 0,
        targetValue: 0,
        achievementCases: 0,
        achievementTonnage: 0,
        achievementValue: 0,
      };

      current.achievementCases = Number(achievement.achievementCases || 0);
      current.achievementTonnage = Number(achievement.achievementTonnage || 0);
      current.achievementValue = Number(achievement.achievementValue || 0);
      categoryMap.set(achievement._id, current);
    }

    const data = Array.from(categoryMap.values()).map((item) => {
      const remainingCases = Math.max(
        item.targetCases - item.achievementCases,
        0,
      );
      const remainingTonnage = Math.max(
        item.targetTonnage - item.achievementTonnage,
        0,
      );
      const remainingValue = Math.max(
        item.targetValue - item.achievementValue,
        0,
      );

      return {
        ...item,
        targetCases: Number(item.targetCases.toFixed(2)),
        achievementCases: Number(item.achievementCases.toFixed(2)),
        remainingCases: Number(remainingCases.toFixed(2)),
        targetTonnage: Number(item.targetTonnage.toFixed(2)),
        achievementTonnage: Number(item.achievementTonnage.toFixed(2)),
        remainingTonnage: Number(remainingTonnage.toFixed(2)),
        targetValue: Number(item.targetValue.toFixed(2)),
        achievementValue: Number(item.achievementValue.toFixed(2)),
        remainingValue: Number(remainingValue.toFixed(2)),
        achievementPercentage:
          item.targetCases > 0
            ? Number(
                ((item.achievementCases / item.targetCases) * 100).toFixed(2),
              )
            : 0,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'User primary category targets fetched successfully',
      data: data.sort((a, b) => b.achievementCases - a.achievementCases),
    };
  }

  // async getManagerOrderSummary() {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   const now = new Date();

  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const endDate = now;

  //   /* ==========================================
  //    * TEAM MEMBERS
  //    * ========================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager order summary fetched successfully',
  //       data: {
  //         primaryCategoryWiseOrder: {
  //           totalCases: 0,
  //           categories: [],
  //         },
  //         managerOrderSummary: {
  //           orders: 0,
  //           validation: 0,
  //         },
  //         outletSummary: {
  //           upc: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           zeroOrder: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           notVisited: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           total: {
  //             count: 0,
  //             percentage: 100,
  //           },
  //           productivity: {
  //             pc: 0,
  //             tc: 0,
  //             percentage: 0,
  //           },
  //         },
  //       },
  //     };
  //   }

  //   /* ==========================================
  //    * TEAM VANS
  //    * ========================================== */
  //   const vans = await this.vanModel.find(
  //     {
  //       associatedUsers: {
  //         $in: employeeIds,
  //       },
  //       status: VanStatus.ACTIVE,
  //     },
  //     {
  //       vanId: 1,
  //       associatedRoutes: 1,
  //     },
  //   );

  //   /* ==========================================
  //    * ROUTES FROM VANS
  //    * ========================================== */
  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || []).map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   /* ==========================================
  //    * ASSIGNED OUTLETS
  //    * ========================================== */
  //   const assignedCustomerIds = await this.routeCustomerMappingModel.distinct(
  //     'customerId',
  //     {
  //       routeId: {
  //         $in: routeIds,
  //       },
  //       status: RouteCustomerMappingStatus.ACTIVE,
  //     },
  //   );

  //   const totalAssignedOutlets = assignedCustomerIds.length;

  //   /* ==========================================
  //    * DASHBOARD DATA
  //    * ========================================== */
  //   const [
  //     categoryTargets,
  //     managerOrders,
  //     visitedCustomers,
  //     productiveCustomers,
  //   ] = await Promise.all([
  //     /* ======================================
  //      * PRIMARY CATEGORY WISE ORDER
  //      * ====================================== */
  //     this.targetModel.aggregate([
  //       {
  //         $match: {
  //           userId: {
  //             $in: employeeIds,
  //           },
  //           status: TargetStatus.ACTIVE,
  //           startDate: {
  //             $lte: endDate,
  //           },
  //           endDate: {
  //             $gte: startDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: '$categoryId',
  //           category: {
  //             $first: '$category',
  //           },
  //           cases: {
  //             $sum: '$achievedCases',
  //           },
  //         },
  //       },
  //       {
  //         $sort: {
  //           cases: -1,
  //         },
  //       },
  //     ]),

  //     /* ======================================
  //      * MANAGER ORDER SUMMARY
  //      * ====================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           orders: {
  //             $sum: '$salesCases', // replace with totalCases if not added yet
  //           },
  //           validation: {
  //             $sum: '$salesCases',
  //           },
  //         },
  //       },
  //     ]),

  //     /* ======================================
  //      * TOTAL CALLS (TC)
  //      * ====================================== */
  //     this.shopVisitModel.distinct('customerId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     /* ======================================
  //      * PRODUCTIVE CALLS (PC)
  //      * ====================================== */
  //     this.saleModal.distinct('customerId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: SaleStatus.COMPLETED,
  //       date: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),
  //   ]);

  //   /* ==========================================
  //    * CATEGORY SUMMARY
  //    * ========================================== */
  //   const totalCases = categoryTargets.reduce(
  //     (sum, item) => sum + item.cases,
  //     0,
  //   );

  //   const categories = categoryTargets.map((item) => ({
  //     categoryId: item._id,
  //     category: item.category,
  //     cases: Number(item.cases || 0),
  //     percentage:
  //       totalCases > 0 ? Math.round((item.cases / totalCases) * 100) : 0,
  //   }));

  //   /* ==========================================
  //    * OUTLET SUMMARY
  //    * ========================================== */
  //   const tc = visitedCustomers.length;

  //   const pc = productiveCustomers.length;

  //   const zeroOrder = Math.max(tc - pc, 0);

  //   const notVisited = Math.max(totalAssignedOutlets - tc, 0);

  //   const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(2)) : 0;

  //   const managerOrder = managerOrders?.[0] || {
  //     orders: 0,
  //     validation: 0,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager order summary fetched successfully',
  //     data: {
  //       primaryCategoryWiseOrder: {
  //         totalCases: Number(totalCases.toFixed(2)),
  //         categories,
  //       },

  //       managerOrderSummary: {
  //         orders: Number(managerOrder.orders || 0),
  //         validation: Number(managerOrder.validation || 0),
  //       },

  //       outletSummary: {
  //         upc: {
  //           count: pc,
  //           percentage: productivity,
  //         },

  //         zeroOrder: {
  //           count: zeroOrder,
  //           percentage: tc > 0 ? Math.round((zeroOrder / tc) * 100) : 0,
  //         },

  //         notVisited: {
  //           count: notVisited,
  //           percentage:
  //             totalAssignedOutlets > 0
  //               ? Math.round((notVisited / totalAssignedOutlets) * 100)
  //               : 0,
  //         },

  //         total: {
  //           count: totalAssignedOutlets,
  //           percentage: 100,
  //         },

  //         productivity: {
  //           pc,
  //           tc,
  //           percentage: productivity,
  //         },
  //       },
  //     },
  //   };
  // }

  async getManagerOrderSummary() {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees.map((employee) => employee.employeeId);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Manager order summary fetched successfully',
        data: {
          primaryCategoryWiseOrder: {
            totalCases: 0,
            totalTonnage: 0,
            totalValue: 0,
            categories: [],
          },

          managerOrderSummary: {
            orders: 0,
            validation: 0,
            orderCases: 0,
            orderTonnage: 0,
            orderValue: 0,
            validationCases: 0,
            validationTonnage: 0,
            validationValue: 0,
          },

          outletSummary: {
            upc: {
              count: 0,
              percentage: 0,
            },

            zeroOrder: {
              count: 0,
              percentage: 0,
            },

            notVisited: {
              count: 0,
              percentage: 0,
            },

            total: {
              count: 0,
              percentage: 100,
            },

            productivity: {
              pc: 0,
              tc: 0,
              percentage: 0,
            },
          },
        },
      };
    }

    /* ==========================================
     * TEAM VANS
     * ========================================== */
    const vans = await this.vanModel.find(
      {
        associatedUsers: {
          $in: employeeIds,
        },
        status: VanStatus.ACTIVE,
      },
      {
        vanId: 1,
        associatedRoutes: 1,
      },
    );

    /* ==========================================
     * ROUTES
     * ========================================== */
    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || [])
            .filter((route) => {
              const fromDate = route.fromDate ? new Date(route.fromDate) : null;
              const toDate = route.toDate ? new Date(route.toDate) : null;

              return (
                route.routeId &&
                (!fromDate || fromDate <= endDate) &&
                (!toDate || toDate >= startDate)
              );
            })
            .map((route) => route.routeId),
        ),
      ),
    ];

    /* ==========================================
     * ASSIGNED OUTLETS
     * ========================================== */
    const assignedCustomerIds = await this.routeCustomerMappingModel.distinct(
      'customerId',
      {
        routeId: {
          $in: routeIds,
        },
        status: RouteCustomerMappingStatus.ACTIVE,
        effectiveFrom: {
          $lte: endDate,
        },
        $or: [
          { effectiveTo: null },
          { effectiveTo: { $exists: false } },
          { effectiveTo: { $gte: startDate } },
        ],
      },
    );

    const totalAssignedOutlets = assignedCustomerIds.length;

    /* ==========================================
     * DASHBOARD DATA
     * ========================================== */
    const [
      categoryTargets,
      managerOrders,
      visitedCustomers,
      productiveCustomers,
      totalCalls,
      productiveCalls,
      zeroOrderOutlets,
    ] = await Promise.all([
      /* ======================================
       * PRIMARY CATEGORY WISE ORDER
       * ====================================== */
      this.saleModal.aggregate([
        {
          $match: {
            employeeId: {
              $in: employeeIds,
            },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $lookup: {
            from: 'sale_items',
            localField: 'saleId',
            foreignField: 'saleId',
            as: 'items',
          },
        },
        {
          $unwind: '$items',
        },
        {
          $lookup: {
            from: 'product_master',
            localField: 'items.productId',
            foreignField: 'productId',
            as: 'product',
          },
        },
        {
          $unwind: {
            path: '$product',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $lookup: {
            from: 'productcategories',
            localField: 'product.categoryId',
            foreignField: 'categoryId',
            as: 'category',
          },
        },
        {
          $unwind: {
            path: '$category',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $group: {
            _id: {
              $ifNull: ['$product.categoryId', 'UNKNOWN'],
            },

            category: {
              $first: {
                $ifNull: ['$category.name', 'Unknown'],
              },
            },

            cases: {
              $sum: {
                $add: [
                  {
                    $ifNull: ['$items.caseQty', 0],
                  },
                  {
                    $cond: [
                      {
                        $gt: ['$items.unitQtyInCase', 0],
                      },
                      {
                        $divide: [
                          {
                            $ifNull: ['$items.pieceQty', 0],
                          },
                          '$items.unitQtyInCase',
                        ],
                      },
                      0,
                    ],
                  },
                ],
              },
            },

            tonnage: {
              $sum: {
                $ifNull: ['$items.totalNetWeight', 0],
              },
            },

            value: {
              $sum: {
                $ifNull: ['$items.totalValue', 0],
              },
            },
          },
        },
        {
          $sort: {
            cases: -1,
          },
        },
      ]),

      /* ======================================
       * MANAGER ORDER SUMMARY
       * ====================================== */
      this.saleModal.aggregate([
        {
          $match: {
            employeeId: {
              $in: employeeIds,
            },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,

            orders: {
              $sum: '$netCases',
            },

            validation: {
              $sum: '$totalValue',
            },

            orderCases: {
              $sum: '$netCases',
            },

            orderTonnage: {
              $sum: '$totalWeight',
            },

            orderValue: {
              $sum: '$totalValue',
            },

            validationCases: {
              $sum: '$netCases',
            },

            validationTonnage: {
              $sum: '$totalWeight',
            },

            validationValue: {
              $sum: '$totalValue',
            },
          },
        },
      ]),

      /* ======================================
       * TOTAL CALLS (TC)
       * ====================================== */
      this.shopVisitModel.distinct('outletId', {
        employeeId: {
          $in: employeeIds,
        },
        outletId: {
          $in: assignedCustomerIds,
        },
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /* ======================================
       * UNIQUE PRODUCTIVE OUTLETS (UPC)
       * ====================================== */
      this.saleModal.distinct('customerId', {
        employeeId: {
          $in: employeeIds,
        },
        status: SaleStatus.COMPLETED,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /* ======================================
       * TOTAL CALLS (TC)
       * ====================================== */
      this.shopVisitModel.countDocuments({
        employeeId: {
          $in: employeeIds,
        },
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /* ======================================
       * PRODUCTIVE CALLS (PC)
       * ====================================== */
      this.saleModal.countDocuments({
        employeeId: {
          $in: employeeIds,
        },
        status: SaleStatus.COMPLETED,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /* ======================================
       * ZERO ORDER OUTLETS
       * ====================================== */
      this.nonSaleModel.distinct('outletId', {
        employeeId: {
          $in: employeeIds,
        },
        status: NonSaleStatus.COMPLETED,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      }),
    ]);

    /* ==========================================
     * CATEGORY SUMMARY
     * ========================================== */
    const totalCases = categoryTargets.reduce(
      (sum, item) => sum + item.cases,
      0,
    );

    const totalTonnage = categoryTargets.reduce(
      (sum, item) => sum + item.tonnage,
      0,
    );

    const totalValue = categoryTargets.reduce(
      (sum, item) => sum + item.value,
      0,
    );

    const categories = categoryTargets.map((item) => ({
      categoryId: item._id,
      category: item.category,
      cases: Number((item.cases || 0).toFixed(2)),
      tonnage: Number((item.tonnage || 0).toFixed(2)),
      value: Number((item.value || 0).toFixed(2)),

      percentage:
        totalCases > 0 ? Math.round((item.cases / totalCases) * 100) : 0,
      tonnagePercentage:
        totalTonnage > 0 ? Math.round((item.tonnage / totalTonnage) * 100) : 0,
      valuePercentage:
        totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0,
    }));

    /* ==========================================
     * OUTLET SUMMARY
     * ========================================== */
    const tc = visitedCustomers.length;

    const upc = productiveCustomers.length;

    const zeroOrder = zeroOrderOutlets.length;

    const notVisited = Math.max(totalAssignedOutlets - tc, 0);

    const productivity =
      totalCalls > 0
        ? Number(((productiveCalls / totalCalls) * 100).toFixed(2))
        : 0;

    const managerOrder = managerOrders?.[0] || {
      orders: 0,
      validation: 0,
      orderCases: 0,
      orderTonnage: 0,
      orderValue: 0,
      validationCases: 0,
      validationTonnage: 0,
      validationValue: 0,
    };

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager order summary fetched successfully',

      data: {
        primaryCategoryWiseOrder: {
          totalCases: Number(totalCases.toFixed(2)),
          totalTonnage: Number(totalTonnage.toFixed(2)),
          totalValue: Number(totalValue.toFixed(2)),

          categories,
        },

        managerOrderSummary: {
          orders: Number(managerOrder.orders || 0),

          validation: Number(managerOrder.validation || 0),
          orderCases: Number(managerOrder.orderCases || 0),
          orderTonnage: Number(managerOrder.orderTonnage || 0),
          orderValue: Number(managerOrder.orderValue || 0),
          validationCases: Number(managerOrder.validationCases || 0),
          validationTonnage: Number(managerOrder.validationTonnage || 0),
          validationValue: Number(managerOrder.validationValue || 0),
        },

        outletSummary: {
          upc: {
            count: upc,
            percentage:
              totalAssignedOutlets > 0
                ? Number(((upc / totalAssignedOutlets) * 100).toFixed(2))
                : 0,
          },

          zeroOrder: {
            count: zeroOrder,

            percentage:
              tc > 0 ? Number(((zeroOrder / tc) * 100).toFixed(2)) : 0,
          },

          notVisited: {
            count: notVisited,

            percentage:
              totalAssignedOutlets > 0
                ? Number(((notVisited / totalAssignedOutlets) * 100).toFixed(2))
                : 0,
          },

          total: {
            count: totalAssignedOutlets,
            percentage: 100,
          },

          productivity: {
            pc: productiveCalls,
            tc: totalCalls,
            percentage: productivity,
          },
        },
      },
    };
  }

  // async getTeamCoverage() {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   const now = new Date();

  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const endDate = now;

  //   /* ==========================================
  //    * TEAM MEMBERS
  //    * ========================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Team coverage fetched successfully',
  //       data: {
  //         users: 0,
  //         vans: 0,
  //         warehouse: 0,
  //         routes: 0,
  //         outlets: 0,
  //         outletsPlanned: 0,
  //         upc: 0,
  //         utc: 0,
  //         uic: 0,
  //       },
  //     };
  //   }

  //   /* ==========================================
  //    * TEAM VANS
  //    * ========================================== */
  //   const vans = await this.vanModel.find(
  //     {
  //       associatedUsers: {
  //         $in: employeeIds,
  //       },
  //       status: VanStatus.ACTIVE,
  //     },
  //     {
  //       associatedRoutes: 1,
  //       warehouseId: 1,
  //     },
  //   );

  //   /* ==========================================
  //    * ROUTES
  //    * ========================================== */
  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || []).map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   const visitedBeatIds = await this.routeSessionModel.distinct('routeId', {
  //     userId: {
  //       $in: employeeIds,
  //     },
  //     routeId: {
  //       $in: routeIds,
  //     },
  //     sessionDate: {
  //       $gte: startDate,
  //       $lte: endDate,
  //     },
  //   });

  //   /* ==========================================
  //    * WAREHOUSES
  //    * ========================================== */
  //   const warehouseIds = [];

  //   /* ==========================================
  //    * ASSIGNED OUTLETS
  //    * ========================================== */
  //   const assignedCustomerIds = await this.routeCustomerMappingModel.distinct(
  //     'customerId',
  //     {
  //       routeId: {
  //         $in: routeIds,
  //       },
  //       status: RouteCustomerMappingStatus.ACTIVE,
  //     },
  //   );

  //   const outlets = assignedCustomerIds.length;

  //   /* ==========================================
  //    * UTC (UNIQUE VISITED OUTLETS)
  //    * ========================================== */
  //   const visitedOutletIds = await this.shopVisitModel.distinct('outletId', {
  //     employeeId: {
  //       $in: employeeIds,
  //     },
  //     status: ShopVisitStatus.COMPLETED,
  //     checkInTime: {
  //       $gte: startDate,
  //       $lte: endDate,
  //     },
  //   });

  //   const utc = visitedOutletIds.length;

  //   /* ==========================================
  //    * UPC (UNIQUE PRODUCTIVE OUTLETS)
  //    * ========================================== */
  //   const productiveCustomerIds = await this.saleModal.distinct('customerId', {
  //     employeeId: {
  //       $in: employeeIds,
  //     },
  //     status: SaleStatus.COMPLETED,
  //     date: {
  //       $gte: startDate,
  //       $lte: endDate,
  //     },
  //   });

  //   const upc = productiveCustomerIds.length;

  //   /* ==========================================
  //    * OUTLETS PLANNED
  //    * ========================================== */
  //   const plannedCustomerIds = visitedBeatIds.length
  //     ? await this.routeCustomerMappingModel.distinct('customerId', {
  //         routeId: {
  //           $in: visitedBeatIds,
  //         },
  //         status: RouteCustomerMappingStatus.ACTIVE,
  //       })
  //     : [];

  //   const outletsPlanned = plannedCustomerIds.length;

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Team coverage fetched successfully',
  //     data: {
  //       users: employeeIds.length,
  //       vans: vans.length,
  //       warehouse: warehouseIds.length,
  //       routes: routeIds.length,
  //       outlets,
  //       outletsPlanned,
  //       upc,
  //       utc,
  //       uic: upc,
  //     },
  //   };
  // }

  async getTeamCoverage() {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    /* ==========================================
     * TEAM MEMBERS (DIRECT + INDIRECT)
     * ========================================== */
    const employeeIds: any = await this.model.distinct('employeeId', {
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    employeeIds.push(managerId); // Include manager themselves

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Team coverage fetched successfully',
        data: {
          users: 0,
          vans: 0,
          warehouse: 0,
          routes: 0,
          outlets: 0,
          outletsPlanned: 0,
          upc: 0,
          utc: 0,
          uic: 0,
        },
      };
    }

    /* ==========================================
     * ASSIGNED VANS
     * ========================================== */
    const vans = await this.vanModel.find(
      {
        associatedUsers: { $in: employeeIds },
        status: VanStatus.ACTIVE,
      },
      {
        vanId: 1,
        warehouseId: 1,
        associatedRoutes: 1,
      },
      { lean: true },
    );

    const vanIds = vans.map((v: any) => v.vanId);

    /* ==========================================
     * WAREHOUSES
     * ========================================== */
    const warehouseIds = [
      ...new Set(vans.map((v: any) => v.warehouseId).filter(Boolean)),
    ];

    /* ==========================================
     * ROUTES FROM ASSIGNED VANS
     * ========================================== */
    const routeIds = [
      ...new Set(
        vans.flatMap((van: any) =>
          (van.associatedRoutes || []).map((route: any) => route.routeId),
        ),
      ),
    ];

    console.log(routeIds, 'routeIds');
    /* ==========================================
     * ASSIGNED OUTLETS
     * ========================================== */
    const assignedCustomerIds =
      routeIds.length > 0
        ? await this.routeCustomerMappingModel.distinct('customerId', {
            routeId: { $in: routeIds },
            status: RouteCustomerMappingStatus.ACTIVE,
          })
        : [];

    const outlets = assignedCustomerIds.length;

    /* ==========================================
     * VISITED ROUTES (MTD)
     * ========================================== */
    const visitedBeatIds =
      routeIds.length > 0
        ? await this.routeSessionModel.distinct('routeId', {
            userId: { $in: employeeIds },
            routeId: { $in: routeIds },
            sessionDate: {
              $gte: startDate,
              $lte: endDate,
            },
          })
        : [];

    /* ==========================================
     * PLANNED OUTLETS
     * Only routes actually visited this month
     * ========================================== */
    const plannedCustomerIds =
      visitedBeatIds.length > 0
        ? await this.routeCustomerMappingModel.distinct('customerId', {
            routeId: { $in: visitedBeatIds },
            status: RouteCustomerMappingStatus.ACTIVE,
          })
        : [];

    const outletsPlanned = plannedCustomerIds.length;

    /* ==========================================
     * UNIQUE VISITED OUTLETS (UTC)
     * ========================================== */
    const visitedOutletIds =
      employeeIds.length > 0
        ? await this.shopVisitModel.distinct('outletId', {
            employeeId: { $in: employeeIds },
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startDate,
              $lte: endDate,
            },
          })
        : [];

    const utc = visitedOutletIds.length;

    /* ==========================================
     * UNIQUE PRODUCTIVE OUTLETS (UPC)
     * ========================================== */
    const productiveCustomerIds =
      employeeIds.length > 0
        ? await this.saleModal.distinct('customerId', {
            employeeId: { $in: employeeIds },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          })
        : [];

    const upc = productiveCustomerIds.length;

    /* ==========================================
     * UNIQUE INVOICED CUSTOMERS (UIC)
     * ========================================== */
    const uic = upc;

    return {
      statusCode: HttpStatus.OK,
      message: 'Team coverage fetched successfully',
      data: {
        users: employeeIds.length - 1, // Exclude manager themselves
        vans: vanIds.length,
        warehouse: warehouseIds.length,
        routes: routeIds.length,
        outlets,
        outletsPlanned,
        upc,
        utc,
        uic,
      },
    };
  }

  async getBeatOMeter() {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds: any = employees.map((employee) => employee.employeeId);

    employeeIds.push(managerId); // Include manager themselves
    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Beat-O-Meter fetched successfully',
        data: {
          totalOutlets: 0,
          summary: {
            visitedOutlets: 0,
            orderedOutlets: 0,
            visitedPercentage: 0,
            orderedPercentage: 0,
          },
          outletTypes: [],
        },
      };
    }

    /* ==========================================
     * TEAM VANS
     * ========================================== */
    const vans = await this.vanModel.find(
      {
        associatedUsers: {
          $in: employeeIds,
        },
        status: VanStatus.ACTIVE,
      },
      {
        associatedRoutes: 1,
      },
    );

    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || []).map((route) => route.routeId),
        ),
      ),
    ];

    /* ==========================================
     * ASSIGNED CUSTOMERS
     * ========================================== */
    const customerIds = await this.routeCustomerMappingModel.distinct(
      'customerId',
      {
        routeId: {
          $in: routeIds,
        },
        status: RouteCustomerMappingStatus.ACTIVE,
      },
    );

    const customers: any = await this.customerModel.find({
      customerId: {
        $in: customerIds,
      },
    });

    /* ==========================================
     * SALES HISTORY
     * ========================================== */
    const salesHistory = await this.saleModal.aggregate([
      {
        $match: {
          customerId: {
            $in: customerIds,
          },
          status: SaleStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: '$customerId',
          lastOrderDate: {
            $max: '$date',
          },
        },
      },
    ]);

    const lastOrderMap = new Map(
      salesHistory.map((item) => [item._id, item.lastOrderDate]),
    );

    /* ==========================================
     * VISIT HISTORY
     * ========================================== */
    const visitHistory = await this.shopVisitModel.aggregate([
      {
        $match: {
          outletId: {
            $in: customerIds,
          },
          status: ShopVisitStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: '$outletId',
          lastVisitedAt: {
            $max: '$checkInTime',
          },
        },
      },
    ]);

    const lastVisitMap = new Map(
      visitHistory.map((item) => [item._id, item.lastVisitedAt]),
    );

    /* ==========================================
     * MTD VISITED
     * ========================================== */
    const visitedCustomerIds = await this.shopVisitModel.distinct('outletId', {
      employeeId: {
        $in: employeeIds,
      },
      outletId: {
        $in: customerIds,
      },
      status: ShopVisitStatus.COMPLETED,
      checkInTime: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const visitedSet = new Set(visitedCustomerIds);

    /* ==========================================
     * MTD ORDERED
     * ========================================== */
    const orderedCustomerIds = await this.saleModal.distinct('customerId', {
      employeeId: {
        $in: employeeIds,
      },
      customerId: {
        $in: customerIds,
      },
      status: SaleStatus.COMPLETED,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const orderedSet = new Set(orderedCustomerIds);

    /* ==========================================
     * BEAT-O-METER BUCKETS
     * ========================================== */
    const buckets: any = {
      NEW: [],
      ACTIVE: [],
      TO_BE_DORMANT: [],
      DORMANT: [],
      NO_ORDER: [],
      NEVER_VISITED: [],
    };

    for (const customer of customers) {
      const customerId = customer.customerId;

      const lastOrder = lastOrderMap.get(customerId);

      const lastVisited = lastVisitMap.get(customerId);

      const createdAt = customer.createdAt
        ? new Date(customer.createdAt)
        : null;
      const ageDays = createdAt
        ? Math.floor((now.getTime() - createdAt.getTime()) / 86400000)
        : Number.POSITIVE_INFINITY;

      if (ageDays <= 30) {
        buckets.NEW.push(customerId);
      }

      if (customer.status === CustomerStatus.ACTIVE) {
        buckets.ACTIVE.push(customerId);
      }

      if (!lastOrder) {
        buckets.NO_ORDER.push(customerId);
      }

      if (!lastVisited) {
        buckets.NEVER_VISITED.push(customerId);
        continue;
      }

      if (!lastOrder) {
        continue;
      }

      const orderAge = Math.floor(
        (now.getTime() - new Date(lastOrder).getTime()) / 86400000,
      );

      if (orderAge >= 60) {
        buckets.DORMANT.push(customerId);
      } else if (orderAge >= 45) {
        buckets.TO_BE_DORMANT.push(customerId);
      }
    }

    const buildRow = (label: string, customerList: string[]) => {
      const total = customerList.length;

      const visited = customerList.filter((id) => visitedSet.has(id)).length;

      const ordered = customerList.filter((id) => orderedSet.has(id)).length;

      return {
        type: label,

        total,

        mtdVisited: {
          count: visited,
          percentage:
            total > 0 ? Number(((visited / total) * 100).toFixed(1)) : 0,
        },

        mtdOrder: {
          count: ordered,
          percentage:
            total > 0 ? Number(((ordered / total) * 100).toFixed(1)) : 0,
        },
      };
    };

    const totalOutlets = customerIds.length;

    const visitedOutlets = visitedCustomerIds.length;

    const orderedOutlets = orderedCustomerIds.length;

    return {
      statusCode: HttpStatus.OK,
      message: 'Beat-O-Meter fetched successfully',
      data: {
        totalOutlets,

        summary: {
          visitedOutlets,
          orderedOutlets,
          visitedPercentage:
            totalOutlets > 0
              ? Number(((visitedOutlets / totalOutlets) * 100).toFixed(1))
              : 0,
          orderedPercentage:
            totalOutlets > 0
              ? Number(((orderedOutlets / totalOutlets) * 100).toFixed(1))
              : 0,
        },

        outletTypes: [
          buildRow('New', buckets.NEW),
          buildRow('Active', buckets.ACTIVE),
          buildRow('To Be Dormant', buckets.TO_BE_DORMANT),
          buildRow('Dormant', buckets.DORMANT),
          buildRow('No Order', buckets.NO_ORDER),
          buildRow('Never Visited', buckets.NEVER_VISITED),
        ],
      },
    };
  }

  async getFieldUsersSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    const startOfDay = date ? parseCalendarDate(date) : new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = date ? parseCalendarDate(date) : new Date();
    endOfDay.setHours(23, 59, 59, 999);

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    if (!employees.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Field users summary fetched successfully',
        data: [],
      };
    }

    const result = await Promise.all(
      employees.map(async (employee) => {
        /* ==========================================
         * DATE ACTIVITY
         * ========================================== */
        const [activity, leave] = await Promise.all([
          this.activityModel
            .findOne({
              userId: employee.employeeId,
              status: {
                $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
              },
              startTime: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            })
            .sort({
              startTime: -1,
            })
            .lean(),
          this.leaveModel
            .findOne({
              userId: employee.employeeId,
              status: LeaveStatus.COMPLETED,
              createdAt: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            })
            .sort({
              createdAt: -1,
            })
            .lean(),
        ]);
        const activityName = activity?.name || (leave ? 'Leave' : 'Offline');
        const isOfficialWork =
          activityName === 'Official Work' || activityName === 'Office Work';
        const isRetailing = activityName === 'Retailing';

        /* ==========================================
         * ROUTE SESSION
         * ========================================== */
        const routeSession = await this.routeSessionModel
          .findOne(
            {
              userId: employee.employeeId,
              status: {
                $in: [RouteSessionStatus.ACTIVE, RouteSessionStatus.COMPLETED],
              },
              sessionDate: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
            {
              routeId: 1,
              routeName: 1,
              startTime: 1,
            },
          )
          .sort({ startTime: -1 })
          .lean();
        let routeName = '-';

        if (routeSession?.routeName) {
          routeName = routeSession.routeName;
        } else if (routeSession?.routeId) {
          const route = await this.routeModel
            .findOne(
              {
                routeId: routeSession.routeId,
              },
              {
                name: 1,
              },
            )
            .lean();

          routeName = route?.name || '-';
        }

        /* ==========================================
         * FIRST CALL
         * ========================================== */
        const firstCall = await this.shopVisitModel
          .findOne({
            employeeId: employee.employeeId,
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          })
          .sort({
            checkInTime: 1,
          })
          .lean();

        /* ==========================================
         * FIRST PRODUCTIVE CALL
         * ========================================== */
        const firstPc = await this.saleModal
          .findOne({
            employeeId: employee.employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          })
          .sort({
            date: 1,
          })
          .lean();

        /* ==========================================
         * TC
         * ========================================== */
        const tcCalls = await this.shopVisitModel.countDocuments({
          employeeId: employee.employeeId,
          status: ShopVisitStatus.COMPLETED,
          checkInTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        /* ==========================================
         * PC
         * ========================================== */
        const pcCalls = await this.saleModal.countDocuments({
          employeeId: employee.employeeId,
          status: SaleStatus.COMPLETED,
          date: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        /* ==========================================
         * LPC
         * LPC = Order item lines / Productive Calls
         * ========================================== */
        const saleIds = await this.saleModal.distinct('saleId', {
          employeeId: employee.employeeId,
          status: SaleStatus.COMPLETED,
          date: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        const orderItemLines = saleIds.length
          ? await this.saleItemModel.countDocuments({
              saleId: {
                $in: saleIds,
              },
            })
          : 0;

        const tc = tcCalls;

        const pc = pcCalls;

        const lpc = pc > 0 ? Number((orderItemLines / pc).toFixed(1)) : 0;

        return {
          employeeId: employee.employeeId,

          employeeName: employee.name,

          mobile: employee.mobile || '',

          activity: {
            name: activityName,
            color: isOfficialWork
              ? '#6D28D9'
              : isRetailing
                ? '#22C55E'
                : leave
                  ? '#F59E0B'
                  : '#EF4444',
          },

          routeName: isOfficialWork ? 'Admin' : isRetailing ? routeName : '-',

          location:
            isRetailing || isOfficialWork ? activity?.description || '' : '',

          summary: {
            firstCallTime: firstCall?.checkInTime || null,

            firstPcTime: firstPc?.date || null,

            tc,

            pc,

            lpc,
          },
        };
      }),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Field users summary fetched successfully',
      data: result,
    };
  }

  async getManagerUserTimeline(query: { employeeId: string; date?: string }) {
    const managerId = RequestContextStore.getStore()?.userId;
    const selectedDate = query?.date
      ? parseCalendarDate(query.date)
      : new Date();
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const employee = await this.findOne({
      employeeId: query.employeeId,
      status: UserStatus.ACTIVE,
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
    });

    if (!employee) throw new NotFoundException(EMPLOYEE.NOT_FOUND);

    const [rawVisits, rawActivities, workSession] = await Promise.all([
      this.shopVisitModel
        .find({
          employeeId: query.employeeId,
          checkInTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        })
        .sort({ checkInTime: 1 })
        .lean(),
      this.activityModel
        .find({
          userId: query.employeeId,
          startTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
          status: {
            $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
          },
        })
        .sort({ startTime: 1 })
        .lean(),
      this.workSessionModel
        .findOne({
          userId: query.employeeId,
          dayStartTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        })
        .sort({ dayStartTime: 1 })
        .lean(),
    ]);

    const uniqueBy = <T>(items: T[], getKey: (item: T) => string) => {
      const seen = new Set<string>();

      return items.filter((item) => {
        const key = getKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const visits = uniqueBy(rawVisits, (visit: any) => visit.visitId);
    const activities = uniqueBy(
      rawActivities,
      (activity: any) =>
        activity.activityId ||
        `${activity.name}-${activity.startTime}-${activity.description}`,
    );
    const visitIds = visits.map((visit) => visit.visitId);

    const [rawSales, rawNonSales] = await Promise.all([
      visitIds.length
        ? this.saleModal
            .find({
              employeeId: query.employeeId,
              visitId: { $in: visitIds },
              status: SaleStatus.COMPLETED,
            })
            .sort({ date: 1 })
            .lean()
        : [],
      visitIds.length
        ? this.nonSaleModel
            .find({
              employeeId: query.employeeId,
              visitId: { $in: visitIds },
              status: NonSaleStatus.COMPLETED,
            })
            .lean()
        : [],
    ]);

    const sales = uniqueBy(rawSales, (sale: any) => sale.saleId);
    const nonSales = uniqueBy(rawNonSales, (nonSale: any) => nonSale.nonSaleId);

    const salesByVisit = new Map<string, any>(
      sales.map((sale: any) => [sale.visitId, sale] as [string, any]),
    );
    const nonSalesByVisit = new Map<string, any>(
      nonSales.map(
        (nonSale: any) => [nonSale.visitId, nonSale] as [string, any],
      ),
    );
    const saleIds = sales.map((sale) => sale.saleId);
    const saleItems = saleIds.length
      ? await this.saleItemModel.aggregate([
          {
            $match: {
              saleId: { $in: saleIds },
            },
          },
          {
            $lookup: {
              from: 'product_master',
              localField: 'productId',
              foreignField: 'productId',
              as: 'product',
            },
          },
          {
            $unwind: {
              path: '$product',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: 'productcategories',
              localField: 'product.categoryId',
              foreignField: 'categoryId',
              as: 'category',
            },
          },
          {
            $unwind: {
              path: '$category',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              saleId: 1,
              productId: 1,
              productName: 1,
              caseQty: 1,
              pieceQty: 1,
              quantity: 1,
              casePrice: 1,
              totalValue: 1,
              totalNetWeight: 1,
              categoryId: {
                $ifNull: ['$product.categoryId', 'UNKNOWN'],
              },
              categoryName: {
                $ifNull: ['$category.name', 'Unknown'],
              },
            },
          },
        ])
      : [];

    const itemsBySaleId = new Map<string, any[]>();
    for (const item of saleItems) {
      const currentItems = itemsBySaleId.get(item.saleId) || [];
      currentItems.push(item);
      itemsBySaleId.set(item.saleId, currentItems);
    }

    const formatNumberValue = (value?: number) =>
      Number(value || 0).toLocaleString('en-US', {
        maximumFractionDigits: 2,
      });

    const formatActivityTime = (value?: Date | string | null) => {
      if (!value) return '--';
      const dateValue = new Date(value);
      if (Number.isNaN(dateValue.getTime())) return '--';

      return dateValue.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    };

    const formatDuration = (
      start?: Date | string | null,
      end?: Date | string | null,
    ) => {
      if (!start || !end) return '< 1 min';
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const minutes = Math.max(Math.round(diffMs / 60000), 0);
      if (minutes < 1) return '< 1 min';
      if (minutes === 1) return '1 min';
      return `${minutes} mins`;
    };

    const normalizeLocation = (location?: any) => {
      const latitude = Number(location?.latitude);
      const longitude = Number(location?.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        latitude,
        longitude,
        accuracy: location?.accuracy,
        altitude: location?.altitude,
        speed: location?.speed,
        capturedAt: location?.capturedAt || null,
      };
    };

    const latestBackgroundLocation = (workSession?.backgroundLocations || [])
      .map((location, index) => ({
        location: normalizeLocation(location),
        index,
      }))
      .filter((item) => item.location)
      .sort(
        (first: any, second: any) =>
          new Date(second.location.capturedAt || 0).getTime() -
            new Date(first.location.capturedAt || 0).getTime() ||
          second.index - first.index,
      )[0]?.location;
    const dayStartLocation = normalizeLocation(workSession?.dayStartLocation);
    const dayEndLocation = normalizeLocation(workSession?.dayEndLocation);
    const currentLocation =
      dayEndLocation || latestBackgroundLocation || dayStartLocation || null;

    const buildOrderDetail = (sale: any) => {
      const items = itemsBySaleId.get(sale.saleId) || [];
      const categoryMap = new Map<string, any>();

      for (const item of items) {
        const categoryId = item.categoryId || 'UNKNOWN';
        const category = categoryMap.get(categoryId) || {
          id: categoryId,
          name: item.categoryName || 'Unknown',
          caseQty: 0,
          pieceQty: 0,
          value: 0,
          lines: [],
        };

        category.caseQty += Number(item.caseQty || 0);
        category.pieceQty += Number(item.pieceQty || 0);
        category.value += Number(item.totalValue || 0);
        if (
          !category.lines.some(
            (line) => line.id === `${sale.saleId}-${item.productId}`,
          )
        ) {
          category.lines.push({
            id: `${sale.saleId}-${item.productId}`,
            name: item.productName || item.productId,
            ptr: `ZMW ${formatNumberValue(item.casePrice)}`,
            qty: formatNumberValue(item.quantity),
            unit: `${formatNumberValue(item.caseQty)} Cases ${formatNumberValue(
              item.pieceQty,
            )} Pcs`,
            value: `ZMW ${formatNumberValue(item.totalValue)}`,
          });
        }

        categoryMap.set(categoryId, category);
      }

      return {
        orderNo: sale.saleId,
        outlet: sale.customerName || sale.customerId,
        quantityCases: formatNumberValue(sale.netCases),
        quantitySuperUnit: formatNumberValue(sale.totalQty),
        totalPieces: formatNumberValue(sale.totalPieces),
        netValue: formatNumberValue(sale.totalValue),
        categories: Array.from(categoryMap.values()).map((category) => ({
          id: category.id,
          name: category.name,
          meta: `${formatNumberValue(category.caseQty)} Cases ${formatNumberValue(
            category.pieceQty,
          )} Pcs`,
          value: formatNumberValue(category.value),
          lines: category.lines,
        })),
        schemeDiscount: '0',
        cashDiscount: '0',
        tax: '0',
        payableAmount: formatNumberValue(sale.totalValue),
      };
    };

    const visitActivities = visits.map((visit) => {
      const sale: any = salesByVisit.get(visit.visitId);
      const nonSale: any = nonSalesByVisit.get(visit.visitId);
      const metrics = sale
        ? [
            { label: 'Value(ZMW)', value: formatNumberValue(sale.totalValue) },
            {
              label: 'NetValue(ZMW)',
              value: formatNumberValue(sale.totalValue),
            },
            { label: 'Qty(Cases)', value: formatNumberValue(sale.netCases) },
            { label: 'Tonnage', value: formatNumberValue(sale.totalWeight) },
            { label: 'Pieces', value: formatNumberValue(sale.totalPieces) },
            { label: 'Payment', value: sale.paymentStatus || '--' },
          ]
        : [
            { label: 'Visit Type', value: visit.visitType || '--' },
            { label: 'Status', value: visit.status || '--' },
            { label: 'Reason', value: nonSale?.reasonId || '--' },
            { label: 'Remark', value: nonSale?.remark || '--' },
          ];

      return {
        id: sale?.saleId || nonSale?.nonSaleId || visit.visitId,
        source: sale ? 'sale' : nonSale ? 'non-sale' : 'visit',
        type: sale
          ? 'VANSALES ACTIVITY'
          : nonSale
            ? 'NON SALE ACTIVITY'
            : 'SHOP VISIT',
        time: formatActivityTime(visit.checkInTime),
        duration: formatDuration(visit.checkInTime, visit.checkOutTime),
        outlet: visit.outletName || sale?.customerName || visit.outletId,
        owner: sale?.customerName || visit.outletName || visit.outletId,
        metrics,
        location:
          normalizeLocation(visit.checkOutLocation) ||
          normalizeLocation(visit.checkInLocation),
        checkInLocation: normalizeLocation(visit.checkInLocation),
        checkOutLocation: normalizeLocation(visit.checkOutLocation),
        order: sale ? buildOrderDetail(sale) : undefined,
        sortTime: new Date(visit.checkInTime).getTime(),
      };
    });

    const workActivities = activities
      .filter((activity) => activity.name !== 'Retailing')
      .map((activity) => ({
        id: activity.activityId,
        source: 'activity',
        type: `${activity.name || 'ACTIVITY'}`.toUpperCase(),
        time: formatActivityTime(activity.startTime),
        duration: formatDuration(activity.startTime, activity.endTime),
        outlet: activity.description || activity.category || activity.name,
        owner: activity.userName || employee.name,
        metrics: [
          { label: 'Status', value: activity.status || '--' },
          { label: 'Category', value: activity.category || '--' },
          { label: 'Sub Category', value: activity.subCategory || '--' },
        ],
        sortTime: new Date(activity.startTime).getTime(),
      }));

    const data = uniqueBy(
      [...visitActivities, ...workActivities],
      (activity: any) =>
        `${activity.source}-${activity.id}-${activity.time}-${activity.outlet}`,
    )
      .sort((a, b) => a.sortTime - b.sortTime)
      .map(({ sortTime, ...activity }) => activity);
    const dayStartTime =
      workSession?.dayStartTime ||
      activities[0]?.startTime ||
      visits[0]?.checkInTime ||
      null;

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager user timeline fetched successfully',
      data: {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        date: selectedDate,
        dayStartTime: dayStartTime ? formatActivityTime(dayStartTime) : null,
        dayEndTime: workSession?.dayEndTime
          ? formatActivityTime(workSession.dayEndTime)
          : null,
        dayStartImageUrl: workSession?.dayStartImageUrl || null,
        dayStartImageMediaId: workSession?.dayStartImageMediaId || null,
        dayStartLocation,
        dayEndLocation,
        currentLocation,
        activities: data,
      },
    };
  }

  private getDayRange(date?: string) {
    const selectedDate = date ? parseCalendarDate(date) : new Date();
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    return { selectedDate, startOfDay, endOfDay };
  }

  private getMonthRange(date?: string) {
    const selectedDate = date ? parseCalendarDate(date) : new Date();
    const startOfMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1,
    );
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    return { selectedDate, startOfMonth, endOfDay };
  }

  private async getManagedEmployee(employeeId: string) {
    const managerId = RequestContextStore.getStore()?.userId;
    const employee = await this.findOne({
      employeeId,
      status: UserStatus.ACTIVE,
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
    });

    if (!employee) throw new NotFoundException(EMPLOYEE.NOT_FOUND);

    return employee;
  }

  private async getAssignedBeatCustomers(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const vans = await this.vanModel
      .find(
        {
          associatedUsers: employeeId,
          status: VanStatus.ACTIVE,
        },
        {
          associatedRoutes: 1,
        },
      )
      .lean();

    const routeIds = [
      ...new Set(
        vans.flatMap((van: any) =>
          (van.associatedRoutes || [])
            .filter((route: any) => {
              const fromDate = route.fromDate ? new Date(route.fromDate) : null;
              const toDate = route.toDate ? new Date(route.toDate) : null;

              return (
                route.routeId &&
                (!fromDate || fromDate <= endDate) &&
                (!toDate || toDate >= startDate)
              );
            })
            .map((route: any) => route.routeId),
        ),
      ),
    ];

    if (!routeIds.length) return [];

    return this.routeCustomerMappingModel
      .find({
        routeId: { $in: routeIds },
        status: RouteCustomerMappingStatus.ACTIVE,
        effectiveFrom: { $lte: endDate },
        $or: [
          { effectiveTo: null },
          { effectiveTo: { $exists: false } },
          { effectiveTo: { $gte: startDate } },
        ],
      })
      .sort({ sequence: 1 })
      .lean();
  }

  async getManagerUserMtdSummary(query: { employeeId: string; date?: string }) {
    const employee = await this.getManagedEmployee(query.employeeId);
    const { selectedDate, startOfMonth, endOfDay } = this.getMonthRange(
      query.date,
    );

    const [assignedBeatCustomers, visitedOutletIds, billedOutletIds] =
      await Promise.all([
        this.getAssignedBeatCustomers(
          employee.employeeId,
          startOfMonth,
          endOfDay,
        ),
        this.shopVisitModel.distinct('outletId', {
          employeeId: employee.employeeId,
          checkInTime: {
            $gte: startOfMonth,
            $lte: endOfDay,
          },
          status: ShopVisitStatus.COMPLETED,
        }),
        this.saleModal.distinct('customerId', {
          employeeId: employee.employeeId,
          date: {
            $gte: startOfMonth,
            $lte: endOfDay,
          },
          status: SaleStatus.COMPLETED,
        }),
      ]);

    const visitedBeatOutletCount = new Set(
      assignedBeatCustomers.map((mapping: any) => mapping.customerId),
    ).size;
    const utc = visitedOutletIds.length;
    const upc = billedOutletIds.length;
    const zeroOrder = Math.max(utc - upc, 0);
    const notVisited = Math.max(visitedBeatOutletCount - utc, 0);
    const total = utc + upc + zeroOrder + notVisited;

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager user MTD summary fetched successfully',
      data: {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        date: formatCalendarDate(selectedDate),
        utc,
        upc,
        zeroOrder,
        notVisited,
        total,
      },
    };
  }

  async getManagerUserRoutePlan(query: { employeeId: string; date?: string }) {
    const employee = await this.getManagedEmployee(query.employeeId);
    const { selectedDate, startOfDay, endOfDay } = this.getDayRange(query.date);
    const assignedBeatCustomers = await this.getAssignedBeatCustomers(
      employee.employeeId,
      startOfDay,
      endOfDay,
    );
    const customerIds = [
      ...new Set(
        assignedBeatCustomers.map((mapping: any) => mapping.customerId),
      ),
    ];

    const [customers, visitedOutletIds, billedOutletIds] = await Promise.all([
      customerIds.length
        ? this.customerModel
            .find(
              { customerId: { $in: customerIds } },
              { customerId: 1, name: 1, customerTypeId: 1 },
            )
            .lean()
        : [],
      customerIds.length
        ? this.shopVisitModel.distinct('outletId', {
            employeeId: employee.employeeId,
            outletId: { $in: customerIds },
            checkInTime: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: ShopVisitStatus.COMPLETED,
          })
        : [],
      customerIds.length
        ? this.saleModal.distinct('customerId', {
            employeeId: employee.employeeId,
            customerId: { $in: customerIds },
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: SaleStatus.COMPLETED,
          })
        : [],
    ]);

    const customersById = new Map<string, any>(
      customers.map(
        (customer: any) => [customer.customerId, customer] as [string, any],
      ),
    );
    const visited = new Set(visitedOutletIds);
    const billed = new Set(billedOutletIds);
    const seen = new Set<string>();
    const stops = assignedBeatCustomers
      .filter((mapping: any) => {
        if (!mapping.customerId || seen.has(mapping.customerId)) return false;
        seen.add(mapping.customerId);
        return true;
      })
      .map((mapping: any, index: number) => {
        const customer = customersById.get(mapping.customerId);
        const isVisited = visited.has(mapping.customerId);
        const isBilled = billed.has(mapping.customerId);

        return {
          id: mapping.mappingId || mapping.customerId,
          outletId: mapping.customerId,
          name: customer?.name || mapping.customerId,
          time: `Stop ${index + 1}`,
          status: isBilled ? 'completed' : isVisited ? 'missed' : 'pending',
          type: customer?.customerTypeId || 'Outlet',
        };
      });

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager user route plan fetched successfully',
      data: {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        date: formatCalendarDate(selectedDate),
        stops,
      },
    };
  }
}
