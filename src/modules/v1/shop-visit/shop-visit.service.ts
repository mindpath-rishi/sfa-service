
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { ShopVisit, ShopVisitSchema } from 'src/core/database/mongo/schema/shop-visit.schema';

import { SHOP_VISIT } from './shop-visit.constants';
import { CreateShopVisitDto } from './dto/create-shop-visit.dto';
import { UpdateShopVisitDto } from './dto/update-shop-visit.dto';
import { ShopVisitQueryDto } from './dto/shop-visit-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class ShopVisitService extends MongoRepository<ShopVisit> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(ShopVisit.name, ShopVisitSchema));
  }

  async create(payload: CreateShopVisitDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<ShopVisit> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
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

        const doc = await this.save(
          {
            visitId: IdGenerator.generate('SHOP', 8),
            ...payload,
          },
          { session },
        );

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
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<ShopVisit> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ visitId: regex }];
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

  async findByVisitId(visitId: string) {
    const doc = await this.findOne({ visitId }, { lean: true });

    if (!doc) throw new NotFoundException(SHOP_VISIT.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: SHOP_VISIT.FETCHED,
      data: doc,
    };
  }

  async update(visitId: string, dto: UpdateShopVisitDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { visitId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(SHOP_VISIT.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: SHOP_VISIT.UPDATED,
          data: doc,
        };
      });
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
