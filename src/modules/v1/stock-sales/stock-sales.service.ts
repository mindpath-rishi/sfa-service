
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { StockSales, StockSalesSchema } from 'src/core/database/mongo/schema/stock-sales.schema';

import { STOCK_SALES } from './stock-sales.constants';
import { CreateStockSalesDto } from './dto/create-stock-sales.dto';
import { UpdateStockSalesDto } from './dto/update-stock-sales.dto';
import { StockSalesQueryDto } from './dto/stock-sales-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class StockSalesService extends MongoRepository<StockSales> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(StockSales.name, StockSalesSchema));
  }

  async create(payload: CreateStockSalesDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<StockSales> = {};

        
        if (payload.stockSalesNumber) filter.stockSalesNumber = payload.stockSalesNumber;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(STOCK_SALES.DUPLICATE);
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
            message: STOCK_SALES.CREATED,
            data: { stockSalesId: existing.stockSalesId },
          };
        }

        const doc = await this.save(
          {
            stockSalesId: IdGenerator.generate('STOC', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: STOCK_SALES.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: StockSalesQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<StockSales> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ stockSalesId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_SALES.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByStockSalesId(stockSalesId: string) {
    const doc = await this.findOne({ stockSalesId }, { lean: true });

    if (!doc) throw new NotFoundException(STOCK_SALES.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_SALES.FETCHED,
      data: doc,
    };
  }

  async update(stockSalesId: string, dto: UpdateStockSalesDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { stockSalesId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(STOCK_SALES.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: STOCK_SALES.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(stockSalesId: string) {
    const existing = await this.findOne({ stockSalesId });

    if (!existing) throw new NotFoundException(STOCK_SALES.NOT_FOUND);

    await this.softDelete({ stockSalesId });

    return {
      statusCode: HttpStatus.OK,
      message: STOCK_SALES.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(STOCK_SALES.DUPLICATE);
    }
    throw error;
  }
}
