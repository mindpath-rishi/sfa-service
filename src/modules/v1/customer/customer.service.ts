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

@Injectable()
export class CustomerService extends MongoRepository<Customer> {
  constructor(
    mongo: MongoService,
    @InjectModel(ShopVisit.name)
    private readonly shopVisitModel: Model<ShopVisit>,
    @InjectModel(Sale.name)
    private readonly saleModel: Model<Sale>,
    private readonly routeCustomerMappingService: RouteCustomerMappingService,
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

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CUSTOMER.DUPLICATE);
    }
    throw error;
  }
}
