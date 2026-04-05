import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';



import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { CreateSaleItemDto } from './dto/create-sale-item.dto';
import { SaleItemQueryDto } from './dto/sale-item-query.dto';
import { UpdateSaleItemDto } from './dto/update-sale-item.dto';
import { SALE_ITEM } from './sale-item.constants';
import { SaleItem, SaleItemSchema } from 'src/core/database/mongo/schema/sale-item.schema';

@Injectable()
export class SaleItemService extends MongoRepository<SaleItem> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(SaleItem.name, SaleItemSchema));
  }

  async create(payload: CreateSaleItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { productId, saleId } = payload;
        const filter: FilterQuery<SaleItem> = {
          productId,
          saleId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(SALE_ITEM.DUPLICATE);
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
            message: SALE_ITEM.CREATED,
            data: { saleId: existing.saleId },
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
          message: SALE_ITEM.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: SaleItemQueryDto) {
    const { searchText, page = 1, limit = 20 } = query;

    const filter: FilterQuery<SaleItem> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ saleId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: SALE_ITEM.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findBySaleId(saleId: string) {
    const doc = await this.findOne({ saleId }, { lean: true });

    if (!doc) throw new NotFoundException(SALE_ITEM.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: SALE_ITEM.FETCHED,
      data: doc,
    };
  }

  async update(saleId: string, dto: UpdateSaleItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ saleId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(SALE_ITEM.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: SALE_ITEM.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }
  /* ======================================================
   * CREATE MANY (USED BY SALES SERVICE)
   * ====================================================== */

  async insertMany(items: Partial<SaleItem>[], session?: any) {
    try {
      if (!items?.length) return [];

      // 1. Check duplicates inside request itself
      const seen = new Set();
      for (const item of items) {
        const key = `${item.saleId}_${item.productId}`;
        if (seen.has(key)) {
          throw new ConflictException(
            `Duplicate item in request for saleId=${item.saleId} and productId=${item.productId}`,
          );
        }
        seen.add(key);
      }

      // 2. Check duplicates in DB
      const orConditions = items.map((item) => ({
        saleId: item.saleId,
        productId: item.productId,
      }));

      const existing = await this.model.find(
        { $or: orConditions },
        { saleId: 1, productId: 1 },
        { session },
      );

      if (existing.length) {
        const duplicates = existing.map(
          (e) => `saleId=${e.saleId}, productId=${e.productId}`,
        );

        throw new ConflictException(
          `Duplicate entries already exist: ${duplicates.join(' | ')}`,
        );
      }

      // 3. Insert if no duplicates
      const docs = await this.model.insertMany(items, {
        session,
        ordered: true,
      });

      return docs;
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(saleId: string) {
    const existing = await this.findOne({ saleId });

    if (!existing) throw new NotFoundException(SALE_ITEM.NOT_FOUND);

    await this.softDelete({ saleId });

    return {
      statusCode: HttpStatus.OK,
      message: SALE_ITEM.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(SALE_ITEM.DUPLICATE);
    }
    throw error;
  }
}
