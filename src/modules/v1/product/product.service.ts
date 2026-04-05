/**
 * Product Service
 * ----------------
 * Purpose : Handles business logic for product master lifecycle management
 * Used by : ProductController
 *
 * Responsibilities:
 * - Create product master records
 * - Restore soft-deleted products
 * - Fetch products with filters and pagination
 * - Retrieve single product details
 * - Update product information
 * - Soft-delete products
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Product master acts as source of truth
 * - Inventory quantities are handled separately
 * - Soft deletes preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Product,
  ProductSchema,
} from 'src/core/database/mongo/schema/product.schema';

import { ProductQueryDto } from './dto/product-query.dto';
import { PRODUCT } from './product.constants';
import { ProductCreateDto } from './dto/create-product.dto';
import { ProductUpdateDto } from './dto/update-product.dto';
import { RequestContextStore } from 'src/core/context/request-context';

@Injectable()
export class ProductService extends MongoRepository<Product> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Product.name, ProductSchema));
  }

  /**
   * Create Product
   * --------------
   * Purpose : Create new product or restore soft-deleted product
   *
   * Flow:
   * - Check for existing product (including soft-deleted)
   * - Restore soft-deleted product if found
   * - Create new product if not exists
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active products
   */
  async create(payload: ProductCreateDto) {
    return this.withTransaction(async (session) => {
      // Check existing product (including soft-deleted)
      const existing = await this.findOne(
        {
          $or: [
            { productId: payload.productId },
            { productSysCode: payload.productSysCode },
          ],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active product
      if (existing && !existing.isDeleted) {
        throw new ConflictException(PRODUCT.DUPLICATE);
      }

      // Restore soft-deleted product
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            name: payload.name,
            categoryId: payload.categoryId,
            productSysCode: payload.productSysCode,
            price: payload.price,
            netWeight: payload.netWeight,
            priceType: payload.priceType,
            unitType: payload.unitType,
            unitSize: payload.unitSize,
            unitQtyInCase: payload.unitQtyInCase,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: PRODUCT.CREATED,
          data: { productId: existing.productId },
        };
      }

      // Create new product
      const product = await this.save(
        {
          productId: payload.productId,
          name: payload.name,
          categoryId: payload.categoryId,
          productSysCode: payload.productSysCode,
          casePrice: payload.price,
          caseWeight: payload.netWeight,
          priceType: payload.priceType,
          unitType: payload.unitType,
          unitSize: payload.unitSize,
          unitQtyInCase: payload.unitQtyInCase,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: PRODUCT.CREATED,
        data: product,
      };
    });
  }

  /**
   * Get Products
   * ------------
   * Purpose : Retrieve products with filtering and pagination
   * Supports: Search, multiple categories, multiple brands, price range, stock status, discounts
   */
  async findAll(query: ProductQueryDto) {
    const {
      searchText,
      categoryIds,
      brands,
      status,
      minPrice,
      maxPrice,
      inStockOnly,
      hasDiscount,
      page = 1,
      limit = 20,
    } = query;

    /**
     * ================= GET USER =================
     */
    const ctx = RequestContextStore.getStore();
    const userId = ctx?.userId;

    /**
     * ================= BUILD MATCH =================
     */
    const match: any = {};

    if (status) match.status = status;

    if (categoryIds) {
      match.categoryId = { $in: categoryIds.split(',') };
    }

    if (brands) {
      match.brand = { $in: brands.split(',') };
    }

    if (minPrice || maxPrice) {
      match.price = {};
      if (minPrice) match.price.$gte = Number(minPrice);
      if (maxPrice) match.price.$lte = Number(maxPrice);
    }

    if (hasDiscount === 'true') {
      match.discount = { $gt: 0 };
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      match.$or = [
        { name: regex },
        { productSysCode: regex },
        { productId: regex },
        { sku: regex },
        { brand: regex },
      ];
    }

    /**
     * ================= PAGINATION =================
     */
    const skip = (page - 1) * limit;

    /**
     * ================= PIPELINE =================
     */
    const pipeline: any[] = [
      { $match: match },

      /**
       * 1. Get van from user
       */
      {
        $lookup: {
          from: 'vans',
          let: { userId: userId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$$userId', '$associatedUsers'], // adjust if object
                },
              },
            },
            { $project: { vanId: 1, _id: 0 } },
          ],
          as: 'van',
        },
      },

      {
        $addFields: {
          vanId: { $arrayElemAt: ['$van.vanId', 0] },
        },
      },

      /**
       * 2. Lookup inventory
       */
      {
        $lookup: {
          from: 'inventories',
          let: { productId: '$productId', vanId: '$vanId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$vanId', '$$vanId'] },
                  ],
                },
              },
            },
            {
              $project: {
                quantity: 1, // adjust field
                _id: 0,
              },
            },
          ],
          as: 'inventory',
        },
      },

      /**
       * 3. Add stock
       */
      {
        $addFields: {
          stock: {
            $ifNull: [{ $arrayElemAt: ['$inventory.quantity', 0] }, 0],
          },
        },
      },

      /**
       * 4. Filter inStock
       */
      ...(inStockOnly === 'true' ? [{ $match: { stock: { $gt: 0 } } }] : []),

      /**
       * 5. Clean fields
       */
      {
        $project: {
          inventory: 0,
          van: 0,
        },
      },

      /**
       * 6. Sort + paginate
       */
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ];

    /**
     * ================= EXECUTE =================
     */
    const items = await this.model.aggregate(pipeline);

    /**
     * ================= COUNT =================
     */
    const totalResult = await this.model.aggregate([
      { $match: match },
      { $count: 'total' },
    ]);

    const total = totalResult[0]?.total || 0;

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get Product by ID
   * -----------------
   * Purpose : Retrieve a single product
   */
  async findByProductId(productId: string) {
    const product = await this.findOne({ productId }, { lean: true });

    if (!product) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: product,
    };
  }

  /**
   * Update Product
   * --------------
   * Purpose : Update product master data
   */
  async update(productId: string, payload: ProductUpdateDto) {
    const product = await this.updateOne({ productId }, payload);

    if (!product) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.UPDATED,
      data: product,
    };
  }

  /**
   * Delete Product (Soft Delete)
   * ---------------------------
   * Purpose : Soft delete product
   */
  async delete(productId: string) {
    const deletedProduct = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { productId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(PRODUCT.NOT_FOUND);
      }

      await this.softDelete({ productId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.DELETED,
      data: deletedProduct,
    };
  }
}
