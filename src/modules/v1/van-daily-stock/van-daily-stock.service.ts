
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { VanDailyStock, VanDailyStockSchema } from 'src/core/database/mongo/schema/van-daily-stock.schema';

import { VAN_DAILY_STOCK } from './van-daily-stock.constants';
import { CreateVanDailyStockDto } from './dto/create-van-daily-stock.dto';
import { UpdateVanDailyStockDto } from './dto/update-van-daily-stock.dto';
import { VanDailyStockQueryDto } from './dto/van-daily-stock-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class VanDailyStockService extends MongoRepository<VanDailyStock> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(VanDailyStock.name, VanDailyStockSchema));
  }

  async create(payload: CreateVanDailyStockDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<VanDailyStock> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_DAILY_STOCK.DUPLICATE);
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
            message: VAN_DAILY_STOCK.CREATED,
            data: { vanDailyStockId: existing.vanDailyStockId },
          };
        }

        const doc = await this.save(
          {
            vanDailyStockId: IdGenerator.generate('VAN_', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: VAN_DAILY_STOCK.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanDailyStockQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<VanDailyStock> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ vanDailyStockId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_DAILY_STOCK.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByVanDailyStockId(vanDailyStockId: string) {
    const doc = await this.findOne({ vanDailyStockId }, { lean: true });

    if (!doc) throw new NotFoundException(VAN_DAILY_STOCK.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_DAILY_STOCK.FETCHED,
      data: doc,
    };
  }

  async update(vanDailyStockId: string, dto: UpdateVanDailyStockDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { vanDailyStockId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(VAN_DAILY_STOCK.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_DAILY_STOCK.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(vanDailyStockId: string) {
    const existing = await this.findOne({ vanDailyStockId });

    if (!existing) throw new NotFoundException(VAN_DAILY_STOCK.NOT_FOUND);

    await this.softDelete({ vanDailyStockId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_DAILY_STOCK.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_DAILY_STOCK.DUPLICATE);
    }
    throw error;
  }
}
