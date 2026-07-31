import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Customer } from 'src/core/database/mongo/schema/customer.schema';
import { Payment } from 'src/core/database/mongo/schema/payment.schema';
import { RouteSession } from 'src/core/database/mongo/schema/route-session.schema';
import { Sale } from 'src/core/database/mongo/schema/sale.schema';
import { VanDailyStock } from 'src/core/database/mongo/schema/van-daily-stock.schema';
import { WorkSession } from 'src/core/database/mongo/schema/work-session.schema';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { PaymentStatus } from 'src/shared/enums/payment.enums';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { RequestContextStore } from 'src/core/context/request-context';
import { SaleStatus } from 'src/shared/enums/sale.enums';
import { Van } from 'src/core/database/mongo/schema/van.schema';
import { RouteCustomerMapping } from 'src/core/database/mongo/schema/route-customer-mapping.schema';

type DashboardTone = 'success' | 'warning' | 'danger' | 'neutral';

type SalesSeriesPoint = {
  label: string;
  value: number;
};

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Sale.name) private readonly saleModel: Model<Sale>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(RouteSession.name)
    private readonly routeSessionModel: Model<RouteSession>,
    @InjectModel(WorkSession.name)
    private readonly workSessionModel: Model<WorkSession>,
    @InjectModel(VanDailyStock.name)
    private readonly vanDailyStockModel: Model<VanDailyStock>,
    @InjectModel(Van.name) private readonly vanModel: Model<Van>,
    @InjectModel(RouteCustomerMapping.name)
    private readonly routeCustomerMappingModel: Model<RouteCustomerMapping>,
  ) {}

  async getSummary(query: DashboardQueryDto) {
    const { currentRange } = this.getDateRanges(query);
    const saleFilter = this.buildScopedFilter(query, 'date', currentRange);
    const routeFilter = this.buildScopedFilter(
      query,
      'sessionDate',
      currentRange,
    );

    const [plannedRoutes, completedRoutes, exceptions] = await Promise.all([
      this.routeSessionModel.countDocuments(routeFilter),
      this.routeSessionModel.countDocuments({
        ...routeFilter,
        status: RouteSessionStatus.COMPLETED,
      }),
      this.saleModel.countDocuments({
        ...saleFilter,
        $or: [{ pendingAmount: { $gt: 0 } }, { totalReturnQty: { $gt: 0 } }],
      }),
    ]);

    return {
      message: 'Dashboard summary fetched successfully',
      data: {
        id: 'dashboard-summary',
        title: 'MIS Dashboard',
        description:
          'National sales, collections, coverage and operational health',
        planned: plannedRoutes,
        completed: completedRoutes,
        exceptions,
        status: this.getSummaryStatus(
          plannedRoutes,
          completedRoutes,
          exceptions,
        ),
      },
    };
  }

  async getExecutive(query: DashboardQueryDto) {
    query = this.withLoggedInSalesmanScope(query);
    const { currentRange, previousRange } = this.getDateRanges(query);
    const customerScope = await this.getCustomerScope(query);
    const currentSaleFilter = {
      ...this.buildScopedFilter(
        query,
        'date',
        currentRange,
        'positionHierarchy.employeeId',
      ),
      status: SaleStatus.COMPLETED,
    };
    const previousSaleFilter = {
      ...this.buildScopedFilter(
        query,
        'date',
        previousRange,
        'positionHierarchy.employeeId',
      ),
      status: SaleStatus.COMPLETED,
    };
    const currentPaymentFilter = this.buildScopedFilter(
      query,
      'date',
      currentRange,
    );
    const routeFilter = this.buildScopedFilter(
      query,
      'sessionDate',
      currentRange,
    );
    const workSessionFilter = this.buildScopedFilter(
      query,
      'dayStartTime',
      currentRange,
      'userId',
    );
    const stockFilter = this.buildScopedFilter(query, 'date', currentRange);

    const [
      sales,
      previousSales,
      orders,
      successfulPayments,
      overdueSales,
      activeOutlets,
      newOutlets,
      routeCoverage,
      attendance,
      stockAccuracy,
      salesTrend,
      pendingRouteSessions,
    ] = await Promise.all([
      this.sum(this.saleModel, currentSaleFilter, 'totalValue'),
      this.sum(this.saleModel, previousSaleFilter, 'totalValue'),
      this.saleModel.countDocuments(currentSaleFilter),
      this.sum(
        this.paymentModel,
        { ...currentPaymentFilter, status: PaymentStatus.SUCCESS },
        'amount',
      ),
      this.sum(
        this.saleModel,
        { ...currentSaleFilter, pendingAmount: { $gt: 0 } },
        'pendingAmount',
      ),
      this.customerModel.countDocuments({
        ...customerScope,
        status: CustomerStatus.ACTIVE,
      }),
      this.customerModel.countDocuments({
        ...customerScope,
        createdAt: currentRange,
      }),
      this.getRouteCoverage(routeFilter),
      this.getAttendanceCompliance(workSessionFilter),
      this.getStockAccuracy(stockFilter),
      this.getSalesTrend(currentSaleFilter, currentRange),
      this.routeSessionModel
        .find({
          ...routeFilter,
          status: { $ne: RouteSessionStatus.COMPLETED },
        })
        .sort({ sessionDate: -1 })
        .limit(3)
        .lean(),
    ]);

    const growth = this.getPercentageChange(sales, previousSales);

    return {
      message: 'Executive dashboard fetched successfully',
      data: {
        metrics: [
          {
            title: 'Net Sales',
            value: this.formatCurrency(sales),
            change: `${this.formatSignedPercent(growth)} vs previous period`,
            tone: growth >= 0 ? 'success' : 'danger',
          },
          {
            title: 'Orders',
            value: this.formatNumber(orders),
            change: `${this.formatCurrency(sales / Math.max(orders, 1))} average order value`,
            tone: 'neutral',
          },
          {
            title: 'Collections',
            value: this.formatCurrency(successfulPayments),
            change: `${this.formatCurrency(overdueSales)} outstanding`,
            tone: overdueSales > 0 ? 'warning' : 'success',
          },
          {
            title: 'Active Outlets',
            value: this.formatNumber(activeOutlets),
            change: `+${this.formatNumber(newOutlets)} in period`,
            tone: 'success',
          },
        ],
        operatingStatus: [
          { label: 'Routes covered', value: `${routeCoverage}%` },
          { label: 'Van stock accuracy', value: `${stockAccuracy}%` },
          { label: 'Attendance compliance', value: `${attendance}%` },
          { label: 'Master health', value: `${activeOutlets > 0 ? 100 : 0}%` },
        ],
        salesTrend,
        focus: {
          outletCoverage: routeCoverage,
          collectionSla:
            sales > 0 ? Math.round((successfulPayments / sales) * 100) : 0,
          inventoryHygiene: stockAccuracy,
        },
        alerts: pendingRouteSessions.map((session, index) => ({
          key: session.routeSessionId ?? String(index),
          severity: index === 0 ? 'High' : 'Medium',
          area: session.routeName ?? session.routeId ?? 'Route session',
          owner: session.userName ?? session.userId ?? 'Field team',
          age: this.formatAge(session.sessionDate),
        })),
      },
    };
  }

  private getDateRanges(query: DashboardQueryDto) {
    const to = query.to ? new Date(query.to) : new Date();
    to.setHours(23, 59, 59, 999);

    const from = query.from ? new Date(query.from) : new Date(to);
    if (!query.from) {
      from.setDate(from.getDate() - 6);
    }
    from.setHours(0, 0, 0, 0);

    const durationMs = to.getTime() - from.getTime();
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - durationMs);

    return {
      currentRange: { $gte: from, $lte: to },
      previousRange: { $gte: previousFrom, $lte: previousTo },
    };
  }

  private buildScopedFilter(
    query: DashboardQueryDto,
    dateField: string,
    range: { $gte: Date; $lte: Date },
    employeeField = 'employeeId',
  ) {
    const filter: Record<string, unknown> = { [dateField]: range };

    if (query.vanId) filter.vanId = query.vanId;
    if (query.employeeId) filter[employeeField] = query.employeeId;

    return filter;
  }

  private withLoggedInSalesmanScope(query: DashboardQueryDto) {
    const context = RequestContextStore.getStore();
    const role = String(context?.role ?? '')
      .trim()
      .toUpperCase();
    const isSalesman = ['SALESMAN', 'SALES', 'SALES_EXECUTIVE'].includes(role);

    if (!isSalesman) return query;

    return {
      ...query,
      employeeId: context?.userId,
      vanId: context?.vanId ?? query.vanId,
    };
  }

  private async getCustomerScope(query: DashboardQueryDto) {
    if (!query.vanId) return {};

    const van = await this.vanModel
      .findOne({
        vanId: query.vanId,
        isDeleted: { $ne: true },
      })
      .lean();
    const routeIds = Array.from(
      new Set(
        (van?.associatedRoutes ?? [])
          .map((route) => String(route?.routeId ?? ''))
          .filter(Boolean),
      ),
    );
    if (!routeIds.length) return { customerId: { $in: [] } };

    const customerIds = await this.routeCustomerMappingModel.distinct(
      'customerId',
      {
        routeId: { $in: routeIds },
        status: { $ne: 'INACTIVE' },
        isDeleted: { $ne: true },
      },
    );

    return { customerId: { $in: customerIds } };
  }

  private async sum(
    model: Model<any>,
    match: Record<string, unknown>,
    field: string,
  ) {
    const [result] = await model.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: `$${field}` } } },
    ]);

    return Number(result?.total ?? 0);
  }

  private async getRouteCoverage(match: Record<string, unknown>) {
    const [result] = await this.routeSessionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalShops' },
          visited: { $sum: '$visitedShops' },
        },
      },
    ]);

    return this.toPercent(result?.visited ?? 0, result?.total ?? 0);
  }

  private async getAttendanceCompliance(match: Record<string, unknown>) {
    const [result] = await this.workSessionModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          started: { $sum: 1 },
          ended: {
            $sum: { $cond: [{ $ifNull: ['$dayEndTime', false] }, 1, 0] },
          },
        },
      },
    ]);

    return this.toPercent(result?.ended ?? 0, result?.started ?? 0);
  }

  private async getStockAccuracy(match: Record<string, unknown>) {
    const [result] = await this.vanDailyStockModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          accurate: {
            $sum: {
              $cond: [{ $gte: ['$closingQty', 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    return this.toPercent(result?.accurate ?? 0, result?.total ?? 0);
  }

  private async getSalesTrend(
    match: Record<string, unknown>,
    range: { $gte: Date; $lte: Date },
  ) {
    const rows = await this.saleModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          value: { $sum: '$totalValue' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const values = new Map<string, number>(
      rows.map((row) => [row._id, Number(row.value ?? 0)]),
    );
    const points: SalesSeriesPoint[] = [];
    const cursor = new Date(range.$gte);

    while (cursor <= range.$lte && points.length < 31) {
      const key = cursor.toISOString().slice(0, 10);
      points.push({
        label: cursor.toLocaleDateString('en-US', { weekday: 'short' }),
        value: values.get(key) ?? 0,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return points;
  }

  private getPercentageChange(current: number, previous: number) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  private formatSignedPercent(value: number) {
    return `${value >= 0 ? '+' : ''}${value}%`;
  }

  private formatCurrency(value: number) {
    if (value >= 10000000) return `Rs ${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `Rs ${(value / 100000).toFixed(2)} L`;
    return `Rs ${this.formatNumber(Math.round(value))}`;
  }

  private formatNumber(value: number) {
    return new Intl.NumberFormat('en-IN').format(value);
  }

  private toPercent(value: number, total: number) {
    if (!total) return 0;
    return Math.min(100, Math.round((value / total) * 100));
  }

  private getSummaryStatus(
    planned: number,
    completed: number,
    exceptions: number,
  ): 'on-track' | 'watch' | 'blocked' {
    if (exceptions > completed) return 'blocked';
    if (planned === 0 || this.toPercent(completed, planned) < 70)
      return 'watch';
    return 'on-track';
  }

  private formatAge(value?: Date | string) {
    if (!value) return 'n/a';
    const date = new Date(value);
    const minutes = Math.max(
      0,
      Math.floor((Date.now() - date.getTime()) / 60000),
    );
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
}
