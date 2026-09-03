import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  ProductivityReport,
  ProductivityReportDocument,
} from 'src/core/database/mongo/schema/productivity-report.schema';

import {
  Employee,
  EmployeeDocument,
} from 'src/core/database/mongo/schema/employee.schema';

import {
  Position,
  PositionDocument,
} from 'src/core/database/mongo/schema/position.schema';

import {
  Country,
  CountryDocument,
} from 'src/core/database/mongo/schema/country.schema';

import {
  Province,
  ProvinceDocument,
} from 'src/core/database/mongo/schema/province.schema';

import {
  WorkSession,
  WorkSessionDocument,
} from 'src/core/database/mongo/schema/work-session.schema';

import {
  ShopVisit,
  ShopVisitDocument,
} from 'src/core/database/mongo/schema/shop-visit.schema';

import { Sale, SaleDocument } from 'src/core/database/mongo/schema/sale.schema';

import {
  RouteSession,
  RouteSessionDocument,
} from 'src/core/database/mongo/schema/route-session.schema';

import {
  Customer,
  CustomerDocument,
} from 'src/core/database/mongo/schema/customer.schema';

import { SaleStatus } from 'src/shared/enums/sale.enums';

import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectModel(ProductivityReport.name)
    private readonly productivityReportModel: Model<ProductivityReportDocument>,

    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,

    @InjectModel(Position.name)
    private readonly positionModel: Model<PositionDocument>,

    @InjectModel(Country.name)
    private readonly countryModel: Model<CountryDocument>,

    @InjectModel(Province.name)
    private readonly provinceModel: Model<ProvinceDocument>,

    @InjectModel(WorkSession.name)
    private readonly workSessionModel: Model<WorkSessionDocument>,

    @InjectModel(ShopVisit.name)
    private readonly shopVisitModel: Model<ShopVisitDocument>,

    @InjectModel(Sale.name)
    private readonly saleModel: Model<SaleDocument>,

    @InjectModel(RouteSession.name)
    private readonly routeSessionModel: Model<RouteSessionDocument>,

    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  /* ======================================================
   * HISTORICAL PRODUCTIVITY REPORT
   * ====================================================== */

  /**
   * Prepare productivity reports for all SALESMEN
   * from their Employee.createdAt date up to today.
   *
   * IMPORTANT:
   * A report is created ONLY for dates on which the
   * salesman has a WorkSession.dayStartTime.
   *
   * Therefore:
   *
   * - onboarding date is Employee.createdAt
   * - salesman eligibility is Position.roleId === 'SALESMAN'
   * - employeeId is Employee.employeeId
   * - working dates come from WorkSession.dayStartTime
   */
  /* ======================================================
   * PRODUCTIVITY REPORT PREPARATION
   * ====================================================== */

  /**
   * Prepare productivity reports for all SALESMEN from their
   * Employee.createdAt date through the current UTC day.
   *
   * Rules:
   * - Only Position.roleId === 'SALESMAN' employees are eligible.
   * - employeeId is the direct Employee.employeeId value.
   * - A report is created only for dates where the salesman has
   *   a WorkSession.dayStartTime.
   * - Existing historical employee/date reports are skipped.
   * - Today's employee/date reports are always recalculated because
   *   today's visits, sales and other metrics can still change.
   * - If a scheduler run is missed, the next run discovers the missing
   *   employee/date report and prepares it.
   *
   * The ProductivityReport document itself is used as the processing
   * state. Its unique (reportDate, employeeId) index tells us whether
   * a historical report already exists, so no separate flag collection
   * is required.
   */
  async prepareProductivityReports(executionDate: Date = new Date()) {
    const todayStart = this.getUtcDayStart(executionDate);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);

    this.logger.log(
      `Starting productivity report preparation from employee onboarding dates through ${this.formatDate(
        todayStart,
      )}`,
    );

    /* ======================================================
     * 1. FIND SALESMAN POSITIONS
     * ====================================================== */

    const salesmanPositions = await this.positionModel
      .find({
        roleId: 'SALESMAN',
        employeeId: {
          $exists: true,
          $ne: null,
        },
        isDeleted: {
          $ne: true,
        },
      })
      .select('positionId employeeId')
      .lean();

    const salesmanEmployeeIds = [
      ...new Set(
        (salesmanPositions as any[])
          .map((position) => String(position.employeeId))
          .filter(Boolean),
      ),
    ];

    if (!salesmanEmployeeIds.length) {
      this.logger.warn('No SALESMAN employees found.');

      return {
        employeesProcessed: 0,
        workingDaysFound: 0,
        reportsFound: 0,
        reportsSkipped: 0,
        reportsPrepared: 0,
        upserted: 0,
        modified: 0,
      };
    }

    /* ======================================================
     * 2. FIND SALESMAN EMPLOYEES
     * ====================================================== */

    const employees = await this.employeeModel
      .find({
        employeeId: {
          $in: salesmanEmployeeIds,
        },
        isDeleted: {
          $ne: true,
        },
        createdAt: {
          $lt: tomorrowStart,
        },
      })
      .select('employeeId name status hierarchyPath createdAt')
      .lean();

    if (!employees.length) {
      this.logger.warn(
        'No eligible SALESMAN employees found in Employee collection.',
      );

      return {
        employeesProcessed: 0,
        workingDaysFound: 0,
        reportsFound: 0,
        reportsSkipped: 0,
        reportsPrepared: 0,
        upserted: 0,
        modified: 0,
      };
    }

    const eligibleEmployeeIdSet = new Set(
      (employees as any[]).map((employee) => String(employee.employeeId)),
    );

    /* ======================================================
     * 3. FIND ALL SALESMAN WORKING DATES
     * ======================================================
     *
     * WorkSession is the source of truth for whether a salesman
     * actually started his day.
     *
     * Employee.createdAt is the lower boundary and tomorrowStart
     * is the upper boundary, which intentionally includes today.
     */

    const employeeWorkingDates = await this.workSessionModel.aggregate([
      {
        $match: {
          userId: {
            $in: [...eligibleEmployeeIdSet],
          },
          dayStartTime: {
            $lt: tomorrowStart,
          },
          isDeleted: {
            $ne: true,
          },
        },
      },
      {
        $lookup: {
          from: 'employees',
          let: {
            employeeId: '$userId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$employeeId', '$$employeeId'],
                },
                isDeleted: {
                  $ne: true,
                },
              },
            },
            {
              $project: {
                _id: 0,
                employeeId: 1,
                createdAt: 1,
              },
            },
          ],
          as: 'employee',
        },
      },
      {
        $unwind: '$employee',
      },
      {
        $match: {
          $expr: {
            $gte: ['$dayStartTime', '$employee.createdAt'],
          },
        },
      },
      {
        $project: {
          _id: 0,
          employeeId: '$userId',
          reportDate: {
            $dateTrunc: {
              date: '$dayStartTime',
              unit: 'day',
              timezone: 'UTC',
            },
          },
        },
      },
      {
        $group: {
          _id: {
            employeeId: '$employeeId',
            reportDate: '$reportDate',
          },
        },
      },
      {
        $sort: {
          '_id.employeeId': 1,
          '_id.reportDate': 1,
        },
      },
    ]);

    /* ======================================================
     * 4. LOAD EXISTING HISTORICAL REPORTS
     * ======================================================
     *
     * ProductivityReport is the entry-level processing state.
     *
     * Existing historical report -> skip.
     * Existing today's report    -> recalculate.
     */

    const existingReports = await this.productivityReportModel
      .find({
        employeeId: {
          $in: [...eligibleEmployeeIdSet],
        },
        reportDate: {
          $lt: todayStart,
        },
      })
      .select('employeeId reportDate')
      .lean();

    const existingReportKeys = new Set<string>();

    for (const report of existingReports as any[]) {
      existingReportKeys.add(
        this.getReportKey(
          String(report.employeeId),
          new Date(report.reportDate),
        ),
      );
    }

    /* ======================================================
     * 5. BUILD DATE -> EMPLOYEES TO PROCESS MAP
     * ======================================================
     *
     * Processing one date for all required employees avoids running
     * the daily aggregation once for every employee/date pair.
     */

    const employeesByReportDate = new Map<string, Set<string>>();

    let workingDaysFound = 0;
    let reportsFound = 0;
    let reportsSkipped = 0;

    for (const row of employeeWorkingDates as any[]) {
      const employeeId = String(row._id.employeeId);
      const reportDate = new Date(row._id.reportDate);
      const reportDateKey = this.formatDate(reportDate);
      const reportKey = this.getReportKey(employeeId, reportDate);

      workingDaysFound++;

      const isToday = reportDateKey === this.formatDate(todayStart);

      if (!isToday && existingReportKeys.has(reportKey)) {
        reportsFound++;
        reportsSkipped++;
        continue;
      }

      if (!employeesByReportDate.has(reportDateKey)) {
        employeesByReportDate.set(reportDateKey, new Set<string>());
      }

      employeesByReportDate.get(reportDateKey)!.add(employeeId);
    }

    /* ======================================================
     * 6. PREPARE MISSING HISTORICAL REPORTS + TODAY
     * ====================================================== */

    let reportsPrepared = 0;
    let totalUpserted = 0;
    let totalModified = 0;

    const datesToProcess = [...employeesByReportDate.keys()].sort();

    for (const reportDateKey of datesToProcess) {
      const employeeIds = employeesByReportDate.get(reportDateKey)!;
      const reportDate = this.parseUtcDate(reportDateKey);

      const result = await this.prepareProductivityReport(
        reportDate,
        employeeIds,
      );

      reportsPrepared += result.employeesProcessed;
      totalUpserted += result.upserted;
      totalModified += result.modified;
    }

    this.logger.log(
      `Productivity report preparation completed. ` +
        `Employees: ${employees.length}, ` +
        `Working employee-days: ${workingDaysFound}, ` +
        `Existing historical reports: ${reportsFound}, ` +
        `Skipped: ${reportsSkipped}, ` +
        `Prepared/recalculated: ${reportsPrepared}, ` +
        `Upserted: ${totalUpserted}, ` +
        `Modified: ${totalModified}`,
    );

    return {
      employeesProcessed: employees.length,
      workingDaysFound,
      reportsFound,
      reportsSkipped,
      reportsPrepared,
      upserted: totalUpserted,
      modified: totalModified,
    };
  }

  /* ======================================================
   * CORE REPORT PREPARATION
   * ====================================================== */

  /**
   * Main reusable calculation method.
   *
   * IMPORTANT:
   * Both D-1 and D-Day use this same method.
   *
   * REPORT ELIGIBILITY:
   * -------------------
   * Only employees assigned to a Position whose:
   *
   *     roleId === 'SALESMAN'
   *
   * are included in the productivity report.
   *
   * employeeId is taken directly from:
   *
   *     Position.employeeId
   *
   * and corresponds to:
   *
   *     Employee.employeeId
   */
  private async prepareProductivityReport(
    reportDate: Date,
    eligibleEmployeeIds?: Set<string>,
  ) {
    const { start, end } = this.getUtcDayRange(reportDate);

    this.logger.log(
      `Preparing productivity report for ${this.formatDate(start)}`,
    );

    /* ======================================================
     * 1. FETCH POSITION MASTER
     * ====================================================== */

    /**
     * Load all active positions because the complete reporting
     * hierarchy is required to build:
     *
     * admin
     * categoryManager
     * manager
     * teamLeader
     * salesman
     *
     * We also need all positions to walk:
     *
     * salesman -> team leader -> manager -> category manager -> admin
     */
    const positions = await this.positionModel
      .find({
        isDeleted: { $ne: true },
      })
      .select(
        'positionId name employeeId countryId provinceId reportTo hierarchyDepth roleId',
      )
      .lean();

    /**
     * Only positions whose role is SALESMAN are eligible to
     * generate productivity reports.
     *
     * This is the authoritative role check.
     *
     * We intentionally do NOT check:
     * - Employee employeeType
     * - User role
     * - Role collection
     *
     * Position.roleId is the source of truth.
     */
    const salesmanPositions = (positions as any[]).filter(
      (position) => position.roleId === 'SALESMAN' && position.employeeId,
    );

    /**
     * Only employees assigned to SALESMAN positions are eligible.
     */
    const salesmanEmployeeIds = [
      ...new Set(
        salesmanPositions
          .map((position) => String(position.employeeId))
          .filter(Boolean),
      ),
    ];

    if (!salesmanEmployeeIds.length) {
      this.logger.warn(
        `No SALESMAN positions found for productivity report ${this.formatDate(
          start,
        )}`,
      );

      return {
        reportDate: this.formatDate(start),
        employeesProcessed: 0,
        upserted: 0,
        modified: 0,
      };
    }

    /* ======================================================
     * 2. FETCH EMPLOYEES
     * ====================================================== */

    /**
     * IMPORTANT:
     *
     * We must NOT fetch only SALESMAN employees here.
     *
     * The report is generated only FOR SALESMAN employees,
     * but the hierarchy contains other employees:
     *
     * ADMIN
     * CATEGORY MANAGER
     * MANAGER
     * TEAM LEADER
     * SALESMAN
     *
     * Therefore we first collect all employee IDs assigned
     * to positions and load them all.
     *
     * The final reportDocuments array is still generated only
     * from salesmanEmployees.
     */
    const allPositionEmployeeIds = [
      ...new Set(
        (positions as any[])
          .map((position) => position.employeeId)
          .filter(Boolean)
          .map((employeeId) => String(employeeId)),
      ),
    ];

    const employees = allPositionEmployeeIds.length
      ? await this.employeeModel
          .find({
            employeeId: {
              $in: allPositionEmployeeIds,
            },
            isDeleted: {
              $ne: true,
            },
          })
          .select('employeeId name status hierarchyPath')
          .lean()
      : [];

    /**
     * Keep the SALESMAN employees separately.
     *
     * These are the only employees for whom we create reports.
     */
    const salesmanEmployeeIdSet = new Set(salesmanEmployeeIds);

    const salesmanEmployees = (employees as any[]).filter((employee) => {
      const employeeId = String(employee.employeeId);

      /**
       * Employee must first be a SALESMAN.
       */
      if (!salesmanEmployeeIdSet.has(employeeId)) {
        return false;
      }

      /**
       * If eligibleEmployeeIds was supplied, only include
       * those employees.
       *
       * This is used by historical backfill where we already
       * know which salesman actually started his day.
       */
      if (eligibleEmployeeIds) {
        return eligibleEmployeeIds.has(employeeId);
      }

      return true;
    });

    /* ======================================================
     * 3. BUILD MASTER MAPS
     * ====================================================== */

    /**
     * Employee lookup:
     *
     * employeeId -> Employee
     *
     * This now contains employees from the entire position
     * hierarchy, not only SALESMAN employees.
     */
    const employeeById = new Map<string, any>();

    for (const employee of employees as any[]) {
      employeeById.set(String(employee.employeeId), employee);
    }

    /**
     * Position lookup:
     *
     * positionId -> Position
     */
    const positionById = new Map<string, any>();

    for (const position of positions as any[]) {
      positionById.set(String(position.positionId), position);
    }

    /**
     * Position lookup:
     *
     * employeeId -> Position
     *
     * This allows us to find the SALESMAN position directly
     * from Employee.employeeId.
     */
    const positionByEmployeeId = new Map<string, any>();

    for (const position of positions as any[]) {
      if (position.employeeId) {
        positionByEmployeeId.set(String(position.employeeId), position);
      }
    }

    /* ======================================================
     * 4. COUNTRY / PROVINCE MASTER
     * ====================================================== */

    const countryIds = [
      ...new Set(
        (positions as any[])
          .map((position) => position.countryId)
          .filter(Boolean),
      ),
    ];

    const provinceIds = [
      ...new Set(
        (positions as any[])
          .map((position) => position.provinceId)
          .filter(Boolean),
      ),
    ];

    const [countries, provinces] = await Promise.all([
      countryIds.length
        ? this.countryModel
            .find({
              countryId: { $in: countryIds },
              isDeleted: { $ne: true },
            })
            .select('countryId name')
            .lean()
        : [],

      provinceIds.length
        ? this.provinceModel
            .find({
              provinceId: { $in: provinceIds },
              isDeleted: { $ne: true },
            })
            .select('provinceId name')
            .lean()
        : [],
    ]);

    const countryById = new Map<string, any>();

    for (const country of countries as any[]) {
      countryById.set(String(country.countryId), country);
    }

    const provinceById = new Map<string, any>();

    for (const province of provinces as any[]) {
      provinceById.set(String(province.provinceId), province);
    }

    /* ======================================================
     * 5. HIERARCHY BUILDER
     * ====================================================== */

    /**
     * Position hierarchy:
     *
     * hierarchyDepth 1 = ADMIN
     * hierarchyDepth 2 = CATEGORY MANAGER
     * hierarchyDepth 3 = MANAGER
     * hierarchyDepth 4 = TEAM LEADER
     * hierarchyDepth 5 = SALESMAN
     *
     * This matches the confirmed Position master structure.
     *
     * Example:
     *
     * P00005 SALESMAN
     *     |
     *     +-- P00004 TEAM LEADER
     *             |
     *             +-- P00002 MANAGER
     *                     |
     *                     +-- P00001 CATEGORY MANAGER
     *                             |
     *                             +-- P00003 ADMIN
     *
     * The actual structure is determined by reportTo and
     * hierarchyDepth from Position master.
     */
    const hierarchyFor = (employee: any) => {
      const hierarchy: Record<number, string> = {
        1: '',
        2: '',
        3: '',
        4: '',
        5: '',
      };

      const currentPosition = positionByEmployeeId.get(
        String(employee.employeeId),
      );

      let position = currentPosition;

      let reportingManager = '';

      /**
       * Walk from the SALESMAN position upwards using reportTo.
       */
      while (position) {
        const level = Number(position.hierarchyDepth);

        if (level >= 1 && level <= 5) {
          /**
           * Get the actual employee assigned to this position.
           *
           * Because employeeById now contains all hierarchy
           * employees, we get the real employee name here.
           */
          const positionEmployee = position.employeeId
            ? employeeById.get(String(position.employeeId))
            : undefined;

          hierarchy[level] = positionEmployee?.name || position.name || '';
        }

        /**
         * reportingManager means the employee directly above
         * the current SALESMAN position.
         */
        if (!reportingManager && position !== currentPosition) {
          const managerEmployee = position.employeeId
            ? employeeById.get(String(position.employeeId))
            : undefined;

          reportingManager = managerEmployee?.name || position.name || '';
        }

        /**
         * Move to parent position.
         */
        position = position.reportTo
          ? positionById.get(String(position.reportTo))
          : undefined;
      }

      /**
       * Fallback using employee hierarchyPath.
       *
       * This is only used if a direct reporting manager could
       * not be resolved through Position.reportTo.
       */
      if (!reportingManager) {
        const hierarchyPath = Array.isArray(employee.hierarchyPath)
          ? employee.hierarchyPath
          : [];

        for (let index = hierarchyPath.length - 1; index >= 0; index--) {
          const managerId = hierarchyPath[index];

          const manager = employeeById.get(String(managerId));

          if (manager) {
            reportingManager = manager.name || '';
            break;
          }
        }
      }

      return {
        /**
         * Position hierarchy fields.
         */
        admin: hierarchy[1] || '',

        categoryManager: hierarchy[2] || '',

        manager: hierarchy[3] || '',

        teamLeader: hierarchy[4] || '',

        salesman: hierarchy[5] || '',

        /**
         * Additional existing report fields.
         */
        reportingManager,

        positionOfEmployee: currentPosition?.name || '',

        /**
         * Country / Province are based on the SALESMAN's
         * assigned position.
         */
        country:
          countryById.get(String(currentPosition?.countryId || ''))?.name ||
          currentPosition?.countryId ||
          '',

        province:
          provinceById.get(String(currentPosition?.provinceId || ''))?.name ||
          currentPosition?.provinceId ||
          '',
      };
    };

    /* ======================================================
     * 6. RUN DAILY AGGREGATIONS
     * ====================================================== */

    /**
     * These execute directly in MongoDB.
     *
     * IMPORTANT:
     * Aggregations are not changed from the existing logic.
     */
    const [
      workSessionMetrics,
      visitMetrics,
      salesMetrics,
      routeMetrics,
      newCustomers,
    ] = await Promise.all([
      this.aggregateWorkSessions(start, end),

      this.aggregateVisits(start, end),

      this.aggregateSales(start, end),

      this.aggregateRouteCoverage(start, end),

      this.customerModel
        .find({
          createdAt: {
            $gte: start,
            $lt: end,
          },
          isDeleted: { $ne: true },
        })
        .select('customerId createdByEmployeeId')
        .lean(),
    ]);

    /* ======================================================
     * 7. NEW OUTLETS
     * ====================================================== */

    const newOutletByEmployee = new Map<string, number>();

    for (const customer of newCustomers as any[]) {
      if (!customer.createdByEmployeeId) {
        continue;
      }

      const employeeId = String(customer.createdByEmployeeId);

      newOutletByEmployee.set(
        employeeId,
        (newOutletByEmployee.get(employeeId) || 0) + 1,
      );
    }

    /* ======================================================
     * 8. CREATE REPORT DOCUMENTS
     * ====================================================== */

    /**
     * VERY IMPORTANT:
     *
     * We iterate over salesmanEmployees only.
     *
     * Therefore:
     *
     * - ADMIN does not get a report
     * - CATEGORY MANAGER does not get a report
     * - MANAGER does not get a report
     * - TEAM LEADER does not get a report
     * - SALESMAN gets a report
     */
    const reportDocuments = salesmanEmployees.map((employee) => {
      /**
       * employeeId is the actual Employee.employeeId.
       *
       * No ERP ID.
       * No User ID.
       * No Role ID.
       */
      const employeeId = String(employee.employeeId);

      const hierarchy = hierarchyFor(employee);

      const workSession = workSessionMetrics.get(employeeId) || {
        countRetailingDays: 0,
      };

      const visit = visitMetrics.get(employeeId) || {
        tc: 0,
        utc: 0,
        totalDurationSeconds: 0,
      };

      const sales = salesMetrics.get(employeeId) || {
        pc: 0,
        upc: 0,
        lineCount: 0,
        netValue: 0,
        qtyKgs: 0,
        qtyCases: 0,
        schemeDiscount: 0,
        focusedOutletOrderKgs: 0,
        focusedOutletOrderCases: 0,
        focusedOutletOrderRevenue: 0,
      };

      const route = routeMetrics.get(employeeId) || {
        sc: 0,
      };

      const countRetailingDays = Number(workSession.countRetailingDays || 0);

      const tc = Number(visit.tc || 0);

      const utc = Number(visit.utc || 0);

      const pc = Number(sales.pc || 0);

      const upc = Number(sales.upc || 0);

      const sc = Number(route.sc || 0);

      /* ==================================================
       * PRODUCTIVITY %
       * ================================================== */

      /**
       * PC / TC * 100
       */
      const productivityPercentage =
        tc > 0 ? Number(((pc / tc) * 100).toFixed(2)) : 0;

      /* ==================================================
       * AVERAGE TC
       * ================================================== */

      /**
       * TC / retailing days
       */
      const avgTc =
        countRetailingDays > 0
          ? Number((tc / countRetailingDays).toFixed(2))
          : 0;

      /* ==================================================
       * AVERAGE PC
       * ================================================== */

      /**
       * PC / retailing days
       */
      const avgPc =
        countRetailingDays > 0
          ? Number((pc / countRetailingDays).toFixed(2))
          : 0;

      /* ==================================================
       * ZERO ORDER
       * ================================================== */

      /**
       * UTC - UPC
       */
      const zeroOrder = Math.max(utc - upc, 0);

      /* ==================================================
       * NOT VISITED
       * ================================================== */

      /**
       * SC - UTC
       */
      const notVisited = Math.max(sc - utc, 0);

      /* ==================================================
       * TOTAL
       * ================================================== */

      /**
       * UTC + UPC + ZeroOrder + NotVisited
       */
      const total = utc + upc + zeroOrder + notVisited;

      /* ==================================================
       * LPC
       * ================================================== */

      /**
       * Sale lines / completed orders
       *
       * sale_items has:
       *
       * unique saleId + productId
       */
      const lineCount = Number(sales.lineCount || 0);

      const lpc = pc > 0 ? Number((lineCount / pc).toFixed(2)) : 0;

      /* ==================================================
       * AVERAGE VALUE PER PC
       * ================================================== */

      const netValue = Number(sales.netValue || 0);

      const avgValuePerPc = pc > 0 ? Number((netValue / pc).toFixed(2)) : 0;

      /* ==================================================
       * AVERAGE VALUE PER RETAILING DAY
       * ================================================== */

      const avgValuePerRetailingDay =
        countRetailingDays > 0
          ? Number((netValue / countRetailingDays).toFixed(2))
          : 0;

      /* ==================================================
       * AVERAGE SPENT TIME RETAILING
       * ================================================== */

      const totalDurationSeconds = Number(visit.totalDurationSeconds || 0);

      const avgSpentTimeRetailingSeconds =
        countRetailingDays > 0
          ? Math.round(totalDurationSeconds / countRetailingDays)
          : 0;

      /* ==================================================
       * REPORT DOCUMENT
       * ================================================== */

      return {
        reportDate: start,

        /**
         * Direct Employee.employeeId.
         */
        employeeId,

        /**
         * Hierarchy.
         */
        admin: hierarchy.admin || '',

        categoryManager: hierarchy.categoryManager || '',

        manager: hierarchy.manager || '',

        teamLeader: hierarchy.teamLeader || '',

        salesman: hierarchy.salesman || '',

        /**
         * Territory.
         */
        country: hierarchy.country || '',

        province: hierarchy.province || '',

        /**
         * Existing metadata.
         */
        reportingManager: hierarchy.reportingManager,

        positionOfEmployee: hierarchy.positionOfEmployee,

        user: employee.name || '',

        userStatus: employee.status || '',

        /* ==================================================
         * ATTENDANCE
         * ================================================== */

        countTotalDays: 1,

        countRetailingDays,

        /* ==================================================
         * CALL / COVERAGE
         * ================================================== */

        sc,

        tc,

        pc,

        productivityPercentage,

        avgTc,

        avgPc,

        /* ==================================================
         * OUTLET METRICS
         * ================================================== */

        upc,

        utc,

        zeroOrder,

        notVisited,

        total,

        /* ==================================================
         * SALES
         * ================================================== */

        lpc,

        avgValuePerPc,

        qtyKgs: Number(Number(sales.qtyKgs || 0).toFixed(3)),

        qtyCases: Number(Number(sales.qtyCases || 0).toFixed(2)),

        netValue: Number(netValue.toFixed(2)),

        avgValuePerRetailingDay,

        schemeDiscount: Number(Number(sales.schemeDiscount || 0).toFixed(2)),

        /* ==================================================
         * FOCUSED OUTLET SALES
         * ================================================== */

        focusedOutletOrderKgs: Number(
          Number(sales.focusedOutletOrderKgs || 0).toFixed(3),
        ),

        focusedOutletOrderCases: Number(
          Number(sales.focusedOutletOrderCases || 0).toFixed(2),
        ),

        focusedOutletOrderRevenue: Number(
          Number(sales.focusedOutletOrderRevenue || 0).toFixed(2),
        ),

        /* ==================================================
         * NEW OUTLETS
         * ================================================== */

        newOutlets: newOutletByEmployee.get(employeeId) || 0,

        /* ==================================================
         * RETAILING TIME
         * ================================================== */

        avgSpentTimeRetailingSeconds,

        /* ==================================================
         * CALCULATION METADATA
         * ================================================== */

        calculatedAt: new Date(),

        calculationVersion: 1,
      };
    });

    /* ======================================================
     * 9. UPSERT IN CHUNKS
     * ====================================================== */

    const result = await this.bulkUpsertReports(reportDocuments);

    this.logger.log(
      `Productivity report completed for ${this.formatDate(
        start,
      )}. Employees: ${reportDocuments.length}, Upserted: ${
        result.upsertedCount
      }, Modified: ${result.modifiedCount}`,
    );

    return {
      reportDate: this.formatDate(start),

      employeesProcessed: reportDocuments.length,

      upserted: result.upsertedCount,

      modified: result.modifiedCount,
    };
  }

  /* ======================================================
   * WORK SESSION AGGREGATION
   * ====================================================== */

  private async aggregateWorkSessions(start: Date, end: Date) {
    const rows = await this.workSessionModel.aggregate([
      {
        $match: {
          dayStartTime: {
            $gte: start,
            $lt: end,
          },

          isDeleted: {
            $ne: true,
          },
        },
      },

      {
        $group: {
          _id: '$userId',

          dates: {
            $addToSet: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$dayStartTime',
                timezone: 'UTC',
              },
            },
          },
        },
      },

      {
        $project: {
          _id: 1,

          countRetailingDays: {
            $size: '$dates',
          },
        },
      },
    ]);

    const result = new Map<string, any>();

    for (const row of rows) {
      result.set(String(row._id), row);
    }

    return result;
  }

  /* ======================================================
   * VISIT AGGREGATION
   * ====================================================== */

  private async aggregateVisits(start: Date, end: Date) {
    const rows = await this.shopVisitModel.aggregate([
      {
        $match: {
          checkInTime: {
            $gte: start,
            $lt: end,
          },

          status: ShopVisitStatus.COMPLETED,

          isDeleted: {
            $ne: true,
          },
        },
      },

      {
        $group: {
          _id: '$employeeId',

          /**
           * TC = total visits/calls
           */
          tc: {
            $sum: 1,
          },

          /**
           * UTC = unique visited outlets
           */
          outletIds: {
            $addToSet: '$outletId',
          },

          /**
           * Total retailing time.
           */
          totalDurationSeconds: {
            $sum: {
              $ifNull: ['$durationSeconds', 0],
            },
          },
        },
      },

      {
        $project: {
          _id: 1,

          tc: 1,

          utc: {
            $size: '$outletIds',
          },

          totalDurationSeconds: 1,
        },
      },
    ]);

    const result = new Map<string, any>();

    for (const row of rows) {
      result.set(String(row._id), row);
    }

    return result;
  }

  /* ======================================================
   * SALES AGGREGATION
   * ====================================================== */

  private async aggregateSales(start: Date, end: Date) {
    const rows = await this.saleModel.aggregate([
      {
        $match: {
          date: {
            $gte: start,
            $lt: end,
          },

          status: SaleStatus.COMPLETED,

          isDeleted: {
            $ne: true,
          },
        },
      },

      /* ==================================================
       * SALE -> SHOP VISIT
       * ================================================== */

      {
        $lookup: {
          from: 'shop_visits',

          let: {
            visitId: '$visitId',
          },

          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$visitId', '$$visitId'],
                },

                isDeleted: {
                  $ne: true,
                },
              },
            },

            {
              $project: {
                _id: 0,
                employeeId: 1,
              },
            },
          ],

          as: 'visit',
        },
      },

      {
        $unwind: '$visit',
      },

      /* ==================================================
       * SALE -> SALE ITEMS
       * ================================================== */

      {
        $lookup: {
          from: 'sale_items',

          let: {
            saleId: '$saleId',
          },

          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$saleId', '$$saleId'],
                },

                isDeleted: {
                  $ne: true,
                },
              },
            },

            {
              $project: {
                productId: 1,

                isFocusedPack: 1,

                totalNetWeight: 1,

                netCases: 1,

                caseQty: 1,

                totalValue: 1,

                schemeDiscountAmount: 1,
              },
            },
          ],

          as: 'items',
        },
      },

      {
        $unwind: {
          path: '$items',

          preserveNullAndEmptyArrays: true,
        },
      },

      /* ==================================================
       * FIRST GROUP BY EMPLOYEE + SALE
       * ================================================== */

      {
        $group: {
          _id: {
            employeeId: '$visit.employeeId',

            saleId: '$saleId',
          },

          customerId: {
            $first: '$customerId',
          },

          netValue: {
            $first: {
              $ifNull: ['$totalValue', 0],
            },
          },

          qtyKgs: {
            $first: {
              $ifNull: ['$totalWeight', 0],
            },
          },

          qtyCases: {
            $first: {
              $ifNull: ['$totalCases', 0],
            },
          },

          /**
           * One sale item =
           * one unique saleId + productId line.
           */
          lineCount: {
            $sum: {
              $cond: [
                {
                  $ne: ['$items', null],
                },

                1,

                0,
              ],
            },
          },

          schemeDiscount: {
            $sum: {
              $ifNull: ['$items.schemeDiscountAmount', 0],
            },
          },

          focusedOutletOrderKgs: {
            $sum: {
              $cond: [
                {
                  $eq: ['$items.isFocusedPack', 'Y'],
                },

                {
                  $ifNull: ['$items.totalNetWeight', 0],
                },

                0,
              ],
            },
          },

          focusedOutletOrderCases: {
            $sum: {
              $cond: [
                {
                  $eq: ['$items.isFocusedPack', 'Y'],
                },

                {
                  $ifNull: [
                    '$items.netCases',
                    {
                      $ifNull: ['$items.caseQty', 0],
                    },
                  ],
                },

                0,
              ],
            },
          },

          focusedOutletOrderRevenue: {
            $sum: {
              $cond: [
                {
                  $eq: ['$items.isFocusedPack', 'Y'],
                },

                {
                  $ifNull: ['$items.totalValue', 0],
                },

                0,
              ],
            },
          },
        },
      },

      /* ==================================================
       * THEN GROUP BY EMPLOYEE
       * ================================================== */

      {
        $group: {
          _id: '$_id.employeeId',

          /**
           * PC = completed orders.
           */
          pc: {
            $sum: 1,
          },

          /**
           * UPC = unique billed outlets.
           */
          billedOutletIds: {
            $addToSet: '$customerId',
          },

          lineCount: {
            $sum: '$lineCount',
          },

          netValue: {
            $sum: '$netValue',
          },

          qtyKgs: {
            $sum: '$qtyKgs',
          },

          qtyCases: {
            $sum: '$qtyCases',
          },

          schemeDiscount: {
            $sum: '$schemeDiscount',
          },

          focusedOutletOrderKgs: {
            $sum: '$focusedOutletOrderKgs',
          },

          focusedOutletOrderCases: {
            $sum: '$focusedOutletOrderCases',
          },

          focusedOutletOrderRevenue: {
            $sum: '$focusedOutletOrderRevenue',
          },
        },
      },

      {
        $project: {
          _id: 1,

          pc: 1,

          upc: {
            $size: '$billedOutletIds',
          },

          lineCount: 1,

          netValue: 1,

          qtyKgs: 1,

          qtyCases: 1,

          schemeDiscount: 1,

          focusedOutletOrderKgs: 1,

          focusedOutletOrderCases: 1,

          focusedOutletOrderRevenue: 1,
        },
      },
    ]);

    const result = new Map<string, any>();

    for (const row of rows) {
      result.set(String(row._id), row);
    }

    return result;
  }

  /* ======================================================
   * ROUTE / BEAT COVERAGE
   * ====================================================== */

  private async aggregateRouteCoverage(start: Date, end: Date) {
    const rows = await this.routeSessionModel.aggregate([
      {
        $match: {
          sessionDate: {
            $gte: start,
            $lt: end,
          },

          isDeleted: {
            $ne: true,
          },
        },
      },

      {
        $lookup: {
          from: 'route_customer_mappings',

          let: {
            routeId: '$routeId',
          },

          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$routeId', '$$routeId'],
                },

                effectiveFrom: {
                  $lt: end,
                },

                $or: [
                  {
                    effectiveTo: null,
                  },

                  {
                    effectiveTo: {
                      $gte: start,
                    },
                  },
                ],

                isDeleted: {
                  $ne: true,
                },
              },
            },

            {
              $project: {
                _id: 0,
                customerId: 1,
              },
            },
          ],

          as: 'plannedOutlets',
        },
      },

      {
        $unwind: {
          path: '$plannedOutlets',

          preserveNullAndEmptyArrays: false,
        },
      },

      {
        $group: {
          _id: '$userId',

          plannedOutletIds: {
            $addToSet: '$plannedOutlets.customerId',
          },
        },
      },

      {
        $project: {
          _id: 1,

          sc: {
            $size: '$plannedOutletIds',
          },
        },
      },
    ]);

    const result = new Map<string, any>();

    for (const row of rows) {
      result.set(String(row._id), row);
    }

    return result;
  }

  /* ======================================================
   * BULK UPSERT
   * ====================================================== */

  private async bulkUpsertReports(reports: any[]) {
    if (!reports.length) {
      return {
        upsertedCount: 0,
        modifiedCount: 0,
      };
    }

    const chunkSize = 500;

    let upsertedCount = 0;

    let modifiedCount = 0;

    for (let index = 0; index < reports.length; index += chunkSize) {
      const chunk = reports.slice(index, index + chunkSize);

      const operations = chunk.map((report) => ({
        updateOne: {
          filter: {
            reportDate: report.reportDate,

            employeeId: report.employeeId,
          },

          update: {
            $set: report,
          },

          upsert: true,
        },
      }));

      const result = await this.productivityReportModel.bulkWrite(operations, {
        ordered: false,
      });

      upsertedCount += result.upsertedCount || 0;

      modifiedCount += result.modifiedCount || 0;
    }

    return {
      upsertedCount,
      modifiedCount,
    };
  }

  /* ======================================================
   * REPORT PROCESSING HELPERS
   * ====================================================== */

  private getReportKey(employeeId: string, reportDate: Date): string {
    return `${employeeId}|${this.formatDate(reportDate)}`;
  }

  private parseUtcDate(dateString: string): Date {
    return new Date(`${dateString}T00:00:00.000Z`);
  }

  /* ======================================================
   * UTC DATE HELPERS
   * ====================================================== */

  private getUtcDayStart(date: Date): Date {
    const value = new Date(date);

    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private getUtcDayRange(date: Date) {
    const start = this.getUtcDayStart(date);

    const end = new Date(start);

    end.setUTCDate(end.getUTCDate() + 1);

    return {
      start,
      end,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
