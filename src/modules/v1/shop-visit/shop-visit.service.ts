import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
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
import {
  ShopVisitStatus,
  ShopVisitType,
} from 'src/shared/enums/shop-visit.enums';
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
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import {
  InteractionLog,
  InteractionLogSchema,
  InteractionAbandonReason,
  InteractionStatus,
} from 'src/core/database/mongo/schema/interaction-log.schema';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ShopVisitService extends MongoRepository<ShopVisit> {
  private readonly saleModel: Model<Sale>;
  private readonly paymentModel: Model<Payment>;
  private readonly interactionModel: Model<InteractionLog>;

  constructor(
    mongo: MongoService,
    private readonly customerService: CustomerService,
    private readonly routeSessionService: RouteSessionService,
    private readonly configService: ConfigService,
  ) {
    super(mongo.getModel(ShopVisit.name, ShopVisitSchema));
    this.saleModel = mongo.getModel(Sale.name, SaleSchema);
    this.paymentModel = mongo.getModel(Payment.name, PaymentSchema);
    this.interactionModel = mongo.getModel(
      InteractionLog.name,
      InteractionLogSchema,
    );
  }

  async createInteraction(payload: CreateInteractionDto) {
    const ctx = RequestContextStore.getStore();
    const employeeId = String(ctx?.userId ?? '');
    const role = String(ctx?.role ?? '')
      .trim()
      .toUpperCase();
    if (
      !employeeId ||
      !['SALESMAN', 'SALES', 'SALES_EXECUTIVE'].includes(role)
    ) {
      throw new ForbiddenException('Only a salesman can start an interaction');
    }
    const customer = await this.customerService.findOne({
      customerId: payload.customerId,
    });
    if (!customer || customer.status !== CustomerStatus.ACTIVE) {
      throw new ConflictException(
        'Interactions require a verified, active customer',
      );
    }
    if (!customer.geoTag) {
      throw new ConflictException(
        'Customer does not have a registered GPS location',
      );
    }

    await this.expireTimedOutInteractions(employeeId);
    const existing = await this.interactionModel.findOne({
      employeeId,
      status: InteractionStatus.ARRIVED,
    });

    if (existing?.customerId === payload.customerId) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Interaction already arrived',
        data: existing,
      };
    }

    if (existing) {
      await this.interactionModel.updateOne(
        { _id: existing._id, status: InteractionStatus.ARRIVED },
        {
          status: InteractionStatus.ABANDONED,
          abandonedAt: new Date(),
          abandonReason: InteractionAbandonReason.CUSTOMER_CHANGED,
        },
      );
    }

    const customerLat = Number(customer.geoTag.lat);
    const customerLng = Number(customer.geoTag.lng);
    const salesmanLat = Number(payload.salesmanLocation.latitude);
    const salesmanLng = Number(payload.salesmanLocation.longitude);
    if (![salesmanLat, salesmanLng].every(Number.isFinite)) {
      throw new ConflictException(
        'A valid current salesman GPS location is required',
      );
    }
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const dLat = toRadians(salesmanLat - customerLat);
    const dLng = toRadians(salesmanLng - customerLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(customerLat)) *
        Math.cos(toRadians(salesmanLat)) *
        Math.sin(dLng / 2) ** 2;
    const distanceMeters =
      6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const radius = this.configService.get<number>(
      'CUSTOMER_GEOFENCE_RADIUS_METERS',
      100,
    );
    const arrivalTime = new Date();
    const visitType =
      distanceMeters <= radius ? ShopVisitType.ON_SITE : ShopVisitType.OFF_SITE;

    const doc = await this.interactionModel.create({
      interactionId: IdGenerator.generate('InteractionLog', 10),
      customerId: payload.customerId,
      employeeId,
      routeSessionId: payload.routeSessionId,
      workSessionId: payload.workSessionId,
      vanId: payload.vanId,
      customerLocation: { latitude: customerLat, longitude: customerLng },
      arrivalLocation: payload.salesmanLocation,
      distanceMeters: Number(distanceMeters.toFixed(2)),
      configuredRadiusMeters: radius,
      visitType,
      arrivalTime,
      status: InteractionStatus.ARRIVED,
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Interaction arrived',
      data: doc,
    };
  }

  async getInteraction(interactionId: string) {
    const employeeId = String(RequestContextStore.getStore()?.userId ?? '');
    await this.expireTimedOutInteractions(employeeId);
    const doc = await this.interactionModel.findOne({
      interactionId,
      employeeId,
    });
    if (!doc) throw new NotFoundException('Interaction not found');
    return {
      statusCode: HttpStatus.OK,
      message: 'Interaction loaded',
      data: doc,
    };
  }

  private async expireTimedOutInteractions(employeeId: string) {
    if (!employeeId) return;
    const timeoutBefore = new Date(Date.now() - 30 * 60 * 1000);
    await this.interactionModel.updateMany(
      {
        employeeId,
        status: InteractionStatus.ARRIVED,
        arrivalTime: { $lte: timeoutBefore },
      },
      {
        status: InteractionStatus.ABANDONED,
        abandonedAt: new Date(),
        abandonReason: InteractionAbandonReason.TIMEOUT,
      },
    );
  }

  async create(payload: CreateShopVisitDto) {
    const ctx = RequestContextStore.getStore();
    const role = String(ctx?.role ?? '')
      .trim()
      .toUpperCase();

    if (!['SALESMAN', 'SALES', 'SALES_EXECUTIVE'].includes(role)) {
      throw new ForbiddenException('Only a salesman can start a visit');
    }

    try {
      return await this.withTransaction(async (session) => {
        const { outletId, routeSessionId, vanId, workSessionId } = payload;
        const employeeId = String(ctx?.userId ?? '');
        await this.expireTimedOutInteractions(employeeId);
        const interaction = payload.interactionId
          ? await this.interactionModel
              .findOne({
                interactionId: payload.interactionId,
                customerId: outletId,
                employeeId,
                status: InteractionStatus.ARRIVED,
              })
              .session(session)
          : null;

        if (!payload.interactionId || !interaction) {
          throw new ConflictException(
            'A valid arrived interaction is required',
          );
        }
        const customer = await this.customerService.findOne(
          { customerId: outletId },
          { session },
        );

        if (!customer) {
          throw new NotFoundException('Customer not found');
        }

        if (customer.status !== CustomerStatus.ACTIVE) {
          throw new ConflictException(
            'Visits can only be created for verified, active customers',
          );
        }

        const activeVisit = await this.findOne(
          {
            outletId,
            status: ShopVisitStatus.ACTIVE,
          },
          { session },
        );

        if (activeVisit) {
          throw new ConflictException(
            `An active visit already exists for this customer (${activeVisit.visitId})`,
          );
        }

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

        const doc = await this.save(
          {
            visitId: IdGenerator.generate('SHOP', 8),
            employeeId: ctx?.userId,
            ...payload,
            checkInTime: interaction?.arrivalTime ?? new Date(),
            checkInLocation:
              interaction?.arrivalLocation ?? payload.checkInLocation,
            visitType: interaction!.visitType,
            interactionId: interaction?.interactionId,
            customerLocation: interaction?.customerLocation,
            distanceMeters: interaction?.distanceMeters,
            configuredRadiusMeters: interaction?.configuredRadiusMeters,
          },
          { session },
        );

        if (interaction) {
          await this.interactionModel.updateOne(
            { _id: interaction._id, status: InteractionStatus.ARRIVED },
            { status: InteractionStatus.CONVERTED, visitId: doc.visitId },
            { session },
          );
        }

        /**Updated Last visit date */
        await this.customerService.update(outletId, {
          lastVisitedAt: new Date(),
        } as any);

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
    const visitIds = baseItems
      .map((visit: any) => visit.visitId)
      .filter(Boolean);
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
        const existing = await this.findOne({ visitId }, { session });
        if (!existing) throw new NotFoundException(SHOP_VISIT.NOT_FOUND);
        const completion = dto.status === ShopVisitStatus.COMPLETED;
        const checkOutTime = completion
          ? (dto.checkOutTime ?? new Date())
          : dto.checkOutTime;
        const durationSeconds = completion
          ? Math.max(
              0,
              Math.round(
                (checkOutTime!.getTime() - existing.checkInTime.getTime()) /
                  1000,
              ),
            )
          : existing.durationSeconds;
        const doc = await this.updateOne(
          { visitId },
          {
            ...dto,
            ...(completion && {
              checkOutTime,
              durationSeconds,
              outcome: existing.outcome ?? 'BUSINESS_COMPLETED',
            }),
          },
          {
            session,
            new: true,
          },
        );

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
