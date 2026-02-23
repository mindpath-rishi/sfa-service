
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { VanInventoryTopup, VanInventoryTopupSchema } from 'src/core/database/mongo/schema/van-inventory-topup.schema';

import { VAN_INVENTORY_TOPUP } from './van-inventory-topup.constants';
import { CreateVanInventoryTopupDto } from './dto/create-van-inventory-topup.dto';
import { UpdateVanInventoryTopupDto } from './dto/update-van-inventory-topup.dto';
import { VanInventoryTopupQueryDto } from './dto/van-inventory-topup-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class VanInventoryTopupService extends MongoRepository<VanInventoryTopup> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(VanInventoryTopup.name, VanInventoryTopupSchema));
  }

  async create(payload: CreateVanInventoryTopupDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<VanInventoryTopup> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
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
            message: VAN_INVENTORY_TOPUP.CREATED,
            data: { vanInventoryTopupId: existing.vanInventoryTopupId },
          };
        }

        const doc = await this.save(
          {
            vanInventoryTopupId: IdGenerator.generate('VAN_', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: VAN_INVENTORY_TOPUP.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanInventoryTopupQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<VanInventoryTopup> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ vanInventoryTopupId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByVanInventoryTopupId(vanInventoryTopupId: string) {
    const doc = await this.findOne({ vanInventoryTopupId }, { lean: true });

    if (!doc) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.FETCHED,
      data: doc,
    };
  }

  async update(vanInventoryTopupId: string, dto: UpdateVanInventoryTopupDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { vanInventoryTopupId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_INVENTORY_TOPUP.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(vanInventoryTopupId: string) {
    const existing = await this.findOne({ vanInventoryTopupId });

    if (!existing) throw new NotFoundException(VAN_INVENTORY_TOPUP.NOT_FOUND);

    await this.softDelete({ vanInventoryTopupId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
    }
    throw error;
  }
}
