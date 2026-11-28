import { UserSkuStockReportQueryDto } from './dto/user-sku-stock-report-query.dto';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  ProductivityReport,
  ProductivityReportDocument,
} from 'src/core/database/mongo/schema/productivity-report.schema';

import { ExcelColumn, ExcelHelper } from '../../../shared/utils/excel.utils';

import { ProductivityReportExcelQueryDto } from './dto/productivity-report-excel-query.dto';

interface ProductivityExcelRow {
  date: string;

  admin: string;
  categoryManager: string;
  manager: string;
  teamLeader: string;
  salesman: string;

  country: string;
  province: string;

  reportingManager: string;
  positionOfEmployee: string;
  employeeId: string;
  user: string;
  userStatus: string;

  countTotalDays: number;
  countRetailingDays: number;

  sc: number;
  tc: number;
  pc: number;

  productivityPercentage: number;

  avgTc: number;
  avgPc: number;

  upc: number;
  utc: number;

  zeroOrder: number;
  notVisited: number;
  total: number;

  lpc: number;

  avgValuePerPc: number;

  qtyKgs: number;
  qtyCases: number;

  netValue: number;

  focusedOutletOrderKgs: number;
  focusedOutletOrderCases: number;
  focusedOutletOrderRevenue: number;

  avgValuePerRetailingDay: number;

  schemeDiscount: number;

  newOutlets: number;

  avgSpentTimeRetailingSeconds: number;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectModel(ProductivityReport.name)
    private readonly productivityReportModel: Model<ProductivityReportDocument>,
  ) {}

  /**
   * User wise SKU wise stock: opening + top up − sales (± adjustment) = closing,
   * from van daily stock over a date range. Opening is the first day's
   * opening, closing the last day's closing, in/out are summed.
   */
  async getUserSkuStockReport(query: UserSkuStockReportQueryDto) {
    const today = new Date();
    const from = new Date(query.fromDate || query.toDate || today);
    const to = new Date(query.toDate || query.fromDate || today);
    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      to < from
    ) {
      throw new BadRequestException('Invalid date range');
    }

    const db = this.productivityReportModel.db;
    let productFilter: string[] | undefined;
    if (query.categoryId) {
      const products = await db
        .collection('product_master')
        .find(
          {
            $or: [
              { categoryId: query.categoryId },
              { parentCategoryId: query.categoryId },
              { categoryIds: query.categoryId },
            ],
          },
          { projection: { _id: 0, productId: 1 } },
        )
        .toArray();
      productFilter = products.map((product) => String(product.productId));
    }

    const match: Record<string, unknown> = {
      date: { $gte: from, $lte: to },
      isDeleted: { $ne: true },
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.vanId ? { vanId: query.vanId } : {}),
      ...(productFilter ? { productId: { $in: productFilter } } : {}),
    };

    const grouped: any[] = await db
      .collection('van_daily_stock')
      .aggregate(
        [
          { $match: match },
          { $sort: { date: 1, createdAt: 1 } },
          {
            $group: {
              _id: {
                employeeId: '$employeeId',
                vanId: '$vanId',
                productId: '$productId',
              },
              openingQty: { $first: { $ifNull: ['$openingQty', 0] } },
              topupQty: { $sum: { $ifNull: ['$inQty', 0] } },
              salesQty: { $sum: { $ifNull: ['$outQty', 0] } },
              adjustmentQty: { $sum: { $ifNull: ['$adjustmentQty', 0] } },
              closingQty: { $last: { $ifNull: ['$closingQty', 0] } },
              unitQtyInCase: { $last: '$unitQtyInCase' },
              piecePrice: { $last: '$piecePrice' },
              days: { $addToSet: '$workSessionId' },
            },
          },
        ],
        { allowDiskUse: true },
      )
      .toArray();

    const employeeIds = [
      ...new Set(grouped.map((row) => row._id.employeeId).filter(Boolean)),
    ];
    const productIds = [
      ...new Set(grouped.map((row) => row._id.productId).filter(Boolean)),
    ];
    const [employees, products, categories] = await Promise.all([
      db
        .collection('employees')
        .find(
          { employeeId: { $in: employeeIds } },
          { projection: { _id: 0, employeeId: 1, name: 1 } },
        )
        .toArray(),
      db
        .collection('product_master')
        .find(
          { productId: { $in: productIds } },
          {
            projection: {
              _id: 0,
              productId: 1,
              name: 1,
              productSysCode: 1,
              categoryId: 1,
              parentCategoryId: 1,
              unitQtyInCase: 1,
              piecePrice: 1,
            },
          },
        )
        .toArray(),
      db
        .collection('productcategories')
        .find({}, { projection: { _id: 0, categoryId: 1, name: 1 } })
        .toArray(),
    ]);
    const employeeName = new Map(
      employees.map((row) => [row.employeeId, row.name]),
    );
    const productById = new Map(products.map((row) => [row.productId, row]));
    const categoryName = new Map(
      categories.map((row) => [row.categoryId, row.name]),
    );

    const round = (value: number) => Math.round(value * 1000) / 1000;
    const rows = grouped
      .map((row) => {
        const product: any = productById.get(row._id.productId) ?? {};
        const unitQtyInCase = Math.max(
          Number(row.unitQtyInCase ?? product.unitQtyInCase) || 1,
          1,
        );
        const piecePrice = Number(row.piecePrice ?? product.piecePrice) || 0;
        const opening = Number(row.openingQty) || 0;
        const topup = Number(row.topupQty) || 0;
        const sales = Number(row.salesQty) || 0;
        const adjustment = Number(row.adjustmentQty) || 0;
        const closing = Number(row.closingQty) || 0;
        const expectedClosing = opening + topup - sales + adjustment;
        return {
          id: `${row._id.employeeId}-${row._id.vanId}-${row._id.productId}`,
          employeeId: row._id.employeeId,
          employeeName:
            employeeName.get(row._id.employeeId) || row._id.employeeId,
          vanId: row._id.vanId,
          productId: row._id.productId,
          productName: product.name || row._id.productId,
          productSysCode: product.productSysCode || '',
          primaryCategory: categoryName.get(product.parentCategoryId) || '',
          secondaryCategory: categoryName.get(product.categoryId) || '',
          unitQtyInCase,
          days: (row.days || []).filter(Boolean).length,
          openingQty: opening,
          topupQty: topup,
          salesQty: sales,
          adjustmentQty: adjustment,
          closingQty: closing,
          openingCases: round(opening / unitQtyInCase),
          topupCases: round(topup / unitQtyInCase),
          salesCases: round(sales / unitQtyInCase),
          closingCases: round(closing / unitQtyInCase),
          closingValue: Math.round(closing * piecePrice * 100) / 100,
          difference: round(closing - expectedClosing),
        };
      })
      .sort(
        (a, b) =>
          String(a.employeeName).localeCompare(String(b.employeeName)) ||
          String(a.productName).localeCompare(String(b.productName)),
      );

    return {
      statusCode: HttpStatus.OK,
      message: 'User wise SKU stock report fetched',
      data: rows,
    };
  }

  /**
   * Prepare the productivity report Excel file.
   *
   * IMPORTANT:
   * This method only reads already prepared ProductivityReport
   * documents. It does NOT execute productivity calculations.
   */
  async getProductivityReportExcel(
    query: ProductivityReportExcelQueryDto,
  ): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  }> {
    const { startDate, endDate, employeeId } = query;

    const { start, end } = this.getUtcDateRange(startDate, endDate);

    this.logger.log(
      `Preparing productivity Excel report from ${start.toISOString()} to ${end.toISOString()}` +
        `${employeeId ? ` for employee ${employeeId}` : ''}`,
    );

    /* ======================================================
     * 1. BUILD DATABASE QUERY
     * ====================================================== */

    const filter: Record<string, any> = {
      reportDate: {
        $gte: start,
        $lt: end,
      },
    };

    if (employeeId) {
      filter.employeeId = employeeId.trim();
    }

    /* ======================================================
     * 2. FETCH PRODUCTIVITY REPORTS
     * ====================================================== */

    const reports = await this.productivityReportModel
      .find(filter)
      .sort({
        reportDate: 1,
        admin: 1,
        categoryManager: 1,
        manager: 1,
        teamLeader: 1,
        salesman: 1,
        employeeId: 1,
      })
      .lean();

    this.logger.log(
      `Found ${reports.length} productivity report records for Excel export.`,
    );

    /* ======================================================
     * 3. MAP DATABASE DOCUMENTS TO EXCEL ROWS
     * ====================================================== */

    const rows: ProductivityExcelRow[] = reports.map((report: any) => ({
      date: this.formatUtcDate(report.reportDate),

      admin: report.admin || '',
      categoryManager: report.categoryManager || '',
      manager: report.manager || '',
      teamLeader: report.teamLeader || '',
      salesman: report.salesman || '',

      country: report.country || '',
      province: report.province || '',

      reportingManager: report.reportingManager || '',
      positionOfEmployee: report.positionOfEmployee || '',

      employeeId: report.employeeId || '',

      user: report.user || '',

      userStatus: report.userStatus || '',

      countTotalDays: this.toNumber(report.countTotalDays),

      countRetailingDays: this.toNumber(report.countRetailingDays),

      sc: this.toNumber(report.sc),
      tc: this.toNumber(report.tc),
      pc: this.toNumber(report.pc),

      productivityPercentage: this.toNumber(report.productivityPercentage),

      avgTc: this.toNumber(report.avgTc),
      avgPc: this.toNumber(report.avgPc),

      upc: this.toNumber(report.upc),
      utc: this.toNumber(report.utc),

      zeroOrder: this.toNumber(report.zeroOrder),
      notVisited: this.toNumber(report.notVisited),
      total: this.toNumber(report.total),

      lpc: this.toNumber(report.lpc),

      avgValuePerPc: this.toNumber(report.avgValuePerPc),

      qtyKgs: this.toNumber(report.qtyKgs),
      qtyCases: this.toNumber(report.qtyCases),

      netValue: this.toNumber(report.netValue),

      focusedOutletOrderKgs: this.toNumber(report.focusedOutletOrderKgs),

      focusedOutletOrderCases: this.toNumber(report.focusedOutletOrderCases),

      focusedOutletOrderRevenue: this.toNumber(
        report.focusedOutletOrderRevenue,
      ),

      avgValuePerRetailingDay: this.toNumber(report.avgValuePerRetailingDay),

      schemeDiscount: this.toNumber(report.schemeDiscount),

      newOutlets: this.toNumber(report.newOutlets),

      avgSpentTimeRetailingSeconds: this.toNumber(
        report.avgSpentTimeRetailingSeconds,
      ),
    }));

    /* ======================================================
     * 4. CREATE EXCEL
     * ====================================================== */

    const columns: ExcelColumn<ProductivityExcelRow>[] = [
      {
        header: 'Date',
        key: 'date',
      },

      /* ==================================================
       * HIERARCHY
       * ================================================== */

      {
        header: 'Admin',
        key: 'admin',
      },
      {
        header: 'Category Manager',
        key: 'categoryManager',
      },
      {
        header: 'Manager',
        key: 'manager',
      },
      {
        header: 'Team Leader',
        key: 'teamLeader',
      },
      {
        header: 'Salesman',
        key: 'salesman',
      },

      /* ==================================================
       * TERRITORY
       * ================================================== */

      {
        header: 'Country',
        key: 'country',
      },
      {
        header: 'Province',
        key: 'province',
      },

      /* ==================================================
       * EMPLOYEE
       * ================================================== */

      {
        header: 'Reporting Manager',
        key: 'reportingManager',
      },
      {
        header: 'Position of Employee',
        key: 'positionOfEmployee',
      },
      {
        header: 'Employee Id',
        key: 'employeeId',
      },
      {
        header: 'User',
        key: 'user',
      },
      {
        header: 'User Status',
        key: 'userStatus',
      },

      /* ==================================================
       * ATTENDANCE
       * ================================================== */

      {
        header: 'Count Total Days',
        key: 'countTotalDays',
      },
      {
        header: 'Count Retailing Days',
        key: 'countRetailingDays',
      },

      /* ==================================================
       * CALL / PRODUCTIVITY
       * ================================================== */

      {
        header: 'SC',
        key: 'sc',
      },
      {
        header: 'TC',
        key: 'tc',
      },
      {
        header: 'PC',
        key: 'pc',
      },
      {
        header: 'Productivity %',
        key: 'productivityPercentage',
      },
      {
        header: 'Avg. TC',
        key: 'avgTc',
      },
      {
        header: 'Avg. PC',
        key: 'avgPc',
      },

      /* ==================================================
       * OUTLET
       * ================================================== */

      {
        header: 'UPC',
        key: 'upc',
      },
      {
        header: 'UTC',
        key: 'utc',
      },
      {
        header: 'Zero Order',
        key: 'zeroOrder',
      },
      {
        header: 'Not Visited',
        key: 'notVisited',
      },
      {
        header: 'Total',
        key: 'total',
      },

      /* ==================================================
       * SALES
       * ================================================== */

      {
        header: 'LPC',
        key: 'lpc',
      },
      {
        header: 'Avg Value Per PC',
        key: 'avgValuePerPc',
      },
      {
        header: 'Qty (Kgs)',
        key: 'qtyKgs',
      },
      {
        header: 'Qty (Cases)',
        key: 'qtyCases',
      },
      {
        header: 'Net Value',
        key: 'netValue',
      },

      /* ==================================================
       * FOCUSED OUTLET
       * ================================================== */

      {
        header: 'Focused Outlet Order (Kgs)',
        key: 'focusedOutletOrderKgs',
      },
      {
        header: 'Focused Outlet Order (Cases)',
        key: 'focusedOutletOrderCases',
      },
      {
        header: 'Focused Outlet Order (Revenue)',
        key: 'focusedOutletOrderRevenue',
      },

      /* ==================================================
       * OTHER SALES METRICS
       * ================================================== */

      {
        header: 'Avg. Value Per Retailing Day',
        key: 'avgValuePerRetailingDay',
      },
      {
        header: 'Scheme Discount',
        key: 'schemeDiscount',
      },

      /* ==================================================
       * NEW OUTLETS
       * ================================================== */

      {
        header: 'New Outlets',
        key: 'newOutlets',
      },

      /* ==================================================
       * RETAILING TIME
       * ================================================== */

      {
        header: 'Avg Spent Time Retailing',
        key: 'avgSpentTimeRetailingSeconds',
        formatter: (value) => ExcelHelper.secondsToTime(value),
      },
    ];

    const buffer = ExcelHelper.createWorkbookBuffer(
      columns,
      rows,
      'Productivity Report',
    );

    this.logger.log(
      `Productivity Excel report generated successfully. Rows: ${rows.length}`,
    );

    return {
      buffer,
      fileName: 'productivity-report.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /* ======================================================
   * DATE HELPERS
   * ====================================================== */

  /**
   * Converts inclusive date-only query parameters into
   * an exclusive UTC date range.
   *
   * Example:
   *
   * startDate = 2026-08-01
   * endDate   = 2026-08-31
   *
   * becomes:
   *
   * start = 2026-08-01T00:00:00.000Z
   * end   = 2026-09-01T00:00:00.000Z
   */
  private getUtcDateRange(startDate: string, endDate: string) {
    const start = this.parseUtcDateOnly(startDate);
    const endDateStart = this.parseUtcDateOnly(endDate);

    if (start > endDateStart) {
      throw new BadRequestException(
        'startDate must be less than or equal to endDate.',
      );
    }

    const end = new Date(endDateStart);

    end.setUTCDate(end.getUTCDate() + 1);

    return {
      start,
      end,
    };
  }

  /**
   * Parse YYYY-MM-DD as UTC midnight.
   */
  private parseUtcDateOnly(date: string): Date {
    const value = String(date || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(
        `Invalid date "${date}". Expected format YYYY-MM-DD.`,
      );
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date "${date}".`);
    }

    return parsed;
  }

  /**
   * Format report date as YYYY-MM-DD in UTC.
   */
  private formatUtcDate(date: Date | string): string {
    const value = new Date(date);

    if (Number.isNaN(value.getTime())) {
      return '';
    }

    return value.toISOString().slice(0, 10);
  }

  /* ======================================================
   * VALUE HELPERS
   * ====================================================== */

  private toNumber(value: unknown): number {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
  }
}
