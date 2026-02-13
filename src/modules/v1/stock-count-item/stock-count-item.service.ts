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
  StockCountItem,
  StockCountItemSchema,
} from 'src/core/database/mongo/schema/stock-count-item.schema';

import { STOCK_COUNT_ITEM } from './stock-count-item.constants';
import { CreateStockCountItemDto } from './dto/create-stock-count-item.dto';
import { UpdateStockCountItemDto } from './dto/update-stock-count-item.dto';
import { StockCountItemQueryDto } from './dto/stock-count-item-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class StockCountItemService extends MongoRepository<StockCountItem> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(StockCountItem.name, StockCountItemSchema));
  }

  async create(payload: CreateStockCountItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<StockCountItem> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(STOCK_COUNT_ITEM.DUPLICATE);
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
            message: STOCK_COUNT_ITEM.CREATED,
            data: { stockCountId: existing.stockCountId },
          };
        }

        const doc = await this.save(
          {
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: STOCK_COUNT_ITEM.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: StockCountItemQueryDto) {
    const { searchText, page = 1, limit = 20 } = query;

    const filter: FilterQuery<StockCountItem> = {};

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
      message: STOCK_COUNT_ITEM.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByStockCountId(stockCountId: string) {
    const doc = await this.findOne({ stockCountId }, { lean: true });

    if (!doc) throw new NotFoundException(STOCK_COUNT_ITEM.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_COUNT_ITEM.FETCHED,
      data: doc,
    };
  }

  async update(stockCountId: string, dto: UpdateStockCountItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ stockCountId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(STOCK_COUNT_ITEM.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: STOCK_COUNT_ITEM.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(stockCountId: string) {
    const existing = await this.findOne({ stockCountId });

    if (!existing) throw new NotFoundException(STOCK_COUNT_ITEM.NOT_FOUND);

    await this.softDelete({ stockCountId });

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_COUNT_ITEM.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(STOCK_COUNT_ITEM.DUPLICATE);
    }
    throw error;
  }
}
