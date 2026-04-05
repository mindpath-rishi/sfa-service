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
  VanInventoryTopupItem,
  VanInventoryTopupItemSchema,
} from 'src/core/database/mongo/schema/van-inventory-topup-item.schema';

import { VAN_INVENTORY_TOPUP_ITEM } from './van-inventory-topup-item.constants';
import { CreateVanInventoryTopupItemDto } from './dto/create-van-inventory-topup-item.dto';
import { UpdateVanInventoryTopupItemDto } from './dto/update-van-inventory-topup-item.dto';
import { VanInventoryTopupItemQueryDto } from './dto/van-inventory-topup-item-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class VanInventoryTopupItemService extends MongoRepository<VanInventoryTopupItem> {
  constructor(mongo: MongoService) {
    super(
      mongo.getModel(VanInventoryTopupItem.name, VanInventoryTopupItemSchema),
    );
  }

  async create(payload: CreateVanInventoryTopupItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { vanInventoryTopupId, productId } = payload;

        const filter: FilterQuery<VanInventoryTopupItem> = {
          vanInventoryTopupId,
          productId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_INVENTORY_TOPUP_ITEM.DUPLICATE);
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
            message: VAN_INVENTORY_TOPUP_ITEM.CREATED,
            data: { vanInventoryTopupId: existing.vanInventoryTopupId },
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
          message: VAN_INVENTORY_TOPUP_ITEM.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  /* ======================================================
   * INSERT MANY (USED BY VAN INVENTORY TOPUP)
   * ====================================================== */

  async insertMany(items: Partial<VanInventoryTopupItem>[], session?: any) {
    try {
      if (!items?.length) return [];

      /**
       * 1. Check duplicates inside request
       */
      const seen = new Set();
      for (const item of items) {
        const key = `${item.vanInventoryTopupId}_${item.productId}`;

        if (seen.has(key)) {
          throw new ConflictException(
            `Duplicate item in request for vanInventoryTopupId=${item.vanInventoryTopupId} and productId=${item.productId}`,
          );
        }

        seen.add(key);
      }

      /**
       * 2. Check duplicates in DB
       */
      const orConditions = items.map((item) => ({
        vanInventoryTopupId: item.vanInventoryTopupId,
        productId: item.productId,
      }));

      const existing = await this.model.find(
        { $or: orConditions },
        { vanInventoryTopupId: 1, productId: 1 },
        { session },
      );

      if (existing.length) {
        const duplicates = existing.map(
          (e) =>
            `vanInventoryTopupId=${e.vanInventoryTopupId}, productId=${e.productId}`,
        );

        throw new ConflictException(
          `Duplicate entries already exist: ${duplicates.join(' | ')}`,
        );
      }

      /**
       * 3. Insert
       */
      return await this.model.insertMany(items, {
        session,
        ordered: true,
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanInventoryTopupItemQueryDto) {
    const { searchText, page = 1, limit = 20 } = query;

    const filter: FilterQuery<VanInventoryTopupItem> = {};

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
      message: VAN_INVENTORY_TOPUP_ITEM.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByVanInventoryTopupId(vanInventoryTopupId: string) {
    const doc = await this.findOne({ vanInventoryTopupId }, { lean: true });

    if (!doc) throw new NotFoundException(VAN_INVENTORY_TOPUP_ITEM.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP_ITEM.FETCHED,
      data: doc,
    };
  }

  async update(
    vanInventoryTopupId: string,
    dto: UpdateVanInventoryTopupItemDto,
  ) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ vanInventoryTopupId }, dto, {
          session,
          new: true,
        });

        if (!doc)
          throw new NotFoundException(VAN_INVENTORY_TOPUP_ITEM.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_INVENTORY_TOPUP_ITEM.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(vanInventoryTopupId: string) {
    const existing = await this.findOne({ vanInventoryTopupId });

    if (!existing)
      throw new NotFoundException(VAN_INVENTORY_TOPUP_ITEM.NOT_FOUND);

    await this.softDelete({ vanInventoryTopupId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY_TOPUP_ITEM.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_INVENTORY_TOPUP_ITEM.DUPLICATE);
    }
    throw error;
  }
}
