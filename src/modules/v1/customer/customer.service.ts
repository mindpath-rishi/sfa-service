import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';

import { CUSTOMER } from './customer.constants';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { RouteCustomerMappingService } from '../route-customer-mapping/route-customer-mapping.service';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';
import { InjectModel } from '@nestjs/mongoose';
import { ShopVisit } from 'src/core/database/mongo/schema/shop-visit.schema';
import { Sale } from 'src/core/database/mongo/schema/sale.schema';
import { Model } from 'mongoose';
import * as XLSX from 'xlsx';

import { Country } from 'src/core/database/mongo/schema/country.schema';
import { Province } from 'src/core/database/mongo/schema/province.schema';
import { Market } from 'src/core/database/mongo/schema/market.schema';
import { Route } from 'src/core/database/mongo/schema/route.schema';
import { RouteCustomerMapping } from 'src/core/database/mongo/schema/route-customer-mapping.schema';
import { Van } from 'src/core/database/mongo/schema/van.schema';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { Employee } from 'src/core/database/mongo/schema/employee.schema';
import { NotificationService } from '../notification/notification.service';
import { RequestContextStore } from 'src/core/context/request-context';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { OutletVerificationService } from '../outlet-verification/outlet-verification.service';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

@Injectable()
export class CustomerService extends MongoRepository<Customer> {
  constructor(
    mongo: MongoService,
    @InjectModel(ShopVisit.name)
    private readonly shopVisitModel: Model<ShopVisit>,
    @InjectModel(Sale.name)
    private readonly saleModel: Model<Sale>,
    private readonly routeCustomerMappingService: RouteCustomerMappingService,
    @InjectModel(Country.name)
    private readonly countryModel: Model<Country>,

    @InjectModel(Province.name)
    private readonly provinceModel: Model<Province>,

    @InjectModel(Market.name)
    private readonly marketModel: Model<Market>,

    @InjectModel(Route.name)
    private readonly routeModel: Model<Route>,

    @InjectModel(Van.name)
    private readonly vanModel: Model<Van>,

    @InjectModel(RouteCustomerMapping.name)
    private readonly routeCustomerMappingModel: Model<RouteCustomerMapping>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<Employee>,
    private readonly notificationService: NotificationService,
    private readonly outletVerificationService: OutletVerificationService,
  ) {
    super(mongo.getModel(Customer.name, CustomerSchema));
  }

  private buildCustomerFilter(query: CustomerQueryDto) {
    const {
      searchText,
      status,
      customerIds,
      customerCategoryId,
      channelId,
      outletTypeId,
      marketId,
      provinceId,
      ownerName,
      phoneNumber,
      outletName,
      address,
    } = query;
    const filter: FilterQuery<Customer> = {};

    if (status) filter.status = status;
    if (customerCategoryId) filter.customerCategoryId = customerCategoryId;
    if (channelId) filter.channelId = channelId;
    if (outletTypeId) filter.customerTypeId = outletTypeId;
    if (marketId) filter.marketId = marketId;
    if (provinceId) filter.provinceId = provinceId;
    if (ownerName) filter.ownerName = new RegExp(ownerName, 'i') as any;
    if (phoneNumber) filter.phoneNumber = new RegExp(phoneNumber, 'i') as any;
    if (outletName) filter.name = new RegExp(outletName, 'i') as any;

    if (address) {
      const regex = new RegExp(address, 'i');
      filter.$or = [
        ...(Array.isArray(filter.$or) ? filter.$or : []),
        { 'address.line1': regex },
        { 'address.line2': regex },
      ] as any;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        ...(Array.isArray(filter.$or) ? filter.$or : []),
        { customerId: regex },
        { name: regex },
        { ownerName: regex },
        { phoneNumber: regex },
        { customerCategoryId: regex },
        { marketId: regex },
        { provinceId: regex },
      ] as any;
    }

    if (customerIds) {
      filter.customerId = { $in: customerIds } as any;
    }

    return filter;
  }

  private getCustomerSort(query: CustomerQueryDto): Record<string, 1 | -1> {
    const sortMap: Record<string, string> = {
      primary: 'name',
      name: 'name',
      customerId: 'customerId',
      owner: 'ownerName',
      ownerName: 'ownerName',
      phoneNumber: 'phoneNumber',
      secondary: 'customerCategoryId',
      customerCategoryId: 'customerCategoryId',
      customerTypeId: 'customerTypeId',
      market: 'marketId',
      marketId: 'marketId',
      province: 'provinceId',
      provinceId: 'provinceId',
      metric: 'outstanding',
      outstanding: 'outstanding',
      creditLimit: 'creditLimit',
      creditDays: 'creditDays',
      createdAt: 'createdAt',
    };
    const sortField = query.sortBy ? sortMap[query.sortBy] : undefined;

    if (!sortField) return { createdAt: -1 };

    return { [sortField]: query.sortOrder === 'desc' ? -1 : 1 };
  }

  private getExportColumns(columns?: string) {
    const definitions = [
      { key: 'primary', title: 'Outlet' },
      { key: 'customerId', title: 'Customer ID' },
      { key: 'owner', title: 'Owner' },
      { key: 'phoneNumber', title: 'Phone' },
      { key: 'secondary', title: 'Category' },
      { key: 'market', title: 'Market' },
      { key: 'province', title: 'Province' },
      { key: 'route', title: 'Route' },
      { key: 'metric', title: 'Outstanding' },
      { key: 'address', title: 'Address' },
      { key: 'status', title: 'Status' },
      { key: 'creditLimit', title: 'Credit Limit' },
      { key: 'creditDays', title: 'Credit Days' },
    ];
    const requested = columns
      ?.split(',')
      .map((column) => column.trim())
      .filter(Boolean);

    if (!requested?.length) return definitions;

    const selected = definitions.filter((column) =>
      requested.includes(column.key),
    );

    return selected.length ? selected : definitions;
  }

  private formatCustomerAddress(address?: Customer['address'] | string) {
    if (!address) return '';
    if (typeof address === 'string') return address;

    return [address.line1, address.line2].filter(Boolean).join(', ');
  }

  private escapePdfText(value: string) {
    return String(value ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private buildPdfBuffer(title: string, rows: string[][]) {
    const [headers = [], ...dataRows] = rows;
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 28;
    const tableWidth = pageWidth - margin * 2;
    const columnWidth = tableWidth / Math.max(headers.length, 1);
    const headerY = pageHeight - 96;
    const rowHeight = 23;
    const headerHeight = 25;
    const rowsPerPage = Math.max(
      1,
      Math.floor((headerY - margin - headerHeight) / rowHeight),
    );
    const pageRows: string[][][] = [];

    for (let index = 0; index < dataRows.length; index += rowsPerPage) {
      pageRows.push(dataRows.slice(index, index + rowsPerPage));
    }

    if (!pageRows.length) pageRows.push([]);

    const formatDate = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: REPORT_TIMEZONE,
    }).format(new Date());
    const fontSize = headers.length > 7 ? 6.5 : 7.5;
    const headerFontSize = headers.length > 7 ? 6.8 : 7.8;
    const textLimit = (width: number, size: number) =>
      Math.max(6, Math.floor(width / (size * 0.52)));
    const truncate = (value: string, limit: number) => {
      const cleanValue = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      return cleanValue.length > limit
        ? `${cleanValue.slice(0, Math.max(0, limit - 3))}...`
        : cleanValue;
    };
    const text = (x: number, y: number, value: string, size = fontSize) =>
      `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${this.escapePdfText(value)}) Tj ET`;
    const rect = (
      x: number,
      y: number,
      width: number,
      height: number,
      mode: 'S' | 'f' = 'S',
    ) =>
      `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${mode}`;
    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    const fontObjectId = 3;
    let nextObjectId = 4;

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[fontObjectId] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    for (const [pageIndex, rowsForPage] of pageRows.entries()) {
      const pageObjectId = nextObjectId;
      const contentObjectId = nextObjectId + 1;
      nextObjectId += 2;
      pageObjectIds.push(pageObjectId);

      const commands: string[] = [
        '0.08 0.13 0.2 rg',
        text(margin, pageHeight - 42, title, 16),
        '0.35 0.43 0.53 rg',
        text(
          margin,
          pageHeight - 62,
          `Generated ${formatDate} - ${dataRows.length} row(s)`,
          8,
        ),
        text(
          pageWidth - margin - 84,
          pageHeight - 62,
          `Page ${pageIndex + 1} of ${pageRows.length}`,
          8,
        ),
        '0.05 0.47 0.47 rg',
        rect(margin, headerY, tableWidth, headerHeight, 'f'),
        '1 1 1 rg',
        ...headers.map((header, columnIndex) =>
          text(
            margin + columnIndex * columnWidth + 5,
            headerY + 9,
            truncate(header, textLimit(columnWidth - 10, headerFontSize)),
            headerFontSize,
          ),
        ),
      ];

      rowsForPage.forEach((row, rowIndex) => {
        const y = headerY - (rowIndex + 1) * rowHeight;

        if (rowIndex % 2 === 0) {
          commands.push(
            '0.95 0.99 0.99 rg',
            rect(margin, y, tableWidth, rowHeight, 'f'),
          );
        }

        commands.push(
          '0.85 0.89 0.94 RG',
          rect(margin, y, tableWidth, rowHeight),
        );
        commands.push('0.08 0.13 0.2 rg');

        row.forEach((value, columnIndex) => {
          const x = margin + columnIndex * columnWidth;
          commands.push(
            '0.85 0.89 0.94 RG',
            rect(x, y, columnWidth, rowHeight),
            '0.08 0.13 0.2 rg',
            text(
              x + 5,
              y + 8,
              truncate(value, textLimit(columnWidth - 10, fontSize)),
              fontSize,
            ),
          );
        });
      });

      const content = commands.join('\n');

      objects[pageObjectId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
      objects[contentObjectId] =
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    }

    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (let id = 1; id < objects.length; id += 1) {
      if (!objects[id]) continue;
      offsets[id] = Buffer.byteLength(pdf);
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;

    for (let id = 1; id < objects.length; id += 1) {
      pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf);
  }

  // async create(payload: CreateCustomerDto) {
  //   try {
  //     return await this.withTransaction(async (session) => {
  //       const filter: FilterQuery<Customer> = {};

  //       const existing = await this.findOne(filter, {
  //         session,
  //         includeDeleted: true,
  //       });

  //       if (existing && !existing.isDeleted) {
  //         throw new ConflictException(CUSTOMER.DUPLICATE);
  //       }

  //       if (existing?.isDeleted) {
  //         await this.updateById(
  //           existing._id.toString(),
  //           {
  //             ...payload,
  //             status: 'ACTIVE',
  //             isDeleted: false,
  //           },
  //           { session },
  //         );

  //         return {
  //           statusCode: HttpStatus.OK,
  //           message: CUSTOMER.CREATED,
  //           data: { customerId: existing.customerId },
  //         };
  //       }

  //       const doc = await this.save(
  //         {
  //           customerId: IdGenerator.generate('CUST', 8),
  //           ...payload,
  //         },
  //         { session },
  //       );

  //       return {
  //         statusCode: HttpStatus.CREATED,
  //         message: CUSTOMER.CREATED,
  //         data: doc,
  //       };
  //     });
  //   } catch (error) {
  //     this.handleDuplicateError(error);
  //   }
  // }

  async create(payload: CreateCustomerDto) {
    try {
      const creatorId = String(RequestContextStore.getStore()?.userId ?? '');
      const result = await this.withTransaction(async (session) => {
        const filter: FilterQuery<Customer> = {
          phoneNumber: payload.phoneNumber,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        let customerId: string;

        // ✅ CASE 1: Already exists (active)
        if (existing && !existing.isDeleted) {
          throw new ConflictException(CUSTOMER.DUPLICATE);
        }

        // ✅ CASE 2: Restore deleted customer
        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...payload,
              status: CustomerStatus.VERIFICATION_PENDING,
              createdByEmployeeId: creatorId || undefined,
              isDeleted: false,
            },
            { session },
          );

          customerId = existing.customerId;
        } else {
          // ✅ CASE 3: Create new customer
          const doc = await this.save(
            {
              customerId: IdGenerator.generateRandomNumber(12),
              ...payload,
              status: CustomerStatus.VERIFICATION_PENDING,
              createdByEmployeeId: creatorId || undefined,
            },
            { session },
          );

          customerId = doc.customerId;
        }

        await this.outletVerificationService.createForOutlet(
          customerId,
          creatorId,
          session,
        );

        // =====================================================
        // ✅ CREATE ROUTE CUSTOMER MAPPING
        // =====================================================

        if (payload.routeId) {
          // Optional: get next sequence automatically
          const lastMapping = await this.routeCustomerMappingService.findOne(
            { routeId: payload.routeId },
            { session },
          );

          const nextSequence = lastMapping ? lastMapping.sequence + 1 : 1;

          await this.routeCustomerMappingService.create(
            {
              routeId: payload.routeId,
              customerId,
              sequence: nextSequence,
            },
            session,
          );
        }

        // =====================================================
        // ✅ RESPONSE
        // =====================================================

        return {
          statusCode: HttpStatus.CREATED,
          message: CUSTOMER.CREATED,
          data: { customerId },
        };
      });
      if (creatorId)
        await this.notifyReportingManager(result.data.customerId, creatorId);
      return result;
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  private async notifyReportingManager(customerId: string, creatorId: string) {
    const [creator, customer] = await Promise.all([
      this.employeeModel
        .findOne({ employeeId: creatorId, isDeleted: { $ne: true } })
        .lean(),
      this.findOne({ customerId }),
    ]);
    const managerId = creator?.hierarchyPath?.at(-1);
    if (!creator || !managerId || !customer) return;

    await this.notificationService.create({
      recipientId: managerId,
      title: 'New outlet awaiting approval',
      body: `${creator.name || 'An executive'} created ${customer.name}`,
      category: 'outlet_approval',
      data: {
        category: 'outlet_approval',
        action: 'APPROVAL_REQUIRED',
        status: 'PENDING',
        customerId,
        outletName: customer.name,
        ownerName: customer.ownerName,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
        geoTag: customer.geoTag,
        createdByEmployeeId: creatorId,
        createdByName: creator.name,
        route: '/notifications',
      },
    });
  }

  async reviewOutlet(customerId: string, approve: boolean, reason?: string) {
    return this.outletVerificationService.reviewByCustomerId(
      customerId,
      approve,
      reason,
    );
  }

  async findAll(query: CustomerQueryDto) {
    const { page = 1, limit = 20 } = query;

    const result = await this.paginate(this.buildCustomerFilter(query), {
      page,
      limit,
      sort: this.getCustomerSort(query),
      lean: true,
    });

    const customerIds = result.items.map((customer) => customer.customerId);
    const routeByCustomerId = new Map<string, string>();
    const routeNameByRouteId = new Map<string, string>();

    if (customerIds.length) {
      const activeMappings = await this.routeCustomerMappingModel
        .find({
          customerId: { $in: customerIds },
          status: RouteCustomerMappingStatus.ACTIVE,
          isDeleted: { $ne: true },
        })
        .select({ customerId: 1, routeId: 1, effectiveFrom: 1 })
        .sort({ effectiveFrom: -1 })
        .lean();

      for (const mapping of activeMappings) {
        if (!routeByCustomerId.has(mapping.customerId)) {
          routeByCustomerId.set(mapping.customerId, mapping.routeId);
        }
      }

      const routeIds = [...new Set(routeByCustomerId.values())];
      const routes = await this.routeModel
        .find({ routeId: { $in: routeIds }, isDeleted: { $ne: true } })
        .select({ routeId: 1, name: 1 })
        .lean();

      for (const route of routes) {
        routeNameByRouteId.set(route.routeId, route.name);
      }
    }

    const customers = result.items.map((customer) => {
      const routeId = routeByCustomerId.get(customer.customerId);

      return {
        ...customer.toObject(),
        routeId,
        routeName: routeId ? routeNameByRouteId.get(routeId) : undefined,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.FETCHED,
      data: customers,
      meta: result.meta,
    };
  }

  async exportCustomers(
    query: CustomerQueryDto & { fileType?: 'excel' | 'pdf'; columns?: string },
  ) {
    const columns = this.getExportColumns(query.columns);
    const customers = await this.findLean(this.buildCustomerFilter(query), {
      sort: this.getCustomerSort(query),
    });
    const exportRows = customers.map((customer: any) => {
      const values: Record<string, string> = {
        primary: customer.name || '',
        customerId: customer.customerId || '',
        owner: customer.ownerName || '',
        phoneNumber: customer.phoneNumber || '',
        secondary: customer.customerCategoryId || '',
        market: customer.marketId || '',
        province: customer.provinceId || '',
        route: customer.routeId || '',
        metric: String(customer.outstanding ?? 0),
        address: this.formatCustomerAddress(customer.address),
        status: customer.status || '',
        creditLimit: String(customer.creditLimit ?? 0),
        creditDays: String(customer.creditDays ?? 0),
      };

      return columns.map((column) => values[column.key] ?? '');
    });
    const headerRow = columns.map((column) => column.title);

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildPdfBuffer('Outlet Listing', [
          headerRow,
          ...exportRows,
        ]),
        fileName: 'outlet-listing.pdf',
        mimeType: 'application/pdf',
      };
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Outlets');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'outlet-listing.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // async findByCustomerId(customerId: string) {
  //   const doc = await this.findOne({ customerId }, { lean: true });

  //   if (!doc) throw new NotFoundException(CUSTOMER.NOT_FOUND);

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: CUSTOMER.FETCHED,
  //     data: doc,
  //   };
  // }

  // async findByCustomerId(customerId: string) {
  //   const doc = await this.findOne({ customerId }, { lean: true });

  //   if (!doc) throw new NotFoundException(CUSTOMER.NOT_FOUND);

  //   // Get current date range for MTD (Month to Date)
  //   const now = new Date();
  //   const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  //   const monthToDateEnd = now;

  //   // Get last 5 completed orders
  //   const last5Orders: any = await this.saleModel
  //     .find({
  //       customerId,
  //       status: 'COMPLETED',
  //       isDeleted: false,
  //     })
  //     .sort({ createdAt: -1 })
  //     .limit(5)
  //     .lean();

  //   // Calculate MTD order value and quantity
  //   const mtdOrders: any = await this.saleModel.aggregate([
  //     {
  //       $match: {
  //         customerId,
  //         status: 'COMPLETED',
  //         isDeleted: false,
  //         date: {
  //           $gte: startOfMonth,
  //           $lte: monthToDateEnd,
  //         },
  //       },
  //     },
  //     {
  //       $group: {
  //         _id: null,
  //         mtdOrderValue: { $sum: '$totalValue' },
  //         mtdTotalCases: {
  //           $sum: {
  //             $ifNull: ['$netCases', 0],
  //           },
  //         },
  //         mtdOrderCount: { $sum: 1 },
  //       },
  //     },
  //   ]);

  //   // Calculate last 5 orders statistics
  //   let avgOrderValue = 0;
  //   let avgOrderQty = 0;
  //   let avgLPC = 0;

  //   if (last5Orders.length > 0) {
  //     const pc = last5Orders.length;
  //     const totalValue = last5Orders.reduce(
  //       (sum, order: any) => sum + (order.totalValue || 0),
  //       0,
  //     );
  //     const totalCasesSold = last5Orders.reduce(
  //       (sum, order) => sum + (order.totalCases || order.netCases || 0),
  //       0,
  //     );

  //     avgOrderValue = totalValue / pc;
  //     avgOrderQty = totalCasesSold / pc;
  //     avgLPC = totalCasesSold / pc;
  //   }

  //   // Get last order date
  //   const lastOrder = await this.saleModel
  //     .findOne({ customerId, status: 'COMPLETED', isDeleted: false })
  //     .sort({ date: -1 })
  //     .lean();

  //   // Get last visit date from visits collection (assuming you have a visit model)
  //   const lastVisit = await this.shopVisitModel
  //     .findOne({ customerId, status: 'COMPLETED' })
  //     .sort({ checkInTime: -1 })
  //     .lean();

  //   // Prepare summary data
  //   const summary = {
  //     mtd: {
  //       orderValue: mtdOrders[0]?.mtdOrderValue || 0,
  //       orderQuantity: mtdOrders[0]?.mtdTotalCases || 0,
  //       orderCount: mtdOrders[0]?.mtdOrderCount || 0,
  //     },
  //     last5Orders: {
  //       avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
  //       avgOrderQuantity: parseFloat(avgOrderQty.toFixed(2)),
  //       avgLPC: parseFloat(avgLPC.toFixed(2)),
  //       orders: last5Orders.map((order) => ({
  //         saleId: order.saleId,
  //         date: order.date,
  //         totalValue: order.totalValue,
  //         totalCases: order.totalCases,
  //         totalPieces: order.totalPieces,
  //         totalLPC: order.totalLpc || order.totalLPC || 0,
  //       })),
  //     },
  //     lastOrderDate: lastOrder?.date || null,
  //     lastVisitDate: lastVisit?.checkInTime || null,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: CUSTOMER.FETCHED,
  //     data: {
  //       ...doc,
  //       summary,
  //     },
  //   };
  // }

  async findByCustomerId(customerId: string) {
    const doc = await this.findOne({ customerId }, { lean: true });

    if (!doc) {
      throw new NotFoundException(CUSTOMER.NOT_FOUND);
    }

    // MTD Date Range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // MTD Summary
    // const mtdSummary: any[] = await this.saleModel.aggregate([
    //   {
    //     $match: {
    //       customerId,
    //       status: 'COMPLETED',
    //       isDeleted: false,
    //       date: {
    //         $gte: startOfMonth,
    //         $lte: now,
    //       },
    //     },
    //   },
    //   {
    //     $group: {
    //       _id: null,
    //       orderValue: {
    //         $sum: {
    //           $ifNull: ['$totalValue', 0],
    //         },
    //       },
    //       orderQuantity: {
    //         $sum: {
    //           $ifNull: ['$netCases', 0],
    //         },
    //       },
    //       orderCount: {
    //         $sum: 1,
    //       },
    //       totalLPC: {
    //         $sum: {
    //           $size: {
    //             $ifNull: ['$items', []],
    //           },
    //         },
    //       },
    //     },
    //   },
    // ]);

    const mtdSummary = await this.saleModel.aggregate([
      {
        $match: {
          customerId,
          status: 'COMPLETED',
          isDeleted: false,
          date: {
            $gte: startOfMonth,
            $lte: now,
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
        $project: {
          totalValue: 1,
          netCases: 1,
          lpc: {
            $size: '$items',
          },
        },
      },
      {
        $group: {
          _id: null,
          orderValue: { $sum: '$totalValue' },
          orderQuantity: { $sum: '$netCases' },
          orderCount: { $sum: 1 },
          totalLPC: { $sum: '$lpc' },
        },
      },
    ]);

    const mtd = mtdSummary[0] || {};

    const orderValue = mtd.orderValue || 0;
    const orderQuantity = mtd.orderQuantity || 0;
    const orderCount = mtd.orderCount || 0;
    const totalLPC = mtd.totalLPC || 0;

    // Last Order Date
    const lastOrder = await this.saleModel
      .findOne({
        customerId,
        status: 'COMPLETED',
        isDeleted: false,
      })
      .sort({ date: -1 })
      .lean();

    // Last Visit Date
    const lastVisit = await this.shopVisitModel
      .findOne({
        customerId,
        status: 'COMPLETED',
      })
      .sort({ checkInTime: -1 })
      .lean();

    const summary = {
      mtd: {
        orderValue,
        orderQuantity,
        orderCount,

        avgOrderValue:
          orderCount > 0 ? parseFloat((orderValue / orderCount).toFixed(2)) : 0,

        avgOrderQuantity:
          orderCount > 0
            ? parseFloat((orderQuantity / orderCount).toFixed(2))
            : 0,

        avgLPC:
          orderCount > 0 ? parseFloat((totalLPC / orderCount).toFixed(2)) : 0,
      },

      lastOrderDate: lastOrder?.date || null,
      lastVisitDate: lastVisit?.checkInTime || null,
    };

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.FETCHED,
      data: {
        ...doc,
        summary,
      },
    };
  }

  async update(customerId: string, dto: UpdateCustomerDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ customerId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(CUSTOMER.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: CUSTOMER.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(customerId: string) {
    const existing = await this.findOne({ customerId });

    if (!existing) throw new NotFoundException(CUSTOMER.NOT_FOUND);

    await this.softDelete({ customerId });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.DELETED,
      data: existing,
    };
  }

  // async importFromExcel(filePath: string) {
  //   const errors: any[] = [];

  //   const stats = {
  //     countries: 0,
  //     provinces: 0,
  //     markets: 0,
  //     customers: 0,
  //     routes: 0,
  //     vans: 0,
  //     mappings: 0,
  //   };

  //   try {
  //     return await this.withTransaction(async (session) => {
  //       console.log('🚀 ================= IMPORT STARTED =================');

  //       /* ======================================================
  //        * EXCEL READ
  //        * ====================================================== */

  //       console.log(`📄 Reading Excel File: ${filePath}`);

  //       const workbook = XLSX.readFile(filePath);

  //       const sheet = workbook.Sheets[workbook.SheetNames[0]];

  //       const rows: any[] = XLSX.utils.sheet_to_json(sheet);

  //       console.log(`✅ Total Rows Found: ${rows.length}`);

  //       /* ======================================================
  //        * COLUMN MAPPING
  //        * ====================================================== */

  //       const COLUMN = {
  //         COUNTRY: 'Country',

  //         STATE: 'State',

  //         MARKET: 'Market',

  //         VAN_ID: 'Van Id',

  //         VAN_NAME: 'Van Name',

  //         BEAT_NAME: 'Beats',

  //         BEAT_ERP_ID: 'BeatERPId',

  //         OUTLET_ERP_ID: 'Outlet Erp Id',

  //         OUTLET_NAME: 'Outlets Name',

  //         OWNER_NAME: 'Owners Name',

  //         OWNER_NUMBER: 'Owners Number',

  //         LATITUDE: 'Latitude',

  //         LONGITUDE: 'Longitude',

  //         FORMATTED_ADDRESS: 'Formatted Address',

  //         ADDRESS: 'Address',

  //         SEGMENTATION: 'Segmentation',
  //       };

  //       /* ======================================================
  //        * MAPS
  //        * ====================================================== */

  //       const countryMap = new Map();

  //       const provinceMap = new Map();

  //       const marketMap = new Map();

  //       const customerMap = new Map();

  //       const routeMap = new Map();

  //       const vanMap = new Map();

  //       /* ======================================================
  //        * COUNTRY
  //        * ====================================================== */

  //       console.log(
  //         '🌍 ================= IMPORTING COUNTRIES =================',
  //       );

  //       for (const row of rows) {
  //         try {
  //           const countryName = row[COLUMN.COUNTRY]?.trim();

  //           if (!countryName) continue;

  //           if (countryMap.has(countryName)) continue;

  //           let country = await this.countryModel
  //             .findOne({
  //               name: countryName,
  //             })
  //             .lean();

  //           if (!country) {
  //             country = await this.countryModel.create({
  //               countryId: IdGenerator.generate('COUNTRY', 6),

  //               name: countryName,
  //             });

  //             stats.countries++;

  //             console.log(`✅ COUNTRY CREATED: ${countryName}`);
  //           } else {
  //             console.log(`♻️ COUNTRY EXISTS: ${countryName}`);
  //           }

  //           countryMap.set(countryName, country.countryId);
  //         } catch (error: any) {
  //           console.log(`❌ COUNTRY ERROR`, error.message);

  //           errors.push({
  //             type: 'COUNTRY',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * PROVINCE
  //        * ====================================================== */

  //       console.log(
  //         '🏛 ================= IMPORTING PROVINCES =================',
  //       );

  //       for (const row of rows) {
  //         try {
  //           const countryName = row[COLUMN.COUNTRY]?.trim();

  //           const provinceName = row[COLUMN.STATE]?.trim();

  //           if (!countryName || !provinceName) continue;

  //           const countryId = countryMap.get(countryName);

  //           const provinceKey = `${countryId}_${provinceName}`;

  //           if (provinceMap.has(provinceKey)) continue;

  //           let province = await this.provinceModel
  //             .findOne({
  //               countryId,
  //               name: provinceName,
  //             })
  //             .lean();

  //           if (!province) {
  //             province = await this.provinceModel.create({
  //               provinceId: IdGenerator.generate('PROV', 6),

  //               countryId,

  //               name: provinceName,
  //             });

  //             stats.provinces++;

  //             console.log(`✅ PROVINCE CREATED: ${provinceName}`);
  //           } else {
  //             console.log(`♻️ PROVINCE EXISTS: ${provinceName}`);
  //           }

  //           provinceMap.set(provinceKey, province.provinceId);
  //         } catch (error: any) {
  //           console.log(`❌ PROVINCE ERROR`, error.message);

  //           errors.push({
  //             type: 'PROVINCE',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * MARKET
  //        * ====================================================== */

  //       console.log('🏪 ================= IMPORTING MARKETS =================');

  //       for (const row of rows) {
  //         try {
  //           const countryName = row[COLUMN.COUNTRY]?.trim();

  //           const provinceName = row[COLUMN.STATE]?.trim();

  //           const marketName = row[COLUMN.MARKET]?.trim();

  //           if (!countryName || !provinceName || !marketName) continue;

  //           const countryId = countryMap.get(countryName);

  //           const provinceKey = `${countryId}_${provinceName}`;

  //           const provinceId = provinceMap.get(provinceKey);

  //           const marketKey = `${provinceId}_${marketName}`;

  //           if (marketMap.has(marketKey)) continue;

  //           let market = await this.marketModel
  //             .findOne({
  //               name: marketName,
  //             })
  //             .lean();

  //           if (!market) {
  //             market = await this.marketModel.create({
  //               marketId: IdGenerator.generate('MARKET', 6),

  //               name: marketName,
  //             });

  //             stats.markets++;

  //             console.log(`✅ MARKET CREATED: ${marketName}`);
  //           } else {
  //             console.log(`♻️ MARKET EXISTS: ${marketName}`);
  //           }

  //           marketMap.set(marketKey, market.marketId);
  //         } catch (error: any) {
  //           console.log(`❌ MARKET ERROR`, error.message);

  //           errors.push({
  //             type: 'MARKET',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * CUSTOMER
  //        * ====================================================== */

  //       console.log(
  //         '👥 ================= IMPORTING CUSTOMERS =================',
  //       );

  //       for (const row of rows) {
  //         try {
  //           const outletErpId = row[COLUMN.OUTLET_ERP_ID];

  //           if (!outletErpId) continue;

  //           if (customerMap.has(outletErpId)) continue;

  //           const countryName = row[COLUMN.COUNTRY]?.trim();

  //           const provinceName = row[COLUMN.STATE]?.trim();

  //           const marketName = row[COLUMN.MARKET]?.trim();

  //           const countryId = countryMap.get(countryName);

  //           const provinceKey = `${countryId}_${provinceName}`;

  //           const provinceId = provinceMap.get(provinceKey);

  //           const marketKey = `${provinceId}_${marketName}`;

  //           const marketId = marketMap.get(marketKey);

  //           let customer = await this.findOne(
  //             {
  //               phoneNumber: String(row[COLUMN.OWNER_NUMBER] || ''),
  //             },
  //             {
  //               session,
  //               includeDeleted: true,
  //             },
  //           );

  //           if (!customer) {
  //             const doc = await this.save(
  //               {
  //                 customerId: IdGenerator.generate('CUST', 8),

  //                 name: row[COLUMN.OUTLET_NAME] || 'Unknown',

  //                 ownerName: row[COLUMN.OWNER_NAME] || 'Unknown',

  //                 phoneNumber: String(row[COLUMN.OWNER_NUMBER] || '0000000000'),

  //                 segmentation: row[COLUMN.SEGMENTATION] || 'General',

  //                 customerCategoryId: 'DEFAULT_CATEGORY',

  //                 channelId: 'DEFAULT_CHANNEL',

  //                 customerTypeId: 'DEFAULT_TYPE',

  //                 marketId,

  //                 provinceId,

  //                 countryId,

  //                 address: {
  //                   line1:
  //                     row[COLUMN.FORMATTED_ADDRESS] ||
  //                     row[COLUMN.ADDRESS] ||
  //                     'NA',
  //                 },

  //                 geoTag:
  //                   row[COLUMN.LATITUDE] && row[COLUMN.LONGITUDE]
  //                     ? {
  //                         lat: Number(row[COLUMN.LATITUDE]),

  //                         lng: Number(row[COLUMN.LONGITUDE]),
  //                       }
  //                     : (null as any),
  //               },
  //               { session },
  //             );

  //             customerMap.set(outletErpId, doc.customerId);

  //             stats.customers++;

  //             console.log(`✅ CUSTOMER CREATED: ${doc.name}`);
  //           } else {
  //             console.log(`♻️ CUSTOMER EXISTS: ${row[COLUMN.OUTLET_NAME]}`);
  //           }
  //         } catch (error: any) {
  //           console.log(`❌ CUSTOMER ERROR`, error.message);

  //           errors.push({
  //             type: 'CUSTOMER',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * ROUTE
  //        * ====================================================== */

  //       console.log('🛣 ================= IMPORTING ROUTES =================');

  //       for (const row of rows) {
  //         try {
  //           const beatErpId = row[COLUMN.BEAT_ERP_ID];

  //           if (!beatErpId) continue;

  //           if (routeMap.has(beatErpId)) continue;

  //           const countryName = row[COLUMN.COUNTRY]?.trim();

  //           const provinceName = row[COLUMN.STATE]?.trim();

  //           const marketName = row[COLUMN.MARKET]?.trim();

  //           const countryId = countryMap.get(countryName);

  //           const provinceKey = `${countryId}_${provinceName}`;

  //           const provinceId = provinceMap.get(provinceKey);

  //           const marketKey = `${provinceId}_${marketName}`;

  //           const marketId = marketMap.get(marketKey);

  //           let route = await this.routeModel
  //             .findOne({
  //               beatErpId,
  //             })
  //             .lean();

  //           if (!route) {
  //             route = await this.routeModel.create({
  //               routeId: IdGenerator.generate('ROUTE', 8),

  //               name: row[COLUMN.BEAT_NAME] || beatErpId,

  //               beatId: beatErpId,

  //               beatErpId,

  //               countryId,

  //               provinceId,

  //               marketId,
  //             });

  //             stats.routes++;

  //             console.log(`✅ ROUTE CREATED: ${route.name}`);
  //           } else {
  //             console.log(`♻️ ROUTE EXISTS: ${route.name}`);
  //           }

  //           routeMap.set(beatErpId, route.routeId);
  //         } catch (error: any) {
  //           console.log(`❌ ROUTE ERROR`, error.message);

  //           errors.push({
  //             type: 'ROUTE',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * VAN
  //        * ====================================================== */

  //       console.log('🚚 ================= IMPORTING VANS =================');

  //       for (const row of rows) {
  //         try {
  //           const vanNumber = row[COLUMN.VAN_ID];

  //           const vanName = row[COLUMN.VAN_NAME];

  //           if (!vanNumber) continue;

  //           if (vanMap.has(vanNumber)) continue;

  //           const beatErpId = row[COLUMN.BEAT_ERP_ID];

  //           const routeId = routeMap.get(beatErpId);

  //           let van = await this.vanModel
  //             .findOne({
  //               vanNumber,
  //             })
  //             .lean();

  //           if (!van) {
  //             van = await this.vanModel.create({
  //               vanId: IdGenerator.generate('VAN', 8),

  //               name: vanName || vanNumber,

  //               vanNumber,

  //               associatedUsers: [],

  //               associatedRoutes: routeId
  //                 ? [
  //                     {
  //                       routeId,

  //                       fromDate: new Date(),

  //                       toDate: new Date('2099-12-31'),
  //                     },
  //                   ]
  //                 : [],
  //             });

  //             stats.vans++;

  //             console.log(`✅ VAN CREATED: ${van.name}`);
  //           } else {
  //             console.log(`♻️ VAN EXISTS: ${van.name}`);

  //             if (routeId) {
  //               const alreadyAssigned = van.associatedRoutes?.some(
  //                 (x: any) => x.routeId === routeId,
  //               );

  //               if (!alreadyAssigned) {
  //                 await this.vanModel.updateOne(
  //                   {
  //                     vanId: van.vanId,
  //                   },
  //                   {
  //                     $push: {
  //                       associatedRoutes: {
  //                         routeId,

  //                         fromDate: new Date(),

  //                         toDate: new Date('2099-12-31'),
  //                       },
  //                     },
  //                   },
  //                 );

  //                 console.log(`🔗 ROUTE ATTACHED TO VAN`);
  //               }
  //             }
  //           }

  //           vanMap.set(vanNumber, van.vanId);
  //         } catch (error: any) {
  //           console.log(`❌ VAN ERROR`, error.message);

  //           errors.push({
  //             type: 'VAN',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * ROUTE CUSTOMER MAPPING
  //        * ====================================================== */

  //       console.log(
  //         '🔗 ================= IMPORTING MAPPINGS =================',
  //       );

  //       let sequence = 1;

  //       for (const row of rows) {
  //         try {
  //           const beatErpId = row[COLUMN.BEAT_ERP_ID];

  //           const outletErpId = row[COLUMN.OUTLET_ERP_ID];

  //           if (!beatErpId || !outletErpId) continue;

  //           const routeId = routeMap.get(beatErpId);

  //           const customerId = customerMap.get(outletErpId);

  //           if (!routeId || !customerId) continue;

  //           const existing = await this.routeCustomerMappingModel
  //             .findOne({
  //               routeId,
  //               customerId,
  //             })
  //             .lean();

  //           if (existing) {
  //             console.log(`♻️ MAPPING EXISTS`);

  //             continue;
  //           }

  //           await this.routeCustomerMappingService.create(
  //             {
  //               routeId,

  //               customerId,

  //               sequence: sequence++,

  //               day: Days.MON,
  //             },
  //             session,
  //           );

  //           stats.mappings++;

  //           console.log(`✅ MAPPING CREATED`);
  //         } catch (error: any) {
  //           console.log(`❌ MAPPING ERROR`, error.message);

  //           errors.push({
  //             type: 'MAPPING',
  //             error: error.message,
  //           });
  //         }
  //       }

  //       /* ======================================================
  //        * FINAL LOGS
  //        * ====================================================== */

  //       console.log('🎉 ================= IMPORT COMPLETED =================');

  //       console.log(`🌍 Countries Created: ${stats.countries}`);

  //       console.log(`🏛 Provinces Created: ${stats.provinces}`);

  //       console.log(`🏪 Markets Created: ${stats.markets}`);

  //       console.log(`👥 Customers Created: ${stats.customers}`);

  //       console.log(`🛣 Routes Created: ${stats.routes}`);

  //       console.log(`🚚 Vans Created: ${stats.vans}`);

  //       console.log(`🔗 Mappings Created: ${stats.mappings}`);

  //       console.log(`❌ Total Errors: ${errors.length}`);

  //       return {
  //         statusCode: HttpStatus.OK,

  //         message: 'IMPORT COMPLETED',

  //         data: stats,

  //         errors,
  //       };
  //     });
  //   } catch (error) {
  //     console.log('💥 IMPORT FAILED', error);

  //     throw error;
  //   }
  // }

  async importFromExcel(filePath: string) {
    const errors: any[] = [];

    const stats = {
      countries: 0,
      provinces: 0,
      markets: 0,
      customers: 0,
      routes: 0,
      vans: 0,
      mappings: 0,
    };

    try {
      return await this.withTransaction(async (session) => {
        console.log('🚀 ================= IMPORT STARTED =================');

        /* ======================================================
         * EXCEL READ
         * ====================================================== */

        console.log(`📄 Reading Excel File: ${filePath}`);

        const workbook = XLSX.readFile(filePath);

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows: any[] = XLSX.utils.sheet_to_json(sheet);

        console.log(`✅ Total Rows Found: ${rows.length}`);

        /* ======================================================
         * COLUMN MAPPING
         * ====================================================== */

        const COLUMN = {
          COUNTRY: 'Country',

          STATE: 'State',

          MARKET: 'Market',

          VAN_ID: 'Van Id',

          VAN_NAME: 'Van Name',

          BEAT_NAME: 'Beats',

          BEAT_ERP_ID: 'BeatERPId',

          OUTLET_ERP_ID: 'Outlet Erp Id',

          OUTLET_NAME: 'Outlets Name',

          OWNER_NAME: 'Owners Name',

          OWNER_NUMBER: 'Owners Number',

          LATITUDE: 'Latitude',

          LONGITUDE: 'Longitude',

          FORMATTED_ADDRESS: 'Formatted Address',

          ADDRESS: 'Address',

          SEGMENTATION: 'Segmentation',
        };

        /* ======================================================
         * MAPS
         * ====================================================== */

        const countryMap = new Map();

        const provinceMap = new Map();

        const marketMap = new Map();

        const customerMap = new Map();

        const routeMap = new Map();

        const vanMap = new Map();

        /* ======================================================
         * COUNTRY
         * ====================================================== */

        console.log(
          '🌍 ================= IMPORTING COUNTRIES =================',
        );

        for (const row of rows) {
          try {
            const countryName = row[COLUMN.COUNTRY]?.trim();

            if (!countryName) continue;

            if (countryMap.has(countryName)) continue;

            let country = await this.countryModel
              .findOne({
                name: countryName,
              })
              .lean();

            if (!country) {
              country = await this.countryModel.create({
                countryId: IdGenerator.generate('COUNTRY', 6),

                name: countryName,
              });

              stats.countries++;

              console.log(`✅ COUNTRY CREATED: ${countryName}`);
            } else {
              console.log(`♻️ COUNTRY EXISTS: ${countryName}`);
            }

            countryMap.set(countryName, country.countryId);
          } catch (error: any) {
            console.log(`❌ COUNTRY ERROR`, error.message);

            errors.push({
              type: 'COUNTRY',
              error: error.message,
            });
          }
        }

        /* ======================================================
         * PROVINCE
         * ====================================================== */

        console.log(
          '🏛 ================= IMPORTING PROVINCES =================',
        );

        for (const row of rows) {
          try {
            const countryName = row[COLUMN.COUNTRY]?.trim();

            const provinceName = row[COLUMN.STATE]?.trim();

            if (!countryName || !provinceName) continue;

            const countryId = countryMap.get(countryName);

            const provinceKey = `${countryId}_${provinceName}`;

            if (provinceMap.has(provinceKey)) continue;

            let province = await this.provinceModel
              .findOne({
                countryId,
                name: provinceName,
              })
              .lean();

            if (!province) {
              province = await this.provinceModel.create({
                provinceId: IdGenerator.generate('PROV', 6),

                countryId,

                name: provinceName,
              });

              stats.provinces++;

              console.log(`✅ PROVINCE CREATED: ${provinceName}`);
            } else {
              console.log(`♻️ PROVINCE EXISTS: ${provinceName}`);
            }

            provinceMap.set(provinceKey, province.provinceId);
          } catch (error: any) {
            console.log(`❌ PROVINCE ERROR`, error.message);

            errors.push({
              type: 'PROVINCE',
              error: error.message,
            });
          }
        }

        /* ======================================================
         * MARKET
         * ====================================================== */

        console.log('🏪 ================= IMPORTING MARKETS =================');

        for (const row of rows) {
          try {
            const countryName = row[COLUMN.COUNTRY]?.trim();

            const provinceName = row[COLUMN.STATE]?.trim();

            const marketName = row[COLUMN.MARKET]?.trim();

            if (!countryName || !provinceName || !marketName) continue;

            const countryId = countryMap.get(countryName);

            const provinceKey = `${countryId}_${provinceName}`;

            const provinceId = provinceMap.get(provinceKey);

            const marketKey = `${provinceId}_${marketName}`;

            if (marketMap.has(marketKey)) continue;

            let market = await this.marketModel
              .findOne({
                name: marketName,
              })
              .lean();

            if (!market) {
              market = await this.marketModel.create({
                marketId: IdGenerator.generate('MARKET', 6),

                name: marketName,
              });

              stats.markets++;

              console.log(`✅ MARKET CREATED: ${marketName}`);
            } else {
              console.log(`♻️ MARKET EXISTS: ${marketName}`);
            }

            marketMap.set(marketKey, market.marketId);
          } catch (error: any) {
            console.log(`❌ MARKET ERROR`, error.message);

            errors.push({
              type: 'MARKET',
              error: error.message,
            });
          }
        }

        /* ======================================================
         * CUSTOMER
         * ====================================================== */

        /* ======================================================
         * CUSTOMER
         * ====================================================== */

        console.log(
          '👥 ================= IMPORTING CUSTOMERS =================',
        );

        for (const row of rows) {
          try {
            const outletErpId = row[COLUMN.OUTLET_ERP_ID];

            if (!outletErpId) continue;

            const countryName = row[COLUMN.COUNTRY]?.trim();

            const provinceName = row[COLUMN.STATE]?.trim();

            const marketName = row[COLUMN.MARKET]?.trim();

            const countryId = countryMap.get(countryName);

            const provinceKey = `${countryId}_${provinceName}`;

            const provinceId = provinceMap.get(provinceKey);

            const marketKey = `${provinceId}_${marketName}`;

            const marketId = marketMap.get(marketKey);

            let customerName = row[COLUMN.OUTLET_NAME] || 'Unknown';

            const phoneNumber = String(
              row[COLUMN.OWNER_NUMBER] || '0000000000',
            );

            /* ======================================================
             * FIND CUSTOMER BY PHONE
             * ====================================================== */

            let customer = await this.findOne({
              phoneNumber,
            });

            /* ======================================================
             * FIND DUPLICATES BY NAME
             * ====================================================== */

            const duplicateCustomers = await this.find({
              name: customerName,
            });

            /* ======================================================
             * REMOVE DUPLICATES
             * ====================================================== */

            if (duplicateCustomers.length > 1) {
              console.log(`⚠️ DUPLICATE CUSTOMER FOUND: ${customerName}`);

              const primaryCustomer = duplicateCustomers[0];

              const duplicateList = duplicateCustomers.slice(1);

              for (const duplicate of duplicateList) {
                console.log(
                  `🗑 REMOVING DUPLICATE CUSTOMER: ${duplicate.customerId}`,
                );

                /* ======================================================
                 * UPDATE ROUTE MAPPINGS
                 * ====================================================== */

                await this.routeCustomerMappingModel.updateMany(
                  {
                    customerId: duplicate.customerId,
                  },
                  {
                    $set: {
                      customerId: primaryCustomer.customerId,
                    },
                  },
                  { session },
                );

                console.log(`🔄 ROUTE MAPPINGS UPDATED`);

                /* ======================================================
                 * DELETE DUPLICATE CUSTOMER
                 * ====================================================== */

                await this.delete(duplicate.customerId);

                console.log(`✅ DUPLICATE CUSTOMER REMOVED`);
              }

              customer = primaryCustomer;
            }

            /* ======================================================
             * CREATE CUSTOMER
             * ====================================================== */

            if (!customer) {
              /* ======================================================
               * ENSURE UNIQUE NAME
               * ====================================================== */

              const existingByName = await this.findOne({
                name: customerName,
              });
              if (existingByName) {
                customerName = `${customerName}_${outletErpId}`;

                console.log(`♻️ CUSTOMER NAME UPDATED: ${customerName}`);
              }

              customer = await this.save({
                customerId: IdGenerator.generateRandomNumber(12),

                name: customerName,

                ownerName: row[COLUMN.OWNER_NAME] || 'Unknown',

                phoneNumber,

                segmentation: row[COLUMN.SEGMENTATION] || 'General',

                customerCategoryId: 'DEFAULT_CATEGORY',

                channelId: 'DEFAULT_CHANNEL',

                customerTypeId: 'DEFAULT_TYPE',

                marketId,

                provinceId,

                countryId,

                address: {
                  line1:
                    row[COLUMN.FORMATTED_ADDRESS] ||
                    row[COLUMN.ADDRESS] ||
                    'NA',
                },

                geoTag:
                  row[COLUMN.LATITUDE] && row[COLUMN.LONGITUDE]
                    ? {
                        lat: Number(row[COLUMN.LATITUDE]),

                        lng: Number(row[COLUMN.LONGITUDE]),
                      }
                    : (null as any),
              });

              stats.customers++;

              console.log(`✅ CUSTOMER CREATED: ${customer.name}`);
            } else {
              console.log(`♻️ CUSTOMER EXISTS: ${customer.name}`);
            }

            customerMap.set(outletErpId, customer.customerId);
          } catch (error: any) {
            console.log(`❌ CUSTOMER ERROR`, error.message);

            errors.push({
              type: 'CUSTOMER',
              error: error.message,
            });
          }
        }

        /* ======================================================
         * ROUTE
         * ====================================================== */

        console.log('🛣 ================= IMPORTING ROUTES =================');

        for (const row of rows) {
          try {
            const beatErpId = row[COLUMN.BEAT_ERP_ID];

            if (!beatErpId) continue;
            const routeName = row[COLUMN.BEAT_NAME] || beatErpId;

            const countryName = row[COLUMN.COUNTRY]?.trim();

            const provinceName = row[COLUMN.STATE]?.trim();

            const marketName = row[COLUMN.MARKET]?.trim();

            const countryId = countryMap.get(countryName);

            const provinceKey = `${countryId}_${provinceName}`;

            const provinceId = provinceMap.get(provinceKey);

            const marketKey = `${provinceId}_${marketName}`;

            const marketId = marketMap.get(marketKey);

            let route: any = await this.routeModel
              .findOne({
                name: routeName,
                marketId,
              })
              .lean();

            if (!route) {
              route = await this.routeModel.create({
                routeId: IdGenerator.generate('ROUTE', 8),

                name: routeName,

                countryId,

                provinceId,

                marketId,

                outletCount: 0,
              });

              stats.routes++;

              console.log(`✅ ROUTE CREATED: ${route.name}`);
            } else {
              console.log(`♻️ ROUTE EXISTS: ${route.name}`);
            }

            routeMap.set(beatErpId, route.routeId);
          } catch (error: any) {
            console.log(`❌ ROUTE ERROR`, error.message);

            errors.push({
              type: 'ROUTE',
              error: error.message,
            });
          }
        }

        /* ======================================================
         * VAN
         * ====================================================== */

        console.log('🚚 ================= IMPORTING VANS =================');

        for (const row of rows) {
          try {
            const vanNumber = row[COLUMN.VAN_ID];

            const vanName = row[COLUMN.VAN_NAME];

            if (!vanNumber) continue;

            const beatErpId = row[COLUMN.BEAT_ERP_ID];

            const routeId = routeMap.get(beatErpId);

            let van = await this.vanModel
              .findOne({
                vanNumber,
              })
              .lean();

            if (!van) {
              van = await this.vanModel.create({
                vanId: IdGenerator.generate('VAN', 8),

                name: vanName || vanNumber,

                vanNumber,


                associatedRoutes: [],
              });

              stats.vans++;

              console.log(`✅ VAN CREATED: ${van.name}`);
            } else {
              console.log(`♻️ VAN EXISTS: ${van.name}`);
            }

            if (routeId) {
              const latestVan = await this.vanModel
                .findOne({
                  vanId: van.vanId,
                })
                .lean();

              const alreadyAssigned = latestVan?.associatedRoutes?.some(
                (x: any) => x.routeId === routeId,
              );

              if (!alreadyAssigned) {
                await this.vanModel.updateOne(
                  {
                    vanId: van.vanId,
                  },
                  {
                    $push: {
                      associatedRoutes: {
                        routeId,

                        fromDate: new Date(),

                        toDate: new Date('2099-12-31'),
                      },
                    },
                  },
                );

                console.log(`🔗 ROUTE ${routeId} ATTACHED TO VAN ${vanNumber}`);
              } else {
                console.log(`♻️ ROUTE ALREADY ATTACHED TO VAN ${vanNumber}`);
              }
            }

            vanMap.set(vanNumber, van.vanId);
          } catch (error: any) {
            console.log(`❌ VAN ERROR`, error.message);

            errors.push({
              type: 'VAN',
              error: error.message,
            });
          }
        }

        /* ======================================================
         * ROUTE CUSTOMER MAPPING
         * ====================================================== */

        console.log(
          '🔗 ================= IMPORTING MAPPINGS =================',
        );

        let sequence = 1;

        for (const row of rows) {
          try {
            const beatErpId = row[COLUMN.BEAT_ERP_ID];

            const outletErpId = row[COLUMN.OUTLET_ERP_ID];

            if (!beatErpId || !outletErpId) continue;

            const routeId = routeMap.get(beatErpId);

            const customerId = customerMap.get(outletErpId);

            if (!routeId || !customerId) continue;

            const existing = await this.routeCustomerMappingModel
              .findOne({
                routeId,
                customerId,
              })
              .lean();

            if (existing) {
              console.log(`♻️ MAPPING EXISTS`);

              const totalMappings =
                await this.routeCustomerMappingModel.countDocuments({
                  routeId,
                });

              await this.routeModel.updateOne(
                {
                  routeId,
                },
                {
                  $set: {
                    outletCount: totalMappings,
                  },
                },
                { session },
              );

              console.log(`🔄 ROUTE OUTLET COUNT UPDATED: ${totalMappings}`);

              continue;
            }

            await this.routeCustomerMappingService.create(
              {
                routeId,

                customerId,

                sequence: sequence++,
              },
              session,
            );

            stats.mappings++;

            console.log(`✅ MAPPING CREATED`);

            const totalMappings =
              await this.routeCustomerMappingModel.countDocuments({
                routeId,
              });

            await this.routeModel.updateOne(
              {
                routeId,
              },
              {
                $set: {
                  outletCount: totalMappings,
                },
              },
              { session },
            );

            console.log(`🔄 ROUTE OUTLET COUNT UPDATED: ${totalMappings}`);
          } catch (error: any) {
            console.log(`❌ MAPPING ERROR`, error.message);

            errors.push({
              type: 'MAPPING',
              error: error.message,
            });
          }
        }

        console.log('🎉 ================= IMPORT COMPLETED =================');

        console.log(`🌍 Countries Created: ${stats.countries}`);

        console.log(`🏛 Provinces Created: ${stats.provinces}`);

        console.log(`🏪 Markets Created: ${stats.markets}`);

        console.log(`👥 Customers Created: ${stats.customers}`);

        console.log(`🛣 Routes Created: ${stats.routes}`);

        console.log(`🚚 Vans Created: ${stats.vans}`);

        console.log(`🔗 Mappings Created: ${stats.mappings}`);

        console.log(`❌ Total Errors: ${errors.length}`);

        return {
          statusCode: HttpStatus.OK,

          message: 'IMPORT COMPLETED',

          data: stats,

          errors,
        };
      });
    } catch (error) {
      console.log('💥 IMPORT FAILED', error);

      throw error;
    }
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CUSTOMER.DUPLICATE);
    }
    throw error;
  }
}
