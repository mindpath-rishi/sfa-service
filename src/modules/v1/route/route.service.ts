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
  Route,
  RouteSchema,
} from 'src/core/database/mongo/schema/route.schema';

import { ROUTE } from './route.constants';
import { CreateRouteDto, RouteCustomerDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { RouteCustomerQueryDto, RouteQueryDto } from './dto/route-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';
import { RouteCustomerMappingService } from '../route-customer-mapping/route-customer-mapping.service';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';
import { CustomerService } from '../customer/customer.service';
import { CustomerQueryDto } from '../customer/dto/customer-query.dto';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { ShopVisitService } from '../shop-visit/shop-visit.service';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';
import { SaleStatus } from 'src/shared/enums/sale.enums';
import * as XLSX from 'xlsx';
import { ClientSession } from 'mongoose';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

@Injectable()
export class RouteService extends MongoRepository<Route> {
  constructor(
    mongo: MongoService,
    private readonly routeCustomerMappingService: RouteCustomerMappingService,
    private readonly customerService: CustomerService,
    private readonly shopVisitService: ShopVisitService,
  ) {
    super(mongo.getModel(Route.name, RouteSchema));
  }

  private buildRouteFilter(query: RouteQueryDto) {
    const filter: FilterQuery<Route> = {};

    if (query.routeId) filter.routeId = query.routeId;
    if (query.name) filter.name = new RegExp(query.name, 'i') as any;
    if (query.countryId) filter.countryId = query.countryId;
    if (query.provinceId) filter.provinceId = query.provinceId;
    if (query.marketId) filter.marketId = query.marketId;
    if (query.customerCategoryId)
      filter.customerCategoryId = query.customerCategoryId;
    if (query.status) filter.status = query.status;

    if (query.searchText) {
      const regex = new RegExp(query.searchText, 'i');
      filter.$or = [
        { routeId: regex },
        { name: regex },
        { countryId: regex },
        { provinceId: regex },
        { marketId: regex },
        { customerCategoryId: regex },
      ];
    }

    return filter;
  }

  private getSort(query: RouteQueryDto) {
    const sortFieldMap: Record<string, string> = {
      primary: 'name',
      secondary: 'marketId',
      owner: 'customerCategoryId',
      metric: 'outletCount',
      routeId: 'routeId',
      name: 'name',
      countryId: 'countryId',
      provinceId: 'provinceId',
      marketId: 'marketId',
      customerCategoryId: 'customerCategoryId',
      outletCount: 'outletCount',
      status: 'status',
      createdAt: 'createdAt',
    };
    const sortField = sortFieldMap[query.sortBy || 'createdAt'] || 'createdAt';
    const sortDirection: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;

    return { [sortField]: sortDirection };
  }

  private getExportColumns(columns?: string) {
    const definitions = [
      { key: 'primary', title: 'Route' },
      { key: 'routeId', title: 'Route ID' },
      { key: 'secondary', title: 'Market' },
      { key: 'owner', title: 'Customer Category' },
      { key: 'outletCount', title: 'Outlet Count' },
      { key: 'countryId', title: 'Country' },
      { key: 'provinceId', title: 'Province' },
      { key: 'marketId', title: 'Market' },
      { key: 'customerCategoryId', title: 'Customer Category' },
      { key: 'customers', title: 'Mapped Outlets' },
      { key: 'status', title: 'Status' },
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

  private escapePdfText(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private async syncRouteCustomers(
    routeId: string,
    nextCustomers: RouteCustomerDto[] = [],
    session?: ClientSession,
  ) {
    const nextByCustomerId = new Map(
      nextCustomers
        .filter((customer) => customer.customerId)
        .map((customer, index) => [
          customer.customerId,
          customer.sequence ?? index + 1,
        ]),
    );
    const nextIds = [...nextByCustomerId.keys()];
    const activeMappings = await this.routeCustomerMappingService.find(
      {
        status: RouteCustomerMappingStatus.ACTIVE,
        ...(nextIds.length ? { customerId: { $in: nextIds } } : { routeId }),
      } as any,
      { session },
    );

    const conflictingMapping = activeMappings.find(
      (mapping: any) =>
        nextByCustomerId.has(mapping.customerId) && mapping.routeId !== routeId,
    );

    if (conflictingMapping) {
      throw new ConflictException(
        `Outlet ${conflictingMapping.customerId} is already mapped to route ${conflictingMapping.routeId}`,
      );
    }

    const currentRouteMappings = await this.routeCustomerMappingService.find(
      { routeId, status: RouteCustomerMappingStatus.ACTIVE } as any,
      { session },
    );
    const currentByCustomerId = new Map(
      currentRouteMappings.map((mapping: any) => [mapping.customerId, mapping]),
    );

    await Promise.all(
      nextIds.map(async (customerId) => {
        const existing = currentByCustomerId.get(customerId) as any;
        const sequence = nextByCustomerId.get(customerId) ?? 1;

        if (existing) {
          await this.routeCustomerMappingService.updateOne(
            { mappingId: existing.mappingId },
            { $set: { sequence, effectiveTo: null } },
            { session },
          );
          return;
        }

        await this.routeCustomerMappingService.create(
          { routeId, customerId, sequence },
          session,
        );
      }),
    );

    await Promise.all(
      currentRouteMappings
        .filter((mapping: any) => !nextByCustomerId.has(mapping.customerId))
        .map((mapping: any) =>
          this.routeCustomerMappingService.updateOne(
            { mappingId: mapping.mappingId },
            {
              $set: {
                status: RouteCustomerMappingStatus.INACTIVE,
                effectiveTo: new Date(),
              },
            },
            { session },
          ),
        ),
    );
  }

  private async getRouteMappings(routeIds: string[], session?: ClientSession) {
    if (!routeIds.length) return [];

    return this.routeCustomerMappingService.find(
      {
        routeId: { $in: routeIds },
        status: RouteCustomerMappingStatus.ACTIVE,
      } as any,
      { session, sort: { sequence: 1 } as any },
    );
  }

  private async attachRouteMappings<T extends Record<string, any>>(
    routes: T[],
    session?: ClientSession,
  ) {
    const routeIds = routes.map((route) => route.routeId).filter(Boolean);
    const mappings = await this.getRouteMappings(routeIds, session);
    const customerIds = [
      ...new Set(
        mappings.map((mapping: any) => mapping.customerId).filter(Boolean),
      ),
    ];
    const customersResult: any = customerIds.length
      ? await this.customerService.findAll({
          customerIds,
          page: 1,
          limit: customerIds.length,
        } as CustomerQueryDto)
      : { data: [] };
    const customerById = new Map(
      (customersResult?.data ?? []).map((customer: any) => [
        customer.customerId,
        customer,
      ]),
    );
    const mappingsByRouteId = new Map<string, any[]>();

    mappings.forEach((mapping: any) => {
      const list = mappingsByRouteId.get(mapping.routeId) ?? [];
      list.push(mapping);
      mappingsByRouteId.set(mapping.routeId, list);
    });

    return routes.map((route) => {
      const routeObject =
        typeof route?.toObject === 'function' ? route.toObject() : route;
      const routeMappings = (mappingsByRouteId.get(routeObject.routeId) ?? [])
        .slice()
        .sort((first, second) => first.sequence - second.sequence);
      const associatedCustomers = routeMappings.map((mapping: any) => ({
        customerId: mapping.customerId,
        sequence: mapping.sequence,
        mappingId: mapping.mappingId,
        customer: customerById.get(mapping.customerId),
      }));

      return {
        ...routeObject,
        outletCount: associatedCustomers.length,
        associatedCustomers,
      };
    });
  }

  private buildPdfBuffer(title: string, rows: string[][]) {
    const [headers = [], ...dataRows] = rows;
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 28;
    const lineHeight = 14;
    const maxLines = 32;
    const formatDate = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: REPORT_TIMEZONE,
    }).format(new Date());
    const lines = [
      title,
      `Generated ${formatDate} - ${dataRows.length} row(s)`,
      headers.join(' | '),
      ...dataRows.map((row) => row.join(' | ')),
    ];
    const pageLines: string[][] = [];

    for (let index = 0; index < lines.length; index += maxLines) {
      pageLines.push(lines.slice(index, index + maxLines));
    }

    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    const fontObjectId = 3;
    let nextObjectId = 4;

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[fontObjectId] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    pageLines.forEach((linesForPage, pageIndex) => {
      const pageObjectId = nextObjectId;
      const contentObjectId = nextObjectId + 1;
      nextObjectId += 2;
      pageObjectIds.push(pageObjectId);

      const commands = linesForPage.map((line, lineIndex) => {
        const value = String(line ?? '')
          .replace(/\s+/g, ' ')
          .slice(0, 160);
        const size = lineIndex === 0 && pageIndex === 0 ? 16 : 8;
        const y = pageHeight - margin - lineIndex * lineHeight;
        return `BT /F1 ${size} Tf ${margin} ${y.toFixed(2)} Td (${this.escapePdfText(value)}) Tj ET`;
      });
      const content = commands.join('\n');

      objects[pageObjectId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
      objects[contentObjectId] =
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    });

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

  async create(payload: CreateRouteDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { associatedCustomers = [], ...routePayload } = payload;

        if (payload.name) {
          routePayload.name = TextNormalizer.normalize(
            routePayload.name,
            NormalizeType.TITLE,
          );
        }
        routePayload.outletCount = associatedCustomers.length;

        const filter: FilterQuery<Route> = { name: routePayload.name };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(ROUTE.DUPLICATE);
        }

        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...routePayload,
              status: 'ACTIVE',
              isDeleted: false,
            },
            { session },
          );
          await this.syncRouteCustomers(
            existing.routeId,
            associatedCustomers,
            session,
          );

          return {
            statusCode: HttpStatus.OK,
            message: ROUTE.CREATED,
            data: { routeId: existing.routeId },
          };
        }

        const doc = await this.save(
          {
            routeId: IdGenerator.generate('ROUT', 8),
            ...routePayload,
          },
          { session },
        );
        await this.syncRouteCustomers(
          doc.routeId,
          associatedCustomers,
          session,
        );
        const [route] = await this.attachRouteMappings([doc], session);

        return {
          statusCode: HttpStatus.CREATED,
          message: ROUTE.CREATED,
          data: route,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: RouteQueryDto) {
    const { page = 1, limit = 20 } = query;

    const result = await this.paginate(this.buildRouteFilter(query), {
      page,
      limit,
      sort: this.getSort(query),
      lean: true,
    });

    const data = await this.attachRouteMappings(result.items as any[]);

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data,
      meta: result.meta,
    };
  }

  async exportRoutes(
    query: RouteQueryDto & { fileType?: 'excel' | 'pdf'; columns?: string },
  ) {
    const columns = this.getExportColumns(query.columns);
    const routes = await this.findLean(this.buildRouteFilter(query), {
      sort: this.getSort(query),
    });
    const routesWithMappings = await this.attachRouteMappings(routes as any[]);
    const exportRows = routesWithMappings.map((route: any) => {
      const customers = Array.isArray(route.associatedCustomers)
        ? route.associatedCustomers
        : [];
      const values: Record<string, string> = {
        primary: route.name || '',
        routeId: route.routeId || '',
        secondary: route.marketId || '',
        owner: route.customerCategoryId || '',
        outletCount:
          route.outletCount !== undefined ? String(route.outletCount) : '',
        countryId: route.countryId || '',
        provinceId: route.provinceId || '',
        marketId: route.marketId || '',
        customerCategoryId: route.customerCategoryId || '',
        customers: customers
          .map((customer: any) =>
            [
              customer.customerId,
              customer.sequence ? `#${customer.sequence}` : '',
            ]
              .filter(Boolean)
              .join(' '),
          )
          .join(', '),
        status: route.status || '',
      };

      return columns.map((column) => values[column.key] ?? '');
    });
    const headerRow = columns.map((column) => column.title);

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildPdfBuffer('Route Listing', [
          headerRow,
          ...exportRows,
        ]),
        fileName: 'route-listing.pdf',
        mimeType: 'application/pdf',
      };
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Routes');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'route-listing.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  // async getRouteCustomers(
  //   routeId: string,
  //   query: RouteCustomerQueryDto & {
  //     routeSessionId?: string;
  //     visitStatus?: 'VISITED' | 'NOT_VISITED';
  //   },
  // ) {
  //   const {
  //     searchText,
  //     page = 1,
  //     limit = 20,
  //     status,
  //     routeSessionId,
  //     visitStatus,
  //   } = query;

  //   /* ======================================================
  //    * 1️⃣ VALIDATE ROUTE
  //    * ====================================================== */
  //   const route = await this.findOne({ routeId });
  //   if (!route) {
  //     return {
  //       statusCode: HttpStatus.NOT_FOUND,
  //       message: ROUTE.NOT_FOUND,
  //       data: [],
  //     };
  //   }

  //   /* ======================================================
  //    * 2️⃣ GET ACTIVE MAPPINGS
  //    * ====================================================== */
  //   const mappingResult = await this.routeCustomerMappingService.findAll({
  //     routeId,
  //     status: RouteCustomerMappingStatus.ACTIVE,
  //   });

  //   const mappings: any[] = mappingResult?.data || [];

  //   if (!mappings.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: ROUTE.FETCHED,
  //       data: [],
  //       meta: { page, limit, total: 0 },
  //     };
  //   }

  //   /* ======================================================
  //    * 3️⃣ EXTRACT CUSTOMER IDS
  //    * ====================================================== */
  //   const customerIds = mappings.map((m) => String(m.customerId));

  //   /* ======================================================
  //    * 4️⃣ FETCH CUSTOMERS
  //    * ====================================================== */
  //   const customerQuery: CustomerQueryDto = {
  //     searchText,
  //     page,
  //     limit,
  //     customerIds,
  //     status: status as CustomerStatus | undefined,
  //   };

  //   const result: any = await this.customerService.findAll(customerQuery);
  //   const customers = result?.data || [];

  //   /* ======================================================
  //    * 5️⃣ SEQUENCE MAP
  //    * ====================================================== */
  //   const sequenceMap = new Map(
  //     mappings.map((m) => [String(m.customerId), m.sequence]),
  //   );

  //   /* ======================================================
  //    * 6️⃣ FETCH SHOP VISITS (IF routeSessionId PROVIDED)
  //    * ====================================================== */
  //   let visitMap = new Map();

  //   if (routeSessionId) {
  //     const visitsResult: any = await this.shopVisitService.findAll({
  //       routeSessionId,
  //       page: 1,
  //       limit: 1000,
  //     });

  //     const visits = visitsResult?.data || [];

  //     // 👉 Keep latest visit per customer
  //     visits.forEach((v: any) => {
  //       const key = String(v.outletId);
  //       const existing = visitMap.get(key);

  //       if (!existing || new Date(v.visitedAt) > new Date(existing.visitedAt)) {
  //         visitMap.set(key, v);
  //       }
  //     });
  //   }

  //   /* ======================================================
  //    * 7️⃣ MERGE CUSTOMER + SEQUENCE + VISIT
  //    * ====================================================== */
  //   let data = (customers || []).map((c) => {
  //     const customer = c?._doc || c;

  //     const visit = visitMap.get(String(customer.customerId));

  //     return {
  //       ...customer,
  //       sequence: sequenceMap.get(String(customer.customerId)) ?? null,

  //       // ✅ Visit Info
  //       isVisited: !!visit,
  //       visitedAt: visit?.visitedAt || null,
  //       visitStatus: visit ? visit.status : 'NOT_VISITED',
  //     };
  //   });

  //   /* ======================================================
  //    * 8️⃣ FILTER BY VISIT STATUS (OPTIONAL)
  //    * ====================================================== */
  //   if (visitStatus === 'VISITED') {
  //     data = data.filter((c) => c.isVisited);
  //   }

  //   if (visitStatus === 'NOT_VISITED') {
  //     data = data.filter((c) => !c.isVisited);
  //   }

  //   /* ======================================================
  //    * 9️⃣ SORT BY SEQUENCE
  //    * ====================================================== */
  //   data.sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999));

  //   /* ======================================================
  //    * 🔟 RESPONSE
  //    * ====================================================== */
  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: ROUTE.FETCHED,
  //     data,
  //     meta: result?.meta || {
  //       page,
  //       limit,
  //       total: data.length,
  //     },
  //   };
  // }

  // async getRouteCustomers(
  //   routeId: string,
  //   query: RouteCustomerQueryDto & {
  //     routeSessionId?: string;
  //     visitStatus?: 'VISITED' | 'NOT_VISITED';
  //   },
  // ) {
  //   const {
  //     searchText,
  //     page = 1,
  //     limit = 20,
  //     status,
  //     routeSessionId,
  //     visitStatus,
  //   } = query;

  //   /* ======================================================
  //    * 1️⃣ VALIDATE ROUTE
  //    * ====================================================== */
  //   const route = await this.model.findOne({ routeId });
  //   if (!route) {
  //     return {
  //       statusCode: HttpStatus.NOT_FOUND,
  //       message: ROUTE.NOT_FOUND,
  //       data: [],
  //     };
  //   }

  //   /* ======================================================
  //    * 2️⃣ PIPELINE
  //    * ====================================================== */
  //   const pipeline: any[] = [
  //     { $match: { routeId } },

  //     /* ---------------- MAPPINGS ---------------- */
  //     {
  //       $lookup: {
  //         from: 'route_customer_mappings',
  //         let: { routeId: '$routeId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   { $eq: ['$routeId', '$$routeId'] },
  //                   { $eq: ['$status', 'ACTIVE'] },
  //                 ],
  //               },
  //             },
  //           },
  //         ],
  //         as: 'mappings',
  //       },
  //     },
  //     { $unwind: '$mappings' },

  //     /* ---------------- CUSTOMER ---------------- */
  //     {
  //       $lookup: {
  //         from: 'customer_master',
  //         localField: 'mappings.customerId',
  //         foreignField: 'customerId',
  //         as: 'customer',
  //       },
  //     },
  //     { $unwind: '$customer' },

  //     /* ---------------- FILTER ---------------- */
  //     {
  //       $match: {
  //         ...(status ? { 'customer.status': status } : {}),
  //         ...(searchText
  //           ? {
  //               $or: [
  //                 { 'customer.name': { $regex: searchText, $options: 'i' } },
  //                 { 'customer.mobile': { $regex: searchText, $options: 'i' } },
  //               ],
  //             }
  //           : {}),
  //       },
  //     },

  //     /* ---------------- VISIT ---------------- */
  //     {
  //       $lookup: {
  //         from: 'shop_visits',
  //         let: { customerId: '$customer.customerId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   { $eq: ['$outletId', '$$customerId'] },
  //                   ...(routeSessionId
  //                     ? [{ $eq: ['$routeSessionId', routeSessionId] }]
  //                     : []),
  //                 ],
  //               },
  //             },
  //           },
  //           { $sort: { visitedAt: -1 } },
  //           { $limit: 1 },
  //         ],
  //         as: 'visit',
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: '$visit',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* ---------------- SALE ---------------- */
  //     {
  //       $lookup: {
  //         from: 'sales',
  //         let: { visitId: '$visit.visitId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $eq: ['$visitId', '$$visitId'],
  //               },
  //             },
  //           },
  //           { $sort: { createdAt: -1 } },
  //           { $limit: 1 },
  //         ],
  //         as: 'sale',
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: '$sale',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* 🔥 NEW: SALE ITEMS LOOKUP */
  //     {
  //       $lookup: {
  //         from: 'sale_items',
  //         let: { saleId: '$sale.saleId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $eq: ['$saleId', '$$saleId'],
  //               },
  //             },
  //           },
  //         ],
  //         as: 'saleItems',
  //       },
  //     },

  //     /* ---------------- NON-SALE ---------------- */
  //     {
  //       $lookup: {
  //         from: 'non_sale',
  //         let: { visitId: '$visit.visitId' },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $eq: ['$visitId', '$$visitId'],
  //               },
  //             },
  //           },
  //           { $sort: { createdAt: -1 } },
  //           { $limit: 1 },
  //         ],
  //         as: 'nonSale',
  //       },
  //     },
  //     {
  //       $unwind: {
  //         path: '$nonSale',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* ---------------- COMPUTED ---------------- */
  //     {
  //       $addFields: {
  //         sequence: '$mappings.sequence',

  //         isVisited: { $gt: ['$visit', null] },
  //         visitedAt: '$visit.visitedAt',
  //         visitStatus: {
  //           $ifNull: ['$visit.status', 'NOT_VISITED'],
  //         },

  //         hasSale: { $gt: ['$sale', null] },
  //         hasNonSale: { $gt: ['$nonSale', null] },

  //         isNonSale: {
  //           $and: [{ $gt: ['$visit', null] }, { $gt: ['$nonSale', null] }],
  //         },

  //         nonSaleReason: '$nonSale.reason',
  //       },
  //     },

  //     /* ---------------- VISIT FILTER ---------------- */
  //     ...(visitStatus === 'VISITED'
  //       ? [{ $match: { isVisited: true } }]
  //       : visitStatus === 'NOT_VISITED'
  //         ? [{ $match: { isVisited: false } }]
  //         : []),

  //     /* ---------------- FINAL SHAPE ---------------- */
  //     {
  //       $replaceRoot: {
  //         newRoot: {
  //           $mergeObjects: [
  //             '$customer',
  //             {
  //               sequence: '$sequence',

  //               isVisited: '$isVisited',
  //               visitedAt: '$visitedAt',
  //               visitStatus: '$visitStatus',

  //               hasSale: '$hasSale',
  //               sale: '$sale',
  //               saleItems: '$saleItems',

  //               hasNonSale: '$hasNonSale',
  //               isNonSale: '$isNonSale',
  //               nonSaleReason: '$nonSaleReason',
  //             },
  //           ],
  //         },
  //       },
  //     },

  //     /* ---------------- SORT ---------------- */
  //     { $sort: { sequence: 1 } },

  //     /* ---------------- FACET ---------------- */
  //     {
  //       $facet: {
  //         data: [{ $skip: (page - 1) * limit }, { $limit: limit }],

  //         meta: [{ $count: 'total' }],

  //         summary: [
  //           {
  //             $group: {
  //               _id: null,

  //               /* ✅ ORDER VALUE FROM ITEMS */
  //               totalOrderValue: {
  //                 $sum: {
  //                   $sum: {
  //                     $map: {
  //                       input: { $ifNull: ['$saleItems', []] },
  //                       as: 'item',
  //                       in: { $ifNull: ['$$item.totalValue', 0] },
  //                     },
  //                   },
  //                 },
  //               },

  //               /* ✅ CORRECT CASE CALCULATION */
  //               totalCases: {
  //                 $sum: {
  //                   $sum: {
  //                     $map: {
  //                       input: { $ifNull: ['$saleItems', []] },
  //                       as: 'item',
  //                       in: {
  //                         $add: [
  //                           { $ifNull: ['$$item.caseQty', 0] },
  //                           {
  //                             $cond: [
  //                               { $gt: ['$$item.unitQtyInCase', 0] },
  //                               {
  //                                 $divide: [
  //                                   { $ifNull: ['$$item.pieceQty', 0] },
  //                                   '$$item.unitQtyInCase',
  //                                 ],
  //                               },
  //                               0,
  //                             ],
  //                           },
  //                         ],
  //                       },
  //                     },
  //                   },
  //                 },
  //               },

  //               totalVisitedShop: {
  //                 $sum: {
  //                   $cond: [{ $eq: ['$isVisited', true] }, 1, 0],
  //                 },
  //               },

  //               totalProductiveCall: {
  //                 $sum: {
  //                   $cond: [{ $and: ['$isVisited', '$hasSale'] }, 1, 0],
  //                 },
  //               },
  //             },
  //           },

  //           {
  //             $addFields: {
  //               LPSC: {
  //                 $cond: [
  //                   { $gt: ['$totalVisitedShop', 0] },
  //                   {
  //                     $round: [
  //                       {
  //                         $divide: ['$totalCases', '$totalVisitedShop'],
  //                       },
  //                       2,
  //                     ],
  //                   },
  //                   0,
  //                 ],
  //               },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //   ];

  //   /* ======================================================
  //    * 3️⃣ EXECUTE
  //    * ====================================================== */
  //   const result = await this.model.aggregate(pipeline);

  //   const data = result?.[0]?.data || [];
  //   const total = result?.[0]?.meta?.[0]?.total || 0;

  //   const summary = result?.[0]?.summary?.[0] || {
  //     totalOrderValue: 0,
  //     totalCases: 0,
  //     totalVisitedShop: 0,
  //     totalProductiveCall: 0,
  //     LPSC: 0,
  //   };

  //   /* ======================================================
  //    * 4️⃣ RESPONSE
  //    * ====================================================== */
  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: ROUTE.FETCHED,
  //     data: {
  //       data,
  //       summary,
  //     },
  //     meta: {
  //       page,
  //       limit,
  //       total,
  //     },
  //   };
  // }

  // async getRouteCustomers(
  //   routeId: string,
  //   query: RouteCustomerQueryDto & {
  //     routeSessionId?: string;
  //     visitStatus?: 'VISITED' | 'NOT_VISITED';
  //   },
  // ) {
  //   const {
  //     searchText,
  //     page = 1,
  //     limit = 20,
  //     status,
  //     routeSessionId,
  //     visitStatus,
  //   } = query;

  //   /* ======================================================
  //    * 1️⃣ VALIDATE ROUTE
  //    * ====================================================== */
  //   const route = await this.model.findOne({ routeId });

  //   if (!route) {
  //     return {
  //       statusCode: HttpStatus.NOT_FOUND,
  //       message: ROUTE.NOT_FOUND,
  //       data: [],
  //     };
  //   }

  //   const todayStart = new Date();
  //   todayStart.setHours(0, 0, 0, 0);
  //   const todayEnd = new Date();
  //   todayEnd.setHours(23, 59, 59, 999);

  //   /* ======================================================
  //    * 2️⃣ PIPELINE
  //    * ====================================================== */
  //   const pipeline: any[] = [
  //     {
  //       $match: { routeId, isDeleted: false },
  //     },

  //     /* ---------------- MAPPINGS ---------------- */
  //     {
  //       $lookup: {
  //         from: 'route_customer_mappings',
  //         let: { routeId: '$routeId' },

  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   {
  //                     $eq: ['$routeId', '$$routeId'],
  //                   },

  //                   {
  //                     $eq: ['$status', 'ACTIVE'],
  //                   },
  //                 ],
  //               },
  //             },
  //           },
  //         ],

  //         as: 'mappings',
  //       },
  //     },

  //     {
  //       $unwind: '$mappings',
  //     },

  //     /* ---------------- CUSTOMER ---------------- */
  //     {
  //       $lookup: {
  //         from: 'customer_master',
  //         localField: 'mappings.customerId',
  //         foreignField: 'customerId',
  //         as: 'customer',
  //       },
  //     },

  //     {
  //       $unwind: '$customer',
  //     },

  //     /* ---------------- FILTER ---------------- */
  //     {
  //       $match: {
  //         ...(status
  //           ? {
  //               'customer.status': status,
  //             }
  //           : {}),

  //         ...(searchText
  //           ? {
  //               $or: [
  //                 {
  //                   'customer.name': {
  //                     $regex: searchText,
  //                     $options: 'i',
  //                   },
  //                 },

  //                 {
  //                   'customer.mobile': {
  //                     $regex: searchText,
  //                     $options: 'i',
  //                   },
  //                 },
  //               ],
  //             }
  //           : {}),
  //       },
  //     },

  //     /* ---------------- VISIT ---------------- */
  //     {
  //       $lookup: {
  //         from: 'shop_visits',

  //         let: {
  //           customerId: '$customer.customerId',
  //           routeSessionId: routeSessionId || null,
  //           todayStart,
  //           todayEnd,
  //         },

  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   {
  //                     $eq: ['$outletId', '$$customerId'],
  //                   },

  //                   {
  //                     $eq: ['$status', ShopVisitStatus.COMPLETED],
  //                   },

  //                   {
  //                     $or: [
  //                       {
  //                         $and: [
  //                           { $gte: ['$checkOutTime', '$$todayStart'] },
  //                           { $lte: ['$checkOutTime', '$$todayEnd'] },
  //                         ],
  //                       },
  //                       {
  //                         $and: [
  //                           { $gte: ['$checkInTime', '$$todayStart'] },
  //                           { $lte: ['$checkInTime', '$$todayEnd'] },
  //                         ],
  //                       },
  //                     ],
  //                   },

  //                   {
  //                     $cond: [
  //                       {
  //                         $or: [
  //                           {
  //                             $eq: ['$$routeSessionId', null],
  //                           },

  //                           {
  //                             $eq: ['$$routeSessionId', ''],
  //                           },
  //                         ],
  //                       },

  //                       true,

  //                       {
  //                         $eq: ['$routeSessionId', '$$routeSessionId'],
  //                       },
  //                     ],
  //                   },
  //                 ],
  //               },
  //             },
  //           },

  //           {
  //             $sort: {
  //               createdAt: -1,
  //             },
  //           },

  //           {
  //             $limit: 1,
  //           },
  //         ],

  //         as: 'visit',
  //       },
  //     },

  //     {
  //       $unwind: {
  //         path: '$visit',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* ---------------- SALE ---------------- */
  //     {
  //       $lookup: {
  //         from: 'sales',

  //         let: {
  //           visitId: '$visit.visitId',
  //         },

  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $eq: ['$visitId', '$$visitId'],
  //               },
  //             },
  //           },

  //           {
  //             $sort: {
  //               createdAt: -1,
  //             },
  //           },

  //           {
  //             $limit: 1,
  //           },
  //         ],

  //         as: 'sale',
  //       },
  //     },

  //     {
  //       $unwind: {
  //         path: '$sale',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* 🔥 SALE ITEMS */
  //     {
  //       $lookup: {
  //         from: 'sale_items',

  //         let: {
  //           saleId: '$sale.saleId',
  //         },

  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $eq: ['$saleId', '$$saleId'],
  //               },
  //             },
  //           },
  //         ],

  //         as: 'saleItems',
  //       },
  //     },

  //     /* ---------------- NON-SALE ---------------- */
  //     {
  //       $lookup: {
  //         from: 'non_sale',

  //         let: {
  //           visitId: '$visit.visitId',
  //         },

  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $eq: ['$visitId', '$$visitId'],
  //               },
  //             },
  //           },

  //           {
  //             $sort: {
  //               createdAt: -1,
  //             },
  //           },

  //           {
  //             $limit: 1,
  //           },
  //         ],

  //         as: 'nonSale',
  //       },
  //     },

  //     {
  //       $unwind: {
  //         path: '$nonSale',
  //         preserveNullAndEmptyArrays: true,
  //       },
  //     },

  //     /* ---------------- COMPUTED ---------------- */
  //     {
  //       $addFields: {
  //         sequence: '$mappings.sequence',

  //         // isVisited: {
  //         //   $gt: ['$visit', null],
  //         // },
  //         isVisited: {
  //           $gt: ['$visit', null],
  //         },
  //         visitedAt: {
  //           $ifNull: ['$visit.checkOutTime', '$visit.checkInTime'],
  //         },

  //         visitStatus: {
  //           $ifNull: ['$visit.status', 'NOT_VISITED'],
  //         },

  //         hasSale: {
  //           $gt: ['$sale', null],
  //         },

  //         hasNonSale: {
  //           $gt: ['$nonSale', null],
  //         },

  //         isNonSale: {
  //           $and: [
  //             {
  //               $gt: ['$visit', null],
  //             },

  //             {
  //               $gt: ['$nonSale', null],
  //             },
  //           ],
  //         },

  //         nonSaleReason: '$nonSale.reason',
  //       },
  //     },

  //     /* ---------------- VISIT FILTER ---------------- */
  //     ...(visitStatus === 'VISITED'
  //       ? [
  //           {
  //             $match: {
  //               isVisited: true,
  //             },
  //           },
  //         ]
  //       : visitStatus === 'NOT_VISITED'
  //         ? [
  //             {
  //               $match: {
  //                 isVisited: false,
  //               },
  //             },
  //           ]
  //         : []),

  //     /* ---------------- FINAL SHAPE ---------------- */
  //     {
  //       $replaceRoot: {
  //         newRoot: {
  //           $mergeObjects: [
  //             '$customer',

  //             {
  //               sequence: '$sequence',

  //               isVisited: '$isVisited',
  //               visitedAt: '$visitedAt',
  //               visitStatus: '$visitStatus',

  //               hasSale: '$hasSale',
  //               sale: '$sale',
  //               saleItems: '$saleItems',

  //               hasNonSale: '$hasNonSale',
  //               isNonSale: '$isNonSale',
  //               nonSaleReason: '$nonSaleReason',
  //             },
  //           ],
  //         },
  //       },
  //     },

  //     /* ---------------- SORT ---------------- */
  //     {
  //       $sort: {
  //         sequence: 1,
  //       },
  //     },

  //     /* ---------------- FACET ---------------- */
  //     {
  //       $facet: {
  //         data: [
  //           {
  //             $skip: (page - 1) * limit,
  //           },

  //           {
  //             $limit: limit,
  //           },
  //         ],

  //         meta: [
  //           {
  //             $count: 'total',
  //           },
  //         ],

  //         summary: [
  //           {
  //             $group: {
  //               _id: null,

  //               totalOrderValue: {
  //                 $sum: {
  //                   $sum: {
  //                     $map: {
  //                       input: {
  //                         $ifNull: ['$saleItems', []],
  //                       },

  //                       as: 'item',

  //                       in: {
  //                         $ifNull: ['$$item.totalValue', 0],
  //                       },
  //                     },
  //                   },
  //                 },
  //               },

  //               totalCases: {
  //                 $sum: {
  //                   $sum: {
  //                     $map: {
  //                       input: {
  //                         $ifNull: ['$saleItems', []],
  //                       },

  //                       as: 'item',

  //                       in: {
  //                         $add: [
  //                           {
  //                             $ifNull: ['$$item.caseQty', 0],
  //                           },

  //                           {
  //                             $cond: [
  //                               {
  //                                 $gt: ['$$item.unitQtyInCase', 0],
  //                               },

  //                               {
  //                                 $divide: [
  //                                   {
  //                                     $ifNull: ['$$item.pieceQty', 0],
  //                                   },

  //                                   '$$item.unitQtyInCase',
  //                                 ],
  //                               },

  //                               0,
  //                             ],
  //                           },
  //                         ],
  //                       },
  //                     },
  //                   },
  //                 },
  //               },

  //               totalVisitedShop: {
  //                 $sum: {
  //                   $cond: [
  //                     {
  //                       $eq: ['$isVisited', true],
  //                     },
  //                     1,
  //                     0,
  //                   ],
  //                 },
  //               },

  //               totalProductiveCall: {
  //                 $sum: {
  //                   $cond: [
  //                     {
  //                       $and: ['$isVisited', '$hasSale'],
  //                     },
  //                     1,
  //                     0,
  //                   ],
  //                 },
  //               },
  //             },
  //           },

  //           {
  //             $addFields: {
  //               LPSC: {
  //                 $cond: [
  //                   {
  //                     $gt: ['$totalVisitedShop', 0],
  //                   },

  //                   {
  //                     $round: [
  //                       {
  //                         $divide: ['$totalCases', '$totalVisitedShop'],
  //                       },
  //                       2,
  //                     ],
  //                   },

  //                   0,
  //                 ],
  //               },
  //             },
  //           },
  //         ],
  //       },
  //     },
  //   ];

  //   /* ======================================================
  //    * 3️⃣ EXECUTE
  //    * ====================================================== */
  //   const result = await this.model.aggregate(pipeline);

  //   const data = result?.[0]?.data || [];

  //   const total = result?.[0]?.meta?.[0]?.total || 0;

  //   const summary = result?.[0]?.summary?.[0] || {
  //     totalOrderValue: 0,
  //     totalCases: 0,
  //     totalVisitedShop: 0,
  //     totalProductiveCall: 0,
  //     LPSC: 0,
  //   };

  //   /* ======================================================
  //    * 4️⃣ RESPONSE
  //    * ====================================================== */
  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: ROUTE.FETCHED,

  //     data: {
  //       data,
  //       summary,
  //     },

  //     meta: {
  //       page,
  //       limit,
  //       total,
  //     },
  //   };
  // }

  async getRouteCustomers(
    routeId: string,
    query: RouteCustomerQueryDto & {
      routeSessionId?: string;
      visitStatus?: 'VISITED' | 'NOT_VISITED';
    },
  ) {
    const {
      searchText,
      page = 1,
      limit = 20,
      status,
      routeSessionId,
      visitStatus,
    } = query;

    /* ======================================================
     * 1️⃣ VALIDATE ROUTE
     * ====================================================== */
    const route = await this.model.findOne({ routeId });

    if (!route) {
      return {
        statusCode: HttpStatus.NOT_FOUND,
        message: ROUTE.NOT_FOUND,
        data: [],
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    /* ======================================================
     * 2️⃣ PIPELINE
     * ====================================================== */
    const pipeline: any[] = [
      {
        $match: {
          routeId,
          isDeleted: false,
        },
      },

      /* ---------------- MAPPINGS ---------------- */
      {
        $lookup: {
          from: 'route_customer_mappings',
          let: { routeId: '$routeId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$routeId', '$$routeId'],
                    },
                    {
                      $eq: ['$status', 'ACTIVE'],
                    },
                  ],
                },
              },
            },
          ],
          as: 'mappings',
        },
      },

      {
        $unwind: '$mappings',
      },

      /* ---------------- CUSTOMER ---------------- */
      {
        $lookup: {
          from: 'customer_master',
          localField: 'mappings.customerId',
          foreignField: 'customerId',
          as: 'customer',
        },
      },

      {
        $unwind: '$customer',
      },

      /* ---------------- FILTER ---------------- */
      {
        $match: {
          ...(status
            ? {
                'customer.status': status,
              }
            : {}),

          ...(searchText
            ? {
                $or: [
                  {
                    'customer.name': {
                      $regex: searchText,
                      $options: 'i',
                    },
                  },
                  {
                    'customer.mobile': {
                      $regex: searchText,
                      $options: 'i',
                    },
                  },
                ],
              }
            : {}),
        },
      },

      /* ---------------- LAST ORDER ---------------- */
      {
        $lookup: {
          from: 'sales',
          let: {
            customerId: '$customer.customerId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$customerId', '$$customerId'],
                    },
                    {
                      $eq: ['$status', SaleStatus.COMPLETED],
                    },
                  ],
                },
              },
            },
            {
              $addFields: {
                resolvedOrderDate: {
                  $ifNull: ['$date', '$createdAt'],
                },
              },
            },
            {
              $sort: {
                resolvedOrderDate: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 0,
                resolvedOrderDate: 1,
              },
            },
          ],
          as: 'lastOrder',
        },
      },

      {
        $addFields: {
          lastOrderDate: {
            $arrayElemAt: ['$lastOrder.resolvedOrderDate', 0],
          },
        },
      },

      /* ======================================================
       * VISITS
       * ====================================================== */
      {
        $lookup: {
          from: 'shop_visits',
          let: {
            customerId: '$customer.customerId',
            routeSessionId: routeSessionId || null,
            todayStart,
            todayEnd,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: ['$outletId', '$$customerId'],
                    },
                    {
                      $eq: ['$status', ShopVisitStatus.COMPLETED],
                    },
                    {
                      $or: [
                        {
                          $and: [
                            {
                              $gte: ['$checkOutTime', '$$todayStart'],
                            },
                            {
                              $lte: ['$checkOutTime', '$$todayEnd'],
                            },
                          ],
                        },
                        {
                          $and: [
                            {
                              $gte: ['$checkInTime', '$$todayStart'],
                            },
                            {
                              $lte: ['$checkInTime', '$$todayEnd'],
                            },
                          ],
                        },
                      ],
                    },
                    {
                      $cond: [
                        {
                          $or: [
                            {
                              $eq: ['$$routeSessionId', null],
                            },
                            {
                              $eq: ['$$routeSessionId', ''],
                            },
                          ],
                        },
                        true,
                        {
                          $eq: ['$routeSessionId', '$$routeSessionId'],
                        },
                      ],
                    },
                  ],
                },
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
          ],
          as: 'visits',
        },
      },

      {
        $addFields: {
          visit: {
            $arrayElemAt: ['$visits', 0],
          },
          visitIds: {
            $map: {
              input: {
                $ifNull: ['$visits', []],
              },
              as: 'visit',
              in: '$$visit.visitId',
            },
          },
        },
      },

      /* ======================================================
       * SALES
       * ====================================================== */
      {
        $lookup: {
          from: 'sales',
          let: {
            visitIds: '$visitIds',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$visitId', '$$visitIds'],
                },
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
          ],
          as: 'sales',
        },
      },

      {
        $addFields: {
          sale: {
            $arrayElemAt: ['$sales', 0],
          },
          saleIds: {
            $map: {
              input: {
                $ifNull: ['$sales', []],
              },
              as: 'sale',
              in: '$$sale.saleId',
            },
          },
          saleVisitIds: {
            $setUnion: [
              {
                $map: {
                  input: {
                    $ifNull: ['$sales', []],
                  },
                  as: 'sale',
                  in: '$$sale.visitId',
                },
              },
              [],
            ],
          },
        },
      },

      /* ---------------- ALL SALE ITEMS FOR SUMMARY ---------------- */
      {
        $lookup: {
          from: 'sale_items',
          let: {
            saleIds: '$saleIds',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$saleId', '$$saleIds'],
                },
              },
            },
          ],
          as: 'allSaleItems',
        },
      },

      {
        $addFields: {
          saleItems: {
            $filter: {
              input: {
                $ifNull: ['$allSaleItems', []],
              },
              as: 'item',
              cond: {
                $eq: ['$$item.saleId', '$sale.saleId'],
              },
            },
          },
        },
      },

      /* ======================================================
       * NON-SALE
       * ====================================================== */
      {
        $lookup: {
          from: 'non_sale',
          let: {
            visitIds: '$visitIds',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$visitId', '$$visitIds'],
                },
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
          ],
          as: 'nonSales',
        },
      },

      {
        $addFields: {
          nonSale: {
            $arrayElemAt: ['$nonSales', 0],
          },
          nonSaleVisitIds: {
            $setUnion: [
              {
                $map: {
                  input: {
                    $ifNull: ['$nonSales', []],
                  },
                  as: 'nonSale',
                  in: '$$nonSale.visitId',
                },
              },
              [],
            ],
          },
        },
      },

      /* ---------------- COMPUTED ---------------- */
      {
        $addFields: {
          sequence: '$mappings.sequence',

          isVisited: {
            $gt: [
              {
                $size: {
                  $ifNull: ['$visits', []],
                },
              },
              0,
            ],
          },

          visitedAt: {
            $ifNull: ['$visit.checkOutTime', '$visit.checkInTime'],
          },

          visitStatus: {
            $ifNull: ['$visit.status', 'NOT_VISITED'],
          },

          hasSale: {
            $gt: [
              {
                $size: {
                  $ifNull: ['$sales', []],
                },
              },
              0,
            ],
          },

          hasNonSale: {
            $gt: [
              {
                $size: {
                  $ifNull: ['$nonSales', []],
                },
              },
              0,
            ],
          },

          isNonSale: {
            $and: [
              {
                $gt: [
                  {
                    $size: {
                      $ifNull: ['$visits', []],
                    },
                  },
                  0,
                ],
              },
              {
                $gt: [
                  {
                    $size: {
                      $ifNull: ['$nonSales', []],
                    },
                  },
                  0,
                ],
              },
              {
                $eq: [
                  {
                    $size: {
                      $ifNull: ['$sales', []],
                    },
                  },
                  0,
                ],
              },
            ],
          },

          nonSaleReason: {
            $cond: [
              {
                $and: [
                  {
                    $gt: [
                      {
                        $size: {
                          $ifNull: ['$nonSales', []],
                        },
                      },
                      0,
                    ],
                  },
                  {
                    $eq: [
                      {
                        $size: {
                          $ifNull: ['$sales', []],
                        },
                      },
                      0,
                    ],
                  },
                ],
              },
              '$nonSale.reason',
              null,
            ],
          },

          visitCountForSummary: {
            $size: {
              $ifNull: ['$visits', []],
            },
          },

          productiveCallCountForSummary: {
            $size: {
              $ifNull: ['$saleVisitIds', []],
            },
          },

          nonProductiveCallCountForSummary: {
            $size: {
              $filter: {
                input: {
                  $ifNull: ['$visitIds', []],
                },
                as: 'visitId',
                cond: {
                  $not: {
                    $in: ['$$visitId', '$saleVisitIds'],
                  },
                },
              },
            },
          },

          nonSaleCallCountForSummary: {
            $size: {
              $filter: {
                input: {
                  $ifNull: ['$nonSaleVisitIds', []],
                },
                as: 'visitId',
                cond: {
                  $not: {
                    $in: ['$$visitId', '$saleVisitIds'],
                  },
                },
              },
            },
          },
        },
      },

      /* ---------------- VISIT FILTER ---------------- */
      ...(visitStatus === 'VISITED'
        ? [
            {
              $match: {
                isVisited: true,
              },
            },
          ]
        : visitStatus === 'NOT_VISITED'
          ? [
              {
                $match: {
                  isVisited: false,
                },
              },
            ]
          : []),

      /* ---------------- FINAL SHAPE ---------------- */
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$customer',
              {
                sequence: '$sequence',
                lastOrderDate: '$lastOrderDate',

                isVisited: '$isVisited',
                visitedAt: '$visitedAt',
                visitStatus: '$visitStatus',

                hasSale: '$hasSale',
                sale: '$sale',
                saleItems: '$saleItems',

                hasNonSale: '$hasNonSale',
                isNonSale: '$isNonSale',
                nonSaleReason: '$nonSaleReason',

                /**
                 * UI/debug fields
                 */
                visitCount: '$visitCountForSummary',
                saleVisitCount: '$productiveCallCountForSummary',

                /**
                 * Required for summary facet.
                 * These must stay until after $facet.
                 */
                allSaleItems: '$allSaleItems',
                visitCountForSummary: '$visitCountForSummary',
                productiveCallCountForSummary: '$productiveCallCountForSummary',
                nonProductiveCallCountForSummary:
                  '$nonProductiveCallCountForSummary',
                nonSaleCallCountForSummary: '$nonSaleCallCountForSummary',
              },
            ],
          },
        },
      },

      /* ---------------- SORT ---------------- */
      {
        $sort: {
          sequence: 1,
        },
      },

      /* ---------------- FACET ---------------- */
      {
        $facet: {
          data: [
            {
              $skip: (page - 1) * limit,
            },
            {
              $limit: limit,
            },

            /**
             * Remove summary-only fields from row response.
             */
            {
              $project: {
                allSaleItems: 0,
                visitCountForSummary: 0,
                productiveCallCountForSummary: 0,
                nonProductiveCallCountForSummary: 0,
                nonSaleCallCountForSummary: 0,
              },
            },
          ],

          meta: [
            {
              $count: 'total',
            },
          ],

          summary: [
            {
              $group: {
                _id: null,

                totalOrderValue: {
                  $sum: {
                    $sum: {
                      $map: {
                        input: {
                          $ifNull: ['$allSaleItems', []],
                        },
                        as: 'item',
                        in: {
                          $ifNull: ['$$item.totalValue', 0],
                        },
                      },
                    },
                  },
                },

                totalCases: {
                  $sum: {
                    $sum: {
                      $map: {
                        input: {
                          $ifNull: ['$allSaleItems', []],
                        },
                        as: 'item',
                        in: {
                          $add: [
                            {
                              $ifNull: ['$$item.caseQty', 0],
                            },
                            {
                              $cond: [
                                {
                                  $gt: ['$$item.unitQtyInCase', 0],
                                },
                                {
                                  $divide: [
                                    {
                                      $ifNull: ['$$item.pieceQty', 0],
                                    },
                                    '$$item.unitQtyInCase',
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
                },

                totalVisitedShop: {
                  $sum: '$visitCountForSummary',
                },

                totalProductiveCall: {
                  $sum: '$productiveCallCountForSummary',
                },

                totalNonProductiveCall: {
                  $sum: '$nonProductiveCallCountForSummary',
                },

                totalNonSaleCall: {
                  $sum: '$nonSaleCallCountForSummary',
                },
              },
            },

            {
              $addFields: {
                LPSC: {
                  $cond: [
                    {
                      $gt: ['$totalVisitedShop', 0],
                    },
                    {
                      $round: [
                        {
                          $divide: ['$totalCases', '$totalVisitedShop'],
                        },
                        2,
                      ],
                    },
                    0,
                  ],
                },
              },
            },

            {
              $project: {
                _id: 0,
                totalOrderValue: {
                  $round: ['$totalOrderValue', 2],
                },
                totalCases: {
                  $round: ['$totalCases', 2],
                },
                totalVisitedShop: 1,
                totalProductiveCall: 1,
                totalNonProductiveCall: 1,
                totalNonSaleCall: 1,
                LPSC: 1,
              },
            },
          ],
        },
      },
    ];

    /* ======================================================
     * 3️⃣ EXECUTE
     * ====================================================== */
    const result = await this.model.aggregate(pipeline);

    const data = result?.[0]?.data || [];

    const total = result?.[0]?.meta?.[0]?.total || 0;

    const summary = result?.[0]?.summary?.[0] || {
      totalOrderValue: 0,
      totalCases: 0,
      totalVisitedShop: 0,
      totalProductiveCall: 0,
      totalNonProductiveCall: 0,
      totalNonSaleCall: 0,
      LPSC: 0,
    };

    /* ======================================================
     * 4️⃣ RESPONSE
     * ====================================================== */
    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,

      data: {
        data,
        summary,
      },

      meta: {
        page,
        limit,
        total,
      },
    };
  }

  async findByRouteId(routeId: string) {
    const doc = await this.findOne({ routeId }, { lean: true });

    if (!doc) {
      throw new NotFoundException(ROUTE.NOT_FOUND);
    }
    const [route] = await this.attachRouteMappings([doc as any]);

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data: route,
    };
  }

  async update(routeId: string, dto: UpdateRouteDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { associatedCustomers, ...routeDto } = dto;

        if (dto.name) {
          routeDto.name = TextNormalizer.normalize(
            dto.name,
            NormalizeType.TITLE,
          );
        }
        if (associatedCustomers) {
          routeDto.outletCount = associatedCustomers.length;
        }

        const existing = await this.findOne({ routeId }, { session });
        if (!existing) throw new NotFoundException(ROUTE.NOT_FOUND);

        const doc = await this.updateOne({ routeId }, routeDto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(ROUTE.NOT_FOUND);
        if (associatedCustomers) {
          await this.syncRouteCustomers(
            routeId,
            associatedCustomers as RouteCustomerDto[],
            session,
          );
        }
        const route = await this.findOne({ routeId }, { session, lean: true });
        const [routeWithMappings] = await this.attachRouteMappings(
          [route as any],
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: ROUTE.UPDATED,
          data: routeWithMappings,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(routeId: string) {
    const existing = await this.findOne({ routeId });

    if (!existing) throw new NotFoundException(ROUTE.NOT_FOUND);

    await this.withTransaction(async (session) => {
      await this.syncRouteCustomers(routeId, [], session);
      await this.softDelete({ routeId }, { session });
    });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(ROUTE.DUPLICATE);
    }
    throw error;
  }
}
