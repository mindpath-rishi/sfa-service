
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { StockCount, StockCountSchema } from 'src/core/database/mongo/schema/stock-count.schema';

import { STOCK_COUNT } from './stock-count.constants';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { UpdateStockCountDto } from './dto/update-stock-count.dto';
import { StockCountQueryDto } from './dto/stock-count-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class StockCountService extends MongoRepository<StockCount> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(StockCount.name, StockCountSchema));
  }

  async create(payload: CreateStockCountDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<StockCount> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(STOCK_COUNT.DUPLICATE);
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
            message: STOCK_COUNT.CREATED,
            data: { stockCountId: existing.stockCountId },
          };
        }

        const doc = await this.save(
          {
            stockCountId: IdGenerator.generate('STOC', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: STOCK_COUNT.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: StockCountQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<StockCount> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ stockCountId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_COUNT.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByStockCountId(stockCountId: string) {
    const doc = await this.findOne({ stockCountId }, { lean: true });

    if (!doc) throw new NotFoundException(STOCK_COUNT.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_COUNT.FETCHED,
      data: doc,
    };
  }

  async update(stockCountId: string, dto: UpdateStockCountDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { stockCountId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(STOCK_COUNT.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: STOCK_COUNT.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(stockCountId: string) {
    const existing = await this.findOne({ stockCountId });

    if (!existing) throw new NotFoundException(STOCK_COUNT.NOT_FOUND);

    await this.softDelete({ stockCountId });

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_COUNT.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(STOCK_COUNT.DUPLICATE);
    }
    throw error;
  }
}
