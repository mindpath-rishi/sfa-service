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
  ShopVisit,
  ShopVisitSchema,
} from 'src/core/database/mongo/schema/shop-visit.schema';

import { SHOP_VISIT } from './shop-visit.constants';
import { CreateShopVisitDto } from './dto/create-shop-visit.dto';
import { UpdateShopVisitDto } from './dto/update-shop-visit.dto';
import {
  ShopVisitQueryDto,
  ShopVisitStatusQueryDto,
} from './dto/shop-visit-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { RequestContextStore } from 'src/core/context/request-context';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';
import { ClientSession, Model } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { RouteSessionService } from '../route-session/route-session.service';
import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';
import { SaleStatus } from 'src/shared/enums/sale.enums';
import {
  Payment,
  PaymentSchema,
} from 'src/core/database/mongo/schema/payment.schema';
import { PaymentStatus } from 'src/shared/enums/payment.enums';

@Injectable()
export class ShopVisitService extends MongoRepository<ShopVisit> {
  private readonly saleModel: Model<Sale>;
  private readonly paymentModel: Model<Payment>;

  constructor(
    mongo: MongoService,
    private readonly customerService: CustomerService,
    private readonly routeSessionService: RouteSessionService,
  ) {
    super(mongo.getModel(ShopVisit.name, ShopVisitSchema));
    this.saleModel = mongo.getModel(Sale.name, SaleSchema);
    this.paymentModel = mongo.getModel(Payment.name, PaymentSchema);
  }

  async create(payload: CreateShopVisitDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { outletId, routeSessionId, vanId, workSessionId } = payload;
        const filter: FilterQuery<ShopVisit> = {
          outletId,
          routeSessionId,
          vanId,
          workSessionId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (
          existing &&
          !existing.isDeleted &&
          existing[ShopVisitStatus.ACTIVE]
        ) {
          throw new ConflictException(SHOP_VISIT.DUPLICATE);
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
            message: SHOP_VISIT.CREATED,
            data: { visitId: existing.visitId },
          };
        }

        const ctx = RequestContextStore.getStore();

        const doc = await this.save(
          {
            visitId: IdGenerator.generate('SHOP', 8),
            employeeId: ctx?.userId,
            checkInTime: new Date(),
            ...payload,
          },
          { session },
        );

        /**Updated Last visit date */
        await this.customerService.update(outletId, {
          lastVisitedAt: new Date(),
        });

        /** Updated Count of visited outlets */
        if (existing?.[ShopVisitStatus.COMPLETED] || !existing) {
          this.routeSessionService.update(routeSessionId, {
            $inc: { visitedShops: 1, remainingShops: -1 },
          } as any);
        }

        return {
          statusCode: HttpStatus.CREATED,
          message: SHOP_VISIT.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: ShopVisitQueryDto) {
    const {
      searchText,
      status,
      page = 1,
      limit = 20,
      workSessionId,
      routeSessionId,
      outletId,
      vanId,
    } = query;

    const filter: FilterQuery<ShopVisit> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ visitId: regex }];
    }

    if (workSessionId) {
      filter.workSessionId = workSessionId;
    }

    if (routeSessionId) {
      filter.routeSessionId = routeSessionId;
    }

    if (outletId) {
      filter.outletId = outletId;
    }

    if (vanId) {
      filter.vanId = vanId;
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    const baseItems = result.items.map((visit: any) =>
      typeof visit.toObject === 'function' ? visit.toObject() : visit,
    );
    const visitIds = baseItems.map((visit: any) => visit.visitId).filter(Boolean);
    let items = baseItems;

    if (visitIds.length) {
      const orderSummaries = await this.saleModel.aggregate([
        {
          $match: {
            visitId: { $in: visitIds },
            status: SaleStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: '$visitId',
            orderCount: { $sum: 1 },
            orderValue: { $sum: '$totalValue' },
            orderCases: { $sum: '$totalCases' },
            orderWeight: { $sum: '$totalWeight' },
            saleIds: { $push: '$saleId' },
          },
        },
      ]);

      const summaryByVisitId = new Map(
        orderSummaries.map((item: any) => [item._id, item]),
      );
      const saleIdToVisitId = new Map<string, string>();

      orderSummaries.forEach((summary: any) => {
        (summary.saleIds || []).forEach((saleId: string) => {
          saleIdToVisitId.set(saleId, summary._id);
        });
      });

      const saleIds = [...saleIdToVisitId.keys()];
      const paymentCountByVisitId = new Map<string, number>();

      if (saleIds.length) {
        const paymentSummaries = await this.paymentModel.aggregate([
          {
            $match: {
              status: PaymentStatus.SUCCESS,
              'sales.saleId': { $in: saleIds },
            },
          },
          {
            $project: {
              paymentId: 1,
              saleIds: '$sales.saleId',
            },
          },
        ]);

        paymentSummaries.forEach((payment: any) => {
          const visitIdsForPayment = new Set<string>();

          (payment.saleIds || []).forEach((saleId: string) => {
            const visitId = saleIdToVisitId.get(saleId);
            if (visitId) visitIdsForPayment.add(visitId);
          });

          visitIdsForPayment.forEach((visitId) => {
            paymentCountByVisitId.set(
              visitId,
              (paymentCountByVisitId.get(visitId) || 0) + 1,
            );
          });
        });
      }

      items = baseItems.map((visit: any) => ({
        ...visit,
        orderCount: summaryByVisitId.get(visit.visitId)?.orderCount || 0,
        orderValue: summaryByVisitId.get(visit.visitId)?.orderValue || 0,
        orderCases: summaryByVisitId.get(visit.visitId)?.orderCases || 0,
        orderWeight: summaryByVisitId.get(visit.visitId)?.orderWeight || 0,
        paymentCount: paymentCountByVisitId.get(visit.visitId) || 0,
      }));
    }

    return {
      statusCode: HttpStatus.OK,
      message: SHOP_VISIT.FETCHED,
      data: items,
      meta: result.meta,
    };
  }

  async status(query: ShopVisitStatusQueryDto) {
    console.log(query, '==================query=================');

    const match = Object.fromEntries(
      Object.entries({
        ...query,
        status: ShopVisitStatus.ACTIVE,
      }).filter(
        ([_, value]) => value !== undefined && value !== null && value !== '',
      ),
    );

    const pipeline: any[] = [
      {
        $match: match,
      },

      // 🔥 Join with customer_master
      {
        $lookup: {
          from: 'customer_master',
          localField: 'outletId',
          foreignField: 'outletId',
          as: 'outlet',
        },
      },

      // Convert array → object
      {
        $unwind: {
          path: '$outlet',
          preserveNullAndEmptyArrays: true,
        },
      },

      // Optional: clean response
      {
        $project: {
          visitId: 1,
          outletId: 1,
          outletName: 1,
          checkInTime: 1,
          checkOutTime: 1,
          routeSessionId: 1,
          status: 1,
          visitType: 1,

          // joined outlet data
          'outlet.customerId': 1,
          'outlet.name': 1,
          'outlet.phoneNumber': 1,
          'outlet.address': 1,
        },
      },

      { $limit: 1 },
    ];

    const result = await this.model.aggregate(pipeline);

    console.log(result[0], '=====================195=============');

    return {
      statusCode: HttpStatus.OK,
      message: SHOP_VISIT.FETCHED,
      data: result[0] || {},
    };
  }

  async findByVisitId(visitId: string) {
    const doc = await this.findOne({ visitId }, { lean: true });

    if (!doc) throw new NotFoundException(SHOP_VISIT.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: SHOP_VISIT.FETCHED,
      data: doc,
    };
  }

  async update(
    visitId: string,
    dto: UpdateShopVisitDto,
    session?: ClientSession,
  ) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ visitId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(SHOP_VISIT.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: SHOP_VISIT.UPDATED,
          data: doc,
        };
      }, session);
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(visitId: string) {
    const existing = await this.findOne({ visitId });

    if (!existing) throw new NotFoundException(SHOP_VISIT.NOT_FOUND);

    await this.softDelete({ visitId });

    return {
      statusCode: HttpStatus.OK,
      message: SHOP_VISIT.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(SHOP_VISIT.DUPLICATE);
    }
    throw error;
  }
}
