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
  NonSale,
  NonSaleSchema,
} from 'src/core/database/mongo/schema/non-sale.schema';

import { NON_SALE } from './non-sale.constants';
import { CreateNonSaleDto } from './dto/create-non-sale.dto';
import { UpdateNonSaleDto } from './dto/update-non-sale.dto';
import { NonSaleQueryDto } from './dto/non-sale-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { ShopVisitService } from '../shop-visit/shop-visit.service';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';
import { RequestContextStore } from 'src/core/context/request-context';


@Injectable()
export class NonSaleService extends MongoRepository<NonSale> {
  constructor(
    mongo: MongoService,
    private readonly shopVisitService: ShopVisitService,
  ) {
    super(mongo.getModel(NonSale.name, NonSaleSchema));
  }

  async create(payload: CreateNonSaleDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { visitId, outletId, vanId } = payload;
        const ctx = RequestContextStore.getStore();

        const filter: FilterQuery<NonSale> = {
          visitId,
          outletId,
          vanId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(NON_SALE.DUPLICATE);
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
            message: NON_SALE.CREATED,
            data: { nonSaleId: existing.nonSaleId },
          };
        }

        const doc = await this.save(
          {
            nonSaleId: IdGenerator.generate('NON-', 8),
            employeeId: ctx?.userId,
            ...payload,
          },
          { session },
        );

        /* Mark visit completed*/
        await this.shopVisitService.update(
          visitId,
          {
            checkOutTime: new Date(),
            status: ShopVisitStatus.COMPLETED,
          },
          session,
        );

        // /**Updated Last visit date */
        // await this.customerService.update(outletId, {
        //   lastVisitedAt: new Date(),
        // });

        // /** Updated Count of visited outlets */
        // this.routeSessionService.update(routeSessionId, {
        //   $inc: { visitedShops: 1, remainingShops: -1 },
        // } as any);

        return {
          statusCode: HttpStatus.CREATED,
          message: NON_SALE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: NonSaleQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<NonSale> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ nonSaleId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: NON_SALE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByNonSaleId(nonSaleId: string) {
    const doc = await this.findOne({ nonSaleId }, { lean: true });

    if (!doc) throw new NotFoundException(NON_SALE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: NON_SALE.FETCHED,
      data: doc,
    };
  }

  async update(nonSaleId: string, dto: UpdateNonSaleDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ nonSaleId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(NON_SALE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: NON_SALE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(nonSaleId: string) {
    const existing = await this.findOne({ nonSaleId });

    if (!existing) throw new NotFoundException(NON_SALE.NOT_FOUND);

    await this.softDelete({ nonSaleId });

    return {
      statusCode: HttpStatus.OK,
      message: NON_SALE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(NON_SALE.DUPLICATE);
    }
    throw error;
  }
}
