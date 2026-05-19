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
import {
  Days,
  RouteCustomerMappingStatus,
} from 'src/shared/enums/route-customer-mapping.enums';
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
  ) {
    super(mongo.getModel(Customer.name, CustomerSchema));
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
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<Customer> = {
          mobile: payload.phoneNumber, // or any unique field
        };

        payload.geoTag = {
          lat: 21.867313, // default latitude
          lng: 77.8164907, // default longitude
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
              status: 'ACTIVE',
              isDeleted: false,
            },
            { session },
          );

          customerId = existing.customerId;
        } else {
          // ✅ CASE 3: Create new customer
          const doc = await this.save(
            {
              customerId: IdGenerator.generate('CUST', 8),
              ...payload,
            },
            { session },
          );

          customerId = doc.customerId;
        }

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
              day: Days.MON,
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
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: CustomerQueryDto) {
    const { searchText, status, page = 1, limit = 20, customerIds } = query;

    const filter: FilterQuery<Customer> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ name: regex }];
    }

    if (customerIds) {
      filter.customerId = { $in: customerIds } as any;
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.FETCHED,
      data: result.items,
      meta: result.meta,
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

  async findByCustomerId(customerId: string) {
    const doc = await this.findOne({ customerId }, { lean: true });

    if (!doc) throw new NotFoundException(CUSTOMER.NOT_FOUND);

    // Get current date range for MTD (Month to Date)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    // Get last 5 completed orders
    const last5Orders: any = await this.saleModel
      .find({
        customerId,
        status: 'COMPLETED',
        isDeleted: false,
      })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Calculate MTD order value and quantity
    const mtdOrders: any = await this.saleModel.aggregate([
      {
        $match: {
          customerId,
          status: 'COMPLETED',
          isDeleted: false,
          date: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          },
        },
      },
      {
        $group: {
          _id: null,
          mtdOrderValue: { $sum: '$totalValue' },
          mtdTotalCases: { $sum: '$totalCases' },
          mtdOrderCount: { $sum: 1 },
        },
      },
    ]);

    // Calculate last 5 orders statistics
    let avgOrderValue = 0;
    let avgOrderQty = 0;
    let avgLPC = 0;

    if (last5Orders.length > 0) {
      const totalValue = last5Orders.reduce(
        (sum, order: any) => sum + (order.totalValue || 0),
        0,
      );
      const totalQty = last5Orders.reduce(
        (sum, order) => sum + (order.totalCases || 0),
        0,
      );
      const totalLPC = last5Orders.reduce(
        (sum, order) => sum + (order.totalLpc || order.totalLPC || 0),
        0,
      );

      avgOrderValue = totalValue / last5Orders.length;
      avgOrderQty = totalQty / last5Orders.length;
      avgLPC = totalLPC / last5Orders.length;
    }

    // Get last order date
    const lastOrder = await this.saleModel
      .findOne({ customerId, status: 'COMPLETED', isDeleted: false })
      .sort({ date: -1 })
      .lean();

    // Get last visit date from visits collection (assuming you have a visit model)
    const lastVisit = await this.shopVisitModel
      .findOne({ customerId, status: 'COMPLETED' })
      .sort({ checkInTime: -1 })
      .lean();

    // Prepare summary data
    const summary = {
      mtd: {
        orderValue: mtdOrders[0]?.mtdOrderValue || 0,
        orderQuantity: mtdOrders[0]?.mtdTotalCases || 0,
        orderCount: mtdOrders[0]?.mtdOrderCount || 0,
      },
      last5Orders: {
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        avgOrderQuantity: parseFloat(avgOrderQty.toFixed(2)),
        avgLPC: parseFloat(avgLPC.toFixed(2)),
        orders: last5Orders.map((order) => ({
          saleId: order.saleId,
          date: order.date,
          totalValue: order.totalValue,
          totalCases: order.totalCases,
          totalPieces: order.totalPieces,
          totalLPC: order.totalLpc || order.totalLPC || 0,
        })),
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
                customerId: IdGenerator.generate('CUST', 8),

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

            const countryName = row[COLUMN.COUNTRY]?.trim();

            const provinceName = row[COLUMN.STATE]?.trim();

            const marketName = row[COLUMN.MARKET]?.trim();

            const countryId = countryMap.get(countryName);

            const provinceKey = `${countryId}_${provinceName}`;

            const provinceId = provinceMap.get(provinceKey);

            const marketKey = `${provinceId}_${marketName}`;

            const marketId = marketMap.get(marketKey);

            let route = await this.routeModel
              .findOne({
                beatErpId,
              })
              .lean();

            if (!route) {
              route = await this.routeModel.create({
                routeId: IdGenerator.generate('ROUTE', 8),

                name: row[COLUMN.BEAT_NAME] || beatErpId,

                beatId: beatErpId,

                beatErpId,

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

                associatedUsers: [],

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

                day: Days.MON,
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
