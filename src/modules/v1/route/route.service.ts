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
import { RouteCustomerMappingSchema } from 'src/core/database/mongo/schema/route-customer-mapping.schema';
import { RouteCustomerMappingService } from '../route-customer-mapping/route-customer-mapping.service';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';
import { CustomerService } from '../customer/customer.service';
import { CustomerQueryDto } from '../customer/dto/customer-query.dto';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { ShopVisitService } from '../shop-visit/shop-visit.service';

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

  async create(payload: CreateRouteDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(
            payload.name,
            NormalizeType.TITLE,
          );
        }

        const filter: FilterQuery<Route> = {};

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
              ...payload,
              status: 'ACTIVE',
              isDeleted: false,
            },
            { session },
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
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: ROUTE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: RouteQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Route> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ routeId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data: result.items,
      meta: result.meta,
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

    /* ======================================================
     * 2️⃣ PIPELINE
     * ====================================================== */
    const pipeline: any[] = [
      { $match: { routeId } },

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
                    { $eq: ['$routeId', '$$routeId'] },
                    { $eq: ['$status', 'ACTIVE'] },
                  ],
                },
              },
            },
          ],
          as: 'mappings',
        },
      },
      { $unwind: '$mappings' },

      /* ---------------- CUSTOMER ---------------- */
      {
        $lookup: {
          from: 'customer_master',
          localField: 'mappings.customerId',
          foreignField: 'customerId',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },

      /* ---------------- FILTER ---------------- */
      {
        $match: {
          ...(status ? { 'customer.status': status } : {}),
          ...(searchText
            ? {
                $or: [
                  { 'customer.name': { $regex: searchText, $options: 'i' } },
                  { 'customer.mobile': { $regex: searchText, $options: 'i' } },
                ],
              }
            : {}),
        },
      },

      /* ---------------- VISIT (LATEST) ---------------- */
      {
        $lookup: {
          from: 'shop_visits',
          let: { customerId: '$customer.customerId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$outletId', '$$customerId'] },
                    ...(routeSessionId
                      ? [{ $eq: ['$routeSessionId', routeSessionId] }]
                      : []),
                  ],
                },
              },
            },
            { $sort: { visitedAt: -1 } },
            { $limit: 1 },
          ],
          as: 'visit',
        },
      },
      {
        $unwind: {
          path: '$visit',
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ---------------- SALE (BY visitId) ---------------- */
      {
        $lookup: {
          from: 'sales',
          let: { visitId: '$visit.visitId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$visitId', '$$visitId'],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'sale',
        },
      },
      {
        $unwind: {
          path: '$sale',
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ---------------- NON-SALE (BY visitId) ---------------- */
      {
        $lookup: {
          from: 'non_sale',
          let: { visitId: '$visit.visitId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$visitId', '$$visitId'],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: 'nonSale',
        },
      },
      {
        $unwind: {
          path: '$nonSale',
          preserveNullAndEmptyArrays: true,
        },
      },

      /* ---------------- COMPUTED ---------------- */
      {
        $addFields: {
          sequence: '$mappings.sequence',

          isVisited: { $gt: ['$visit', null] },
          visitedAt: '$visit.visitedAt',
          visitStatus: {
            $ifNull: ['$visit.status', 'NOT_VISITED'],
          },

          hasSale: { $gt: ['$sale', null] },
          hasNonSale: { $gt: ['$nonSale', null] },

          isNonSale: {
            $and: [{ $gt: ['$visit', null] }, { $gt: ['$nonSale', null] }],
          },

          nonSaleReason: '$nonSale.reason',
        },
      },

      /* ---------------- VISIT FILTER ---------------- */
      ...(visitStatus === 'VISITED'
        ? [{ $match: { isVisited: true } }]
        : visitStatus === 'NOT_VISITED'
          ? [{ $match: { isVisited: false } }]
          : []),

      /* ---------------- FINAL SHAPE ---------------- */
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$customer',
              {
                sequence: '$sequence',

                isVisited: '$isVisited',
                visitedAt: '$visitedAt',
                visitStatus: '$visitStatus',
                visit: '$visit',

                hasSale: '$hasSale',
                sale: '$sale',

                hasNonSale: '$hasNonSale',
                isNonSale: '$isNonSale',
                nonSaleReason: '$nonSaleReason',
                nonSale: '$nonSale',
              },
            ],
          },
        },
      },

      /* ---------------- SORT ---------------- */
      { $sort: { sequence: 1 } },

      /* ---------------- PAGINATION ---------------- */
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    /* ======================================================
     * 3️⃣ EXECUTE
     * ====================================================== */
    const result = await this.model.aggregate(pipeline);

    const data = result?.[0]?.data || [];
    const total = result?.[0]?.meta?.[0]?.total || 0;

    /* ======================================================
     * 4️⃣ RESPONSE
     * ====================================================== */
    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data,
      meta: {
        page,
        limit,
        total,
      },
    };
  }

  async findByRouteId(routeId: string) {
    const pipeline: any[] = [
      {
        $match: { routeId },
      },

      /**
       * ✅ unwind customers
       */
      {
        $unwind: {
          path: '$associatedCustomers',
          preserveNullAndEmptyArrays: true,
        },
      },

      /**
       * ✅ SORT BEFORE GROUP (IMPORTANT FIX)
       */
      {
        $sort: {
          'associatedCustomers.sequence': 1,
        },
      },

      /**
       * ✅ lookup customer details
       */
      {
        $lookup: {
          from: 'customer_master',
          localField: 'associatedCustomers.customerId',
          foreignField: 'customerId',
          as: 'customerDetails',
        },
      },
      {
        $unwind: {
          path: '$customerDetails',
          preserveNullAndEmptyArrays: true,
        },
      },

      /**
       * ✅ merge customer
       */
      {
        $addFields: {
          'associatedCustomers.customer': '$customerDetails',
        },
      },

      /**
       * ✅ group back
       */
      {
        $group: {
          _id: '$routeId',
          routeId: { $first: '$routeId' },
          name: { $first: '$name' },
          beatId: { $first: '$beatId' },
          day: { $first: '$day' },
          distance: { $first: '$distance' },
          status: { $first: '$status' },
          associatedCustomers: {
            $push: {
              customerId: '$associatedCustomers.customerId',
              sequence: '$associatedCustomers.sequence',
              customer: '$associatedCustomers.customer',
            },
          },
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);
    const doc = result?.[0];

    if (!doc) {
      throw new NotFoundException(ROUTE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data: doc,
    };
  }

  async update(routeId: string, dto: UpdateRouteDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne({ routeId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(ROUTE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ROUTE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(routeId: string) {
    const existing = await this.findOne({ routeId });

    if (!existing) throw new NotFoundException(ROUTE.NOT_FOUND);

    await this.softDelete({ routeId });

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
