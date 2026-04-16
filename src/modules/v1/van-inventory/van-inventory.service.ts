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
  VanInventory,
  VanInventorySchema,
} from 'src/core/database/mongo/schema/van-inventory.schema';

import { VAN_INVENTORY } from './van-inventory.constants';
import { CreateVanInventoryDto } from './dto/create-van-inventory.dto';
import { UpdateVanInventoryDto } from './dto/update-van-inventory.dto';
import { VanInventoryQueryDto } from './dto/van-inventory-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class VanInventoryService extends MongoRepository<VanInventory> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(VanInventory.name, VanInventorySchema));
  }

  async create(payload: CreateVanInventoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { vanId, productId } = payload;

        const filter: FilterQuery<VanInventory> = {
          vanId,
          productId,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(VAN_INVENTORY.DUPLICATE);
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
            message: VAN_INVENTORY.CREATED,
            data: { inventoryId: existing.inventoryId },
          };
        }

        const doc = await this.save(
          {
            inventoryId: IdGenerator.generate('VAN_', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: VAN_INVENTORY.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanInventoryQueryDto) {
    const { searchText, status, page = 1, limit = 20, vanId } = query;

    const filter: FilterQuery<VanInventory> = {};

    if (vanId) {
      filter.vanId = vanId;
    }

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
      message: VAN_INVENTORY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByInventoryId(inventoryId: string) {
    const doc = await this.findOne({ inventoryId }, { lean: true });

    if (!doc) throw new NotFoundException(VAN_INVENTORY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY.FETCHED,
      data: doc,
    };
  }

  async findByVanId(
    vanId: string,
    query: { page?: number; limit?: number; searchText?: string },
  ) {
    const { page = 1, limit = 20, searchText } = query;

    const skip = (Number(page) - 1) * Number(limit);

    const match: any = {
      vanId,
      quantity: { $gt: 0 },
    };

    const pipeline: any[] = [
      { $match: match },

      // 🔹 JOIN PRODUCT
      {
        $lookup: {
          from: 'product_master',
          localField: 'productId',
          foreignField: 'productId',
          as: 'product',
        },
      },
      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: false,
        },
      },

      // 🔹 SEARCH FILTER (AFTER JOIN)
      ...(searchText
        ? [
            {
              $match: {
                $or: [
                  { 'product.name': new RegExp(searchText, 'i') },
                  { 'product.productSysCode': new RegExp(searchText, 'i') },
                  { productId: new RegExp(searchText, 'i') },
                ],
              },
            },
          ]
        : []),

      // 🔹 CALCULATIONS
      {
        $addFields: {
          cases: {
            $cond: [
              { $gt: ['$product.unitQtyInCase', 0] },
              {
                $floor: {
                  $divide: ['$quantity', '$product.unitQtyInCase'],
                },
              },
              0,
            ],
          },
          pieces: {
            $cond: [
              { $gt: ['$product.unitQtyInCase', 0] },
              {
                $mod: ['$quantity', '$product.unitQtyInCase'],
              },
              '$quantity',
            ],
          },
          totalValue: {
            $multiply: ['$quantity', { $ifNull: ['$product.piecePrice', 0] }],
          },
          totalNetWeight: {
            $multiply: [
              '$quantity',
              { $ifNull: ['$product.pieceNetWeight', 0] },
            ],
          },
        },
      },

      // 🔹 GROUP BY PRODUCT
      {
        $group: {
          _id: {
            vanId: '$vanId',
            productId: '$product.productId',
          },
          name: { $first: '$product.name' },
          productSysCode: { $first: '$product.productSysCode' },

          quantity: { $sum: '$quantity' },
          cases: { $sum: '$cases' },
          pieces: { $sum: '$pieces' },
          totalValue: { $sum: '$totalValue' },
          totalNetWeight: { $sum: '$totalNetWeight' },

          pieceNetWeight: { $first: '$product.pieceNetWeight' },
          piecePrice: { $first: '$product.piecePrice' },
          unitQtyInCase: { $first: '$product.unitQtyInCase' },
        },
      },

      // 🔹 SORT PRODUCTS
      { $sort: { name: 1 } },

      // 🔹 PAGINATION + TOTAL COUNT
      {
        $facet: {
          products: [{ $skip: skip }, { $limit: Number(limit) }],
          totalCount: [{ $count: 'count' }],
          totals: [
            {
              $group: {
                _id: null,
                totalCases: { $sum: '$cases' },
                totalPieces: { $sum: '$pieces' },
                totalValue: { $sum: '$totalValue' },
                totalNetWeight: { $sum: '$totalNetWeight' },
              },
            },
          ],
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);

    const products = result[0]?.products || [];
    const total = result[0]?.totalCount?.[0]?.count || 0;
    const totals = result[0]?.totals?.[0] || {
      totalCases: 0,
      totalPieces: 0,
      totalValue: 0,
      totalNetWeight: 0,
    };

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY.FETCHED,
      data: {
        vanId,
        products,
        ...totals,
      },
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async update(inventoryId: string, dto: UpdateVanInventoryDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ inventoryId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(VAN_INVENTORY.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: VAN_INVENTORY.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(inventoryId: string) {
    const existing = await this.findOne({ inventoryId });

    if (!existing) throw new NotFoundException(VAN_INVENTORY.NOT_FOUND);

    await this.softDelete({ inventoryId });

    return {
      statusCode: HttpStatus.OK,
      message: VAN_INVENTORY.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_INVENTORY.DUPLICATE);
    }
    throw error;
  }
}
