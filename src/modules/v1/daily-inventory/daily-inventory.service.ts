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
  DailyInventory,
  DailyInventorySchema,
} from 'src/core/database/mongo/schema/daily-inventory.schema';

import { DAILY_INVENTORY } from './daily-inventory.constants';
import { CreateDailyInventoryDto } from './dto/create-daily-inventory.dto';
import { UpdateDailyInventoryDto } from './dto/update-daily-inventory.dto';
import { DailyInventoryQueryDto } from './dto/daily-inventory-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class DailyInventoryService extends MongoRepository<DailyInventory> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(DailyInventory.name, DailyInventorySchema));
  }

  async create(payload: CreateDailyInventoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<DailyInventory> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(DAILY_INVENTORY.DUPLICATE);
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
            message: DAILY_INVENTORY.CREATED,
            data: { dailyInventoryId: existing.dailyInventoryId },
          };
        }

        const doc = await this.save(
          {
            dailyInventoryId: IdGenerator.generate('DAIL', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: DAILY_INVENTORY.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: DailyInventoryQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<DailyInventory> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ dailyInventoryId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: DAILY_INVENTORY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByDailyInventoryId(dailyInventoryId: string) {
    const doc = await this.findOne({ dailyInventoryId }, { lean: true });

    if (!doc) throw new NotFoundException(DAILY_INVENTORY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: DAILY_INVENTORY.FETCHED,
      data: doc,
    };
  }

  async update(dailyInventoryId: string, dto: UpdateDailyInventoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ dailyInventoryId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(DAILY_INVENTORY.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: DAILY_INVENTORY.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(dailyInventoryId: string) {
    const existing = await this.findOne({ dailyInventoryId });

    if (!existing) throw new NotFoundException(DAILY_INVENTORY.NOT_FOUND);

    await this.softDelete({ dailyInventoryId });

    return {
      statusCode: HttpStatus.OK,
      message: DAILY_INVENTORY.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(DAILY_INVENTORY.DUPLICATE);
    }
    throw error;
  }
}
