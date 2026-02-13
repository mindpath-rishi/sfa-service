
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { Inventory, InventorySchema } from 'src/core/database/mongo/schema/inventory.schema';

import { INVENTORY } from './inventory.constants';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class InventoryService extends MongoRepository<Inventory> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Inventory.name, InventorySchema));
  }

  async create(payload: CreateInventoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<Inventory> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(INVENTORY.DUPLICATE);
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
            message: INVENTORY.CREATED,
            data: { inventoryId: existing.inventoryId },
          };
        }

        const doc = await this.save(
          {
            inventoryId: IdGenerator.generate('INVE', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: INVENTORY.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: InventoryQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Inventory> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ inventoryId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: INVENTORY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByInventoryId(inventoryId: string) {
    const doc = await this.findOne({ inventoryId }, { lean: true });

    if (!doc) throw new NotFoundException(INVENTORY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: INVENTORY.FETCHED,
      data: doc,
    };
  }

  async update(inventoryId: string, dto: UpdateInventoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { inventoryId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(INVENTORY.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: INVENTORY.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(inventoryId: string) {
    const existing = await this.findOne({ inventoryId });

    if (!existing) throw new NotFoundException(INVENTORY.NOT_FOUND);

    await this.softDelete({ inventoryId });

    return {
      statusCode: HttpStatus.OK,
      message: INVENTORY.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(INVENTORY.DUPLICATE);
    }
    throw error;
  }
}
