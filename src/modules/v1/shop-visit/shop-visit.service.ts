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
import { ClientSession } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { RouteSessionService } from '../route-session/route-session.service';

@Injectable()
export class ShopVisitService extends MongoRepository<ShopVisit> {
  constructor(
    mongo: MongoService,
    private readonly customerService: CustomerService,
    private readonly routeSessionService: RouteSessionService,
  ) {
    super(mongo.getModel(ShopVisit.name, ShopVisitSchema));
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
        if ((existing?.[ShopVisitStatus.COMPLETED]) || !existing) {
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

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: SHOP_VISIT.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async status(query: ShopVisitStatusQueryDto) {
    console.log(query, '==================query=================');
    const pipeline: any[] = [
      {
        $match: {
          ...query,
          status: ShopVisitStatus.ACTIVE,
        },
      },

      // 🔥 Join with customer_master
      {
        $lookup: {
          from: 'customer_master', // collection name
          localField: 'customerId',
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
