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
   * PUBLIC SCHEDULER METHODS
   * ====================================================== */

  /**
   * D-1 scheduler entry point.
   *
   * If executed on:
   *
   * 2026-08-31 00:01 UTC
   *
   * it prepares:
   *
   * 2026-08-30
   */
  async prepareD1ProductivityReport(executionDate: Date = new Date()) {
    const currentDayStart = this.getUtcDayStart(executionDate);

    const reportDate = new Date(currentDayStart);
    reportDate.setUTCDate(reportDate.getUTCDate() - 1);

    this.logger.log(
      `Starting D-1 productivity report for ${this.formatDate(reportDate)}`,
    );

    return this.prepareProductivityReport(reportDate);
  }

  /**
   * D-Day scheduler entry point.
   *
   * If executed at any time during:
   *
   * 2026-08-31
   *
   * it recalculates:
   *
   * 2026-08-31
   */
  async prepareDDayProductivityReport(executionDate: Date = new Date()) {
    const reportDate = this.getUtcDayStart(executionDate);

    this.logger.log(
      `Starting D-Day productivity report for ${this.formatDate(reportDate)}`,
    );

    return this.prepareProductivityReport(reportDate);
  }

  /* ======================================================
   * CORE REPORT PREPARATION
   * ====================================================== */

  /**
   * Main reusable calculation method.
   *
   * IMPORTANT:
   * Both D-1 and D-Day use this same method.
   */
  async prepareProductivityReport(reportDate: Date) {
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

    /* ======================================================
     * 2. FETCH SALESMAN EMPLOYEES ONLY
     * ====================================================== */

    const employees = salesmanEmployeeIds.length
      ? await this.employeeModel
          .find({
            employeeId: {
              $in: salesmanEmployeeIds,
            },
            isDeleted: {
              $ne: true,
            },
          })
          .select('employeeId name status hierarchyPath')
          .lean()
      : [];

    /*
     * ------------------------------------------------------
     * 2. BUILD MASTER MAPS
     * ------------------------------------------------------
     */

    const employeeById = new Map<string, any>();

    for (const employee of employees as any[]) {
      employeeById.set(String(employee.employeeId), employee);
    }

    const positionById = new Map<string, any>();

    for (const position of positions as any[]) {
      positionById.set(String(position.positionId), position);
    }

    const positionByEmployeeId = new Map<string, any>();

    for (const position of positions as any[]) {
      if (position.employeeId) {
        positionByEmployeeId.set(String(position.employeeId), position);
      }
    }

    /*
     * ------------------------------------------------------
     * 3. COUNTRY / PROVINCE MASTER
     * ------------------------------------------------------
     */

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

    /*
     * ------------------------------------------------------
     * 4. HIERARCHY BUILDER
     * ------------------------------------------------------
     *
     * Existing position hierarchy uses:
     *
     * depth 1 = L6
     * depth 2 = L5
     * depth 3 = L4
     * depth 4 = L3
     * depth 5 = L2
     *
     * Based on the supplied hierarchy structure.
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

      while (position) {
        const level = Number(position.hierarchyDepth);

        if (level >= 1 && level <= 5) {
          const positionEmployee = position.employeeId
            ? employeeById.get(String(position.employeeId))
            : undefined;

          hierarchy[level] = positionEmployee?.name || position.name || '';
        }

        if (!reportingManager && position !== currentPosition) {
          const managerEmployee = position.employeeId
            ? employeeById.get(String(position.employeeId))
            : undefined;

          reportingManager = managerEmployee?.name || position.name || '';
        }

        position = position.reportTo
          ? positionById.get(String(position.reportTo))
          : undefined;
      }

      /*
       * Fallback using employee hierarchyPath.
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
        admin: hierarchy[1] || '',
        categoryManager: hierarchy[2] || '',
        manager: hierarchy[3] || '',
        teamLeader: hierarchy[4] || '',
        salesman: hierarchy[5] || '',

        reportingManager,

        positionOfEmployee: currentPosition?.name || '',

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

    /*
     * ------------------------------------------------------
     * 5. RUN DAILY AGGREGATIONS
     * ------------------------------------------------------
     *
     * These execute directly in MongoDB.
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

    /*
     * ------------------------------------------------------
     * 6. NEW OUTLETS
     * ------------------------------------------------------
     */

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

    /*
     * ------------------------------------------------------
     * 7. CREATE REPORT DOCUMENTS
     * ------------------------------------------------------
     */

    const reportDocuments = (employees as any[]).map((employee) => {
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

      /*
       * Productivity %
       *
       * PC / TC * 100
       */
      const productivityPercentage =
        tc > 0 ? Number(((pc / tc) * 100).toFixed(2)) : 0;

      /*
       * Average TC
       *
       * TC / retailing days
       */
      const avgTc =
        countRetailingDays > 0
          ? Number((tc / countRetailingDays).toFixed(2))
          : 0;

      /*
       * Average PC
       *
       * PC / retailing days
       */
      const avgPc =
        countRetailingDays > 0
          ? Number((pc / countRetailingDays).toFixed(2))
          : 0;

      /*
       * Zero Order
       *
       * UTC - UPC
       */
      const zeroOrder = Math.max(utc - upc, 0);

      /*
       * Not Visited
       *
       * SC - UTC
       */
      const notVisited = Math.max(sc - utc, 0);

      /*
       * Total
       *
       * UTC + UPC + ZeroOrder + NotVisited
       */
      const total = utc + upc + zeroOrder + notVisited;

      /*
       * LPC
       *
       * distinct saleId + productId
       * --------------------------------
       * distinct saleId
       *
       * sale_items has unique:
       * saleId + productId
       */
      const lineCount = Number(sales.lineCount || 0);

      const lpc = pc > 0 ? Number((lineCount / pc).toFixed(2)) : 0;

      /*
       * Average Value Per PC
       *
       * NetValue / PC
       */
      const netValue = Number(sales.netValue || 0);

      const avgValuePerPc = pc > 0 ? Number((netValue / pc).toFixed(2)) : 0;

      /*
       * Average Value Per Retailing Day
       */
      const avgValuePerRetailingDay =
        countRetailingDays > 0
          ? Number((netValue / countRetailingDays).toFixed(2))
          : 0;

      /*
       * Average Spent Time Retailing
       *
       * SUM(durationSeconds)
       * /
       * Retailing Days
       */
      const totalDurationSeconds = Number(visit.totalDurationSeconds || 0);

      const avgSpentTimeRetailingSeconds =
        countRetailingDays > 0
          ? Math.round(totalDurationSeconds / countRetailingDays)
          : 0;

      return {
        reportDate: start,

        employeeId,

        admin: hierarchy.admin || '',

        categoryManager: hierarchy.categoryManager || '',

        manager: hierarchy.manager || '',

        teamLeader: hierarchy.teamLeader || '',

        salesman: hierarchy.salesman || '',

        country: hierarchy.country || '',

        province: hierarchy.province || '',

        reportingManager: hierarchy.reportingManager,

        positionOfEmployee: hierarchy.positionOfEmployee,

        user: employee.name || '',

        userStatus: employee.status || '',

        countTotalDays: 1,

        countRetailingDays,

        sc,

        tc,

        pc,

        productivityPercentage,

        avgTc,

        avgPc,

        upc,

        utc,

        zeroOrder,

        notVisited,

        total,

        lpc,

        avgValuePerPc,

        qtyKgs: Number(Number(sales.qtyKgs || 0).toFixed(3)),

        qtyCases: Number(Number(sales.qtyCases || 0).toFixed(2)),

        netValue: Number(netValue.toFixed(2)),

        avgValuePerRetailingDay,

        schemeDiscount: Number(Number(sales.schemeDiscount || 0).toFixed(2)),

        focusedOutletOrderKgs: Number(
          Number(sales.focusedOutletOrderKgs || 0).toFixed(3),
        ),

        focusedOutletOrderCases: Number(
          Number(sales.focusedOutletOrderCases || 0).toFixed(2),
        ),

        focusedOutletOrderRevenue: Number(
          Number(sales.focusedOutletOrderRevenue || 0).toFixed(2),
        ),

        newOutlets: newOutletByEmployee.get(employeeId) || 0,

        avgSpentTimeRetailingSeconds,

        calculatedAt: new Date(),

        calculationVersion: 1,
      };
    });

    /*
     * ------------------------------------------------------
     * 8. UPSERT IN CHUNKS
     * ------------------------------------------------------
     *
     * We don't execute one save() per employee.
     */
    const result = await this.bulkUpsertReports(reportDocuments);

    this.logger.log(
      `Productivity report completed for ${this.formatDate(
        start,
      )}. Employees: ${reportDocuments.length}, Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`,
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

          /*
           * TC = total visits/calls
           */
          tc: {
            $sum: 1,
          },

          /*
           * UTC = unique visited outlets
           */
          outletIds: {
            $addToSet: '$outletId',
          },

          /*
           * Total retailing time
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

      /*
       * Sale -> Shop Visit
       *
       * Shop visit contains employeeId.
       */
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

      /*
       * Sale -> Sale Items
       */
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

      /*
       * First group by employee + sale.
       *
       * This is VERY IMPORTANT.
       *
       * Sale-level values must not be multiplied
       * because one sale can have many sale items.
       */
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

          /*
           * One sale item = one unique
           * saleId + productId line.
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

      /*
       * Then group by employee.
       */
      {
        $group: {
          _id: '$_id.employeeId',

          /*
           * PC
           */
          pc: {
            $sum: 1,
          },

          /*
           * UPC
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
