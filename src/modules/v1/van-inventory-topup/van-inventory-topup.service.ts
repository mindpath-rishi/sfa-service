import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  VanInventoryTopup,
  VanInventoryTopupSchema,
} from 'src/core/database/mongo/schema/van-inventory-topup.schema';

import { VAN_INVENTORY_TOPUP } from './van-inventory-topup.constants';
import { CreateVanInventoryTopupDto } from './dto/create-van-inventory-topup.dto';
import { UpdateVanInventoryTopupDto } from './dto/update-van-inventory-topup.dto';
import { VanInventoryTopupQueryDto } from './dto/van-inventory-topup-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { VanInventoryTopupItemService } from '../van-inventory-topup-item/van-inventory-topup-item.service';
import { ProductService } from '../product/product.service';

@Injectable()
export class VanInventoryTopupService extends MongoRepository<VanInventoryTopup> {
  constructor(
    mongo: MongoService,
    private readonly vanInventoryTopupItemService: VanInventoryTopupItemService,
    private readonly productService: ProductService,
  ) {
    super(mongo.getModel(VanInventoryTopup.name, VanInventoryTopupSchema));
  }

  async create(payload: CreateVanInventoryTopupDto) {
    try {
      return await this.withTransaction(async (session) => {
        /**
         * 1. Validate duplicate products
         */
        if (payload.items?.length) {
          const seen = new Set();

          for (const item of payload.items) {
            if (seen.has(item.productId)) {
              throw new ConflictException(
                `Duplicate product in items: ${item.productId}`,
              );
            }
            seen.add(item.productId);
          }
        }

        /**
         * 2. Calculate totals using product data (IMPORTANT)
         */
        let totalRequestedQty = 0;
        let totalRequestedWeight = 0;
        let totalRequestedValue = 0;

        const processedItems: any[] = [];

        for (const item of payload.items) {
          /**
           * Fetch product (like sales)
           */
          const response = await this.productService.findByProductId(
            item.productId,
          );
          const product = response?.data;

          if (!product) {
            throw new BadRequestException(
              `Product not found: ${item.productId}`,
            );
          }

          const unitQtyInCase = product.unitQtyInCase || 1;
          const casePrice = product.casePrice || 0;

          /**
           * If you have direct qty → use it
           * OR if case/piece → calculate (adjust based on your DTO)
           */
          const requestedQty = item.requestedQty || 0;

          const piecePrice = casePrice / unitQtyInCase;

          /**
           * Value calculation (case-based logic)
           */
          const requestedValue = requestedQty * piecePrice;

          const pieceWeight = product.pieceWeight || 0;
          const requestedWeight = requestedQty * pieceWeight;

          /**
           * Accumulate totals
           */
          totalRequestedQty += requestedQty;
          totalRequestedWeight += requestedWeight;
          totalRequestedValue += requestedValue;

          /**
           * Prepare item
           */
          processedItems.push({
            vanInventoryTopupId: '',

            productId: item.productId,
            productName: product.name,

            requestedQty,
            requestedWeight,
            requestedValue,

            casePrice,
            unitQtyInCase,
            piecePrice,
          });
        }

        /**
         * 3. Validate totals (ANTI-TAMPER)
         */
        if (
          (payload.totalRequestedQty ?? totalRequestedQty) !==
            totalRequestedQty ||
          (payload.totalRequestedWeight ?? totalRequestedWeight) !==
            totalRequestedWeight ||
          (payload.totalRequestedValue ?? totalRequestedValue) !==
            totalRequestedValue
        ) {
          throw new ConflictException('Requested totals mismatch with items');
        }

        /**
         * 4. Check duplicate parent
         */
        const filter: FilterQuery<VanInventoryTopup> = {
          vanId: payload.vanId,
          warehouseId: payload.warehouseId,
          date: payload.date,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_INVENTORY_TOPUP.DUPLICATE);
        }

        /**
         * 5. Create parent
         */
        const vanInventoryTopupId = IdGenerator.generate('VAN_', 8);

        const doc = await this.save(
          {
            vanInventoryTopupId,
            ...payload,

            totalRequestedQty,
            totalRequestedWeight,
            totalRequestedValue,
          },
          { session },
        );

        /**
         * 6. Attach parent id to items
         */
        const itemsToInsert = processedItems.map((item) => ({
          ...item,
          vanInventoryTopupId,
        }));

        /**
         * 7. Insert items
         */
        await this.vanInventoryTopupItemService.insertMany(
          itemsToInsert,
          session,
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
        const doc = await this.updateOne({ vanInventoryTopupId }, dto, {
          session,
          new: true,
        });

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
