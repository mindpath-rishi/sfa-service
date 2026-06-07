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
      reportsTo,
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

    if (reportsTo) {
      filter.reportsTo = reportsTo;
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
  //     $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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

  async getManagerStats(query: { date?: string }) {
    const managerId = RequestContextStore.getStore()?.userId;

    const startOfDay = query?.date ? new Date(query.date) : new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    /* =====================================================
     * TEAM MEMBERS
     * ===================================================== */
    const employees = await this.find({
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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
          },
        },
      };
    }

    const [
      retailingUsers,
      officeUsers,
      leaveUsers,
      sales,
      tc,
      productiveCustomers,
    ] = await Promise.all([
      /* ========================================
       * RETAILING USERS
       * ======================================== */
      this.activityModel.distinct('userId', {
        userId: { $in: employeeIds },
        status: ActivityStatus.ACTIVE,
        name: 'Retailing',
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      }),

      /* ========================================
       * OFFICE WORK USERS
       * ======================================== */
      this.activityModel.distinct('userId', {
        userId: { $in: employeeIds },
        status: ActivityStatus.ACTIVE,
        name: 'Office Work',
        createdAt: {
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

            // Qty Cases
            qtyCases: {
              $sum: '$netCases',
            },
          },
        },
      ]),

      /* ========================================
       * TOTAL CALLS (TC)
       * ======================================== */
      this.shopVisitModel.countDocuments({
        employeeId: { $in: employeeIds },
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
        status: ShopVisitStatus.COMPLETED,
      }),

      /* ========================================
       * PRODUCTIVE CALLS (PC)
       * ======================================== */
      this.saleModal.distinct('customerId', {
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
    const pc = productiveCustomers.length;

    // Covered Outlets
    const covered = pc;

    // Productivity %
    const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(0)) : 0;

    const salesSummary = sales[0] || {
      sc: 0,
      qtyCases: 0,
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

          // Sales Value
          sc: salesSummary.sc,

          // Total Cases Sold
          qtyCases: Number(
            salesSummary.qtyCases?.toFixed?.(1) ?? salesSummary.qtyCases ?? 0,
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

    const dateFilter = {
      createdAt: {
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
            ...dateFilter,
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
        { $match: { employeeId, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalOrderValue: { $sum: '$totalValue' },
          },
        },
      ]),

      // 💰 Payment Collections (Today)
      this.paymentModel.aggregate([
        { $match: { employeeId, ...dateFilter } },
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

        orders: {
          count: salesData[0]?.totalOrders || 0,
          value: salesData[0]?.totalOrderValue || 0,
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

    const now = endDateParam ? new Date(endDateParam) : date ? new Date(date) : new Date();
    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange ? new Date(endDateParam || startDateParam!) : now;
    endDate.setHours(23, 59, 59, 999);

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
    ] =
      await Promise.all([
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
                },
              },
            },
          },
          {
            $count: 'days',
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

    const [activityDaySummary, visitDaySummary, salesDaySummary, leaveDaySummary] =
      await Promise.all([
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
    const dayWiseSummary: any[] = [];
    const dayCursor = new Date(startDate);

    while (dayCursor <= endDate) {
      const dayKey = dayCursor.toISOString().split('T')[0];
      const activity = activityDayMap.get(dayKey) || {};
      const visits = visitDayMap.get(dayKey) || {};
      const daySales = salesDayMap.get(dayKey) || {};
      const leave = leaveDayMap.get(dayKey) || {};

      dayWiseSummary.push({
        date: dayKey,
        label: formatDayLabel(dayCursor),
        retailing: Number(activity.retailing || 0),
        officialWork: Number(activity.officialWork || 0),
        leave: Number(leave.leave || 0),
        absent: 0,
        totalActivities: Number(activity.totalActivities || 0),
        tc: Number(visits.tc || 0),
        pc: Number(daySales.pc || 0),
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
      lmtdTarget > 0 ? Number(((lmtdAchieved / lmtdTarget) * 100).toFixed(2)) : 0;
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
        },
      },
    };
  }

  async getPrimaryCategoryTargetSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    /* ==========================================
     * MTD DATE RANGE
     * ========================================== */
    const now = date ? new Date(date) : new Date();

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
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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

    const now = date ? new Date(date) : new Date();

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
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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
          },
        },
      ]),
    ]);

    const targetMap = new Map(
      targets.map((item) => [item._id, item.targetCases]),
    );

    const achievementMap = new Map(
      achievements.map((item) => [item._id, item.achievementCases]),
    );

    const totalDaysInMonth = monthEndDate.getDate();

    const elapsedDays =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    const remainingDays = Math.max(totalDaysInMonth - elapsedDays, 1);

    const result = employees.map((employee) => {
      const targetCases = targetMap.get(employee.employeeId) || 0;

      const achievementCases = achievementMap.get(employee.employeeId) || 0;

      const remainingCases = Math.max(targetCases - achievementCases, 0);

      const crr = elapsedDays > 0 ? achievementCases / elapsedDays : 0;

      const rrr = remainingDays > 0 ? remainingCases / remainingDays : 0;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        // designation: employee.roleName || '',
        targetCases: Number(targetCases.toFixed(2)),
        achievementCases: Number(achievementCases.toFixed(2)),
        rrr: Number(rrr.toFixed(2)),
        crr: Number(crr.toFixed(2)),
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'User target summary fetched successfully',
      data: result.sort((a, b) => b.achievementCases - a.achievementCases),
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
  //     $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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

  async getManagerOrderSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = date ? new Date(date) : new Date();

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
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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
            categories: [],
          },

          managerOrderSummary: {
            orders: 0,
            validation: 0,
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
          (van.associatedRoutes || []).map((route) => route.routeId),
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
      zeroOrderOutlets,
    ] = await Promise.all([
      /* ======================================
       * PRIMARY CATEGORY WISE ORDER
       * ====================================== */
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
            _id: '$categoryId',

            category: {
              $first: '$category',
            },

            cases: {
              $sum: '$achievedCases',
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
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /* ======================================
       * PRODUCTIVE CALLS (PC)
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

    const categories = categoryTargets.map((item) => ({
      categoryId: item._id,
      category: item.category,
      cases: Number(item.cases || 0),

      percentage:
        totalCases > 0 ? Math.round((item.cases / totalCases) * 100) : 0,
    }));

    /* ==========================================
     * OUTLET SUMMARY
     * ========================================== */
    const tc = visitedCustomers.length;

    const pc = productiveCustomers.length;

    const zeroOrder = zeroOrderOutlets.length;

    const notVisited = Math.max(totalAssignedOutlets - tc, 0);

    const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(2)) : 0;

    const managerOrder = managerOrders?.[0] || {
      orders: 0,
      validation: 0,
    };

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager order summary fetched successfully',

      data: {
        primaryCategoryWiseOrder: {
          totalCases: Number(totalCases.toFixed(2)),

          categories,
        },

        managerOrderSummary: {
          orders: Number(managerOrder.orders || 0),

          validation: Number(managerOrder.validation || 0),
        },

        outletSummary: {
          upc: {
            count: pc,
            percentage: productivity,
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
            pc,
            tc,
            percentage: productivity,
          },
        },
      },
    };
  }

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
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees.map((employee) => employee.employeeId);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Team coverage fetched successfully',
        data: {
          warehouse: 0,
          routes: 0,
          outlets: 0,
          outletsPlanned: 0,
          upc: 0,
          uic: 0,
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
        warehouseId: 1,
      },
    );

    /* ==========================================
     * ROUTES
     * ========================================== */
    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || []).map((route) => route.routeId),
        ),
      ),
    ];

    /* ==========================================
     * WAREHOUSES
     * ========================================== */
    const warehouseIds = [];

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
      },
    );

    const outlets = assignedCustomerIds.length;

    /* ==========================================
     * UIC (UNIQUE VISITED OUTLETS)
     * ========================================== */
    const visitedCustomerIds = await this.shopVisitModel.distinct(
      'customerId',
      {
        employeeId: {
          $in: employeeIds,
        },
        status: ShopVisitStatus.COMPLETED,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    );

    const uic = visitedCustomerIds.length;

    /* ==========================================
     * UPC (UNIQUE PRODUCTIVE OUTLETS)
     * ========================================== */
    const productiveCustomerIds = await this.saleModal.distinct('customerId', {
      employeeId: {
        $in: employeeIds,
      },
      status: SaleStatus.COMPLETED,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const upc = productiveCustomerIds.length;

    /* ==========================================
     * OUTLETS PLANNED
     * ========================================== */
    const outletsPlanned = await this.routeCustomerMappingModel.countDocuments({
      routeId: {
        $in: routeIds,
      },
      status: RouteCustomerMappingStatus.ACTIVE,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Team coverage fetched successfully',
      data: {
        warehouse: warehouseIds.length,
        routes: routeIds.length,
        outlets,
        outletsPlanned,
        upc,
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
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees.map((employee) => employee.employeeId);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Beat-O-Meter fetched successfully',
        data: {
          totalOutlets: 0,
          visitedOutlets: 0,
          orderedOutlets: 0,
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
     * MTD VISITED
     * ========================================== */
    const visitedCustomerIds = await this.shopVisitModel.distinct(
      'customerId',
      {
        employeeId: {
          $in: employeeIds,
        },
        status: ShopVisitStatus.COMPLETED,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    );

    const visitedSet = new Set(visitedCustomerIds);

    /* ==========================================
     * MTD ORDERED
     * ========================================== */
    const orderedCustomerIds = await this.saleModal.distinct('customerId', {
      employeeId: {
        $in: employeeIds,
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

      const lastVisited = customer.lastVisitedAt;

      const ageDays = Math.floor(
        (now.getTime() - customer.createdAt.getTime()) / 86400000,
      );

      if (ageDays <= 30) {
        buckets.NEW.push(customerId);
        continue;
      }

      if (!lastVisited) {
        buckets.NEVER_VISITED.push(customerId);
        continue;
      }

      if (!lastOrder) {
        buckets.NO_ORDER.push(customerId);
        continue;
      }

      const orderAge = Math.floor(
        (now.getTime() - new Date(lastOrder).getTime()) / 86400000,
      );

      if (orderAge <= 30) {
        buckets.ACTIVE.push(customerId);
      } else if (orderAge <= 60) {
        buckets.TO_BE_DORMANT.push(customerId);
      } else {
        buckets.DORMANT.push(customerId);
      }
    }

    const buildRow = (label: string, customerList: string[]) => {
      const total = customerList.length;

      const visited = customerList.filter((id) => visitedSet.has(id)).length;

      const ordered = customerList.filter((id) => orderedSet.has(id)).length;

      return {
        type: label,

        total,

        visited: {
          count: visited,
          percentage:
            total > 0 ? Number(((visited / total) * 100).toFixed(1)) : 0,
        },

        ordered: {
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

    const startOfDay = date ? new Date(date) : new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportsTo: managerId }, { hierarchyPath: managerId }],
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
         * CURRENT ACTIVITY
         * ========================================== */
        const activity = await this.activityModel
          .findOne({
            userId: employee.employeeId,
            status: ActivityStatus.ACTIVE,
          })
          .sort({
            startTime: -1,
          })
          .lean();

        /* ==========================================
         * USER VAN
         * ========================================== */
        const van = await this.vanModel
          .findOne(
            {
              associatedUsers: employee.employeeId,
              status: VanStatus.ACTIVE,
            },
            {
              name: 1,
              associatedRoutes: 1,
            },
          )
          .lean();

        /* ==========================================
         * ROUTE
         * ========================================== */
        const routeId = van?.associatedRoutes?.[0]?.routeId;

        let routeName = '-';

        if (routeId) {
          const route = await this.routeModel
            .findOne(
              {
                routeId,
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
        const tcCustomers = await this.shopVisitModel.distinct('outletId', {
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
        const pcCustomers = await this.saleModal.distinct('customerId', {
          employeeId: employee.employeeId,
          status: SaleStatus.COMPLETED,
          date: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        /* ==========================================
         * LPC
         * LPC = Total Pieces / Productive Calls
         * ========================================== */
        const salesSummary = await this.saleModal.aggregate([
          {
            $match: {
              employeeId: employee.employeeId,
              status: SaleStatus.COMPLETED,
              date: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
          },
          {
            $group: {
              _id: null,
              totalPieces: {
                $sum: '$totalPieces',
              },
            },
          },
        ]);

        const tc = tcCustomers.length;

        const pc = pcCustomers.length;

        const totalPieces = salesSummary?.[0]?.totalPieces || 0;

        const lpc = pc > 0 ? Number((totalPieces / pc).toFixed(1)) : 0;

        return {
          employeeId: employee.employeeId,

          employeeName: employee.name,

          mobile: employee.mobile || '',

          activity: {
            name: activity?.name || 'Offline',
            color: activity?.name === 'Official Work' ? '#6D28D9' : '#22C55E',
          },

          routeName: activity?.name === 'Official Work' ? 'Admin' : routeName,

          location: activity?.description || '',

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
}
