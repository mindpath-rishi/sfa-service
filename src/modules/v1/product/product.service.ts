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
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';
import { PriceType, ProductStatus } from 'src/shared/enums/product.enums';

@Injectable()
export class ProductService extends MongoRepository<Product> {
  constructor(
    mongo: MongoService,
    private readonly oracleRepository: OracleRepository,
  ) {
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
          pieceNetWeight: payload.netWeight,
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
   * Sync Products From ERP Oracle
   * -----------------------------
   * Source table : ESS_PRODUCT
   * Target table : product_master
   */
  async syncProductsFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.ORACLE_DISABLED,
        data: {
          synced: 0,
          skipped: true,
        },
      };
    }

    const toStringSafe = (value: any): string => {
      return String(value ?? '').trim();
    };

    const toNumberSafe = (value: any, defaultValue = 0): number => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : defaultValue;
    };

    const round4 = (value: number): number => {
      return Number(value.toFixed(4));
    };

    const rows = await this.oracleRepository.query<any>(
      `
    SELECT
      VC_COMP_CODE           AS "compCode",
      VC_ITEM_CODE           AS "itemCode",
      VC_ITEM_DESC           AS "itemDesc",
      VC_TECH_DESC           AS "techDesc",
      VC_UNIT                AS "unitType",
      NU_SELLING_PRICE       AS "sellingPrice",
      NU_BASIC_PRICE         AS "basicPrice",
      VC_ITEM_GROUP          AS "itemGroup",
      VC_ITEM_SUB_GROUP      AS "itemSubGroup",
      CH_STATUS              AS "erpStatus",
      NU_NET_WT              AS "netWeight",
      NU_OUTER_QTY           AS "outerQty",
      PRODUCT_TYPE           AS "parentCategoryName",
      SUB_PRODUCT_TYPE       AS "categoryName",
      PRODUCT_TYPE_CODE      AS "parentCategoryCode",
      SUB_PRODUCT_TYPE_CODE  AS "categoryCode"
    FROM ESS_PRODUCT
    WHERE VC_ITEM_CODE IS NOT NULL
    `,
    );

    if (!rows.length) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.NOT_FOUND,
        data: {
          synced: 0,
        },
      };
    }

    /**
     * Deduplicate ERP rows by itemCode because productId is unique in Mongo.
     * If same item appears multiple times, latest row in Oracle result will be used.
     */
    const uniqueRowsMap = new Map<string, any>();

    for (const row of rows) {
      const itemCode = toStringSafe(row.itemCode);

      if (!itemCode) continue;

      uniqueRowsMap.set(itemCode, row);
    }

    const uniqueRows = Array.from(uniqueRowsMap.values());

    const operations: any = uniqueRows.map((row) => {
      const compCode = toStringSafe(row.compCode);
      const itemCode = toStringSafe(row.itemCode);

      const productId = itemCode;
      const productSysCode = itemCode;

      const unitQtyInCase = Math.max(toNumberSafe(row.outerQty, 1), 1);

      const casePrice = toNumberSafe(row.sellingPrice ?? row.basicPrice, 0);

      const piecePrice = round4(casePrice / unitQtyInCase);

      const caseNetWeight = toNumberSafe(row.netWeight, 0);

      const pieceNetWeight = round4(caseNetWeight / unitQtyInCase);

      const name =
        toStringSafe(row.itemDesc) || toStringSafe(row.techDesc) || itemCode;

      const categoryId =
        toStringSafe(row.categoryCode) ||
        toStringSafe(row.itemGroup) ||
        'UNCATEGORIZED';

      const parentCategoryId = toStringSafe(row.parentCategoryCode);

      const unitType = toStringSafe(row.unitType) || undefined;

      const unitSize = null;

      return {
        updateOne: {
          filter: {
            productId,
          },
          update: {
            $set: {
              compCode,
              productId,
              name,
              productSysCode,
              categoryId,

              casePrice,
              piecePrice,

              caseNetWeight,
              pieceNetWeight,

              priceType: PriceType.STANDARD,

              unitType,
              unitSize,
              unitQtyInCase,

              isDeleted: false,
              parentCategoryId,
            },
          },
          upsert: true,
        },
      };
    });

    if (!operations.length) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.NOT_FOUND,
        data: {
          synced: 0,
        },
      };
    }

    const result = await this.model.bulkWrite(operations, {
      ordered: false,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.SYNCED,
      data: {
        totalERPRecords: rows.length,
        totalUniqueRecords: uniqueRows.length,
        totalValidRecords: operations.length,
        inserted: result.upsertedCount || 0,
        updated: result.modifiedCount || 0,
        matched: result.matchedCount || 0,
        synced: operations.length,
      },
    };
  }

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
      isFocusedPack,
      customerCategoryId,
    } = query;

    /**
     * ================= GET USER =================
     */
    const ctx = RequestContextStore.getStore();
    const userId = ctx?.userId;

    /**
     * ================= PRICE CATEGORY =================
     */
    const priceCategoryCode = customerCategoryId || '';

    /**
     * If customerCategoryId not sent,
     * product should not show because price cannot be found.
     */
    if (!priceCategoryCode) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.FETCHED,
        data: [],
        meta: {
          total: 0,
          page: Number(page),
          limit: Number(limit),
          totalPages: 0,
        },
      };
    }

    /**
     * ================= BUILD MATCH =================
     */
    const match: any = {
      isDeleted: false,
    };

    if (status) {
      match.status = status;
    }

    if (categoryIds) {
      match.parentCategoryId = {
        $in: categoryIds.split(','),
      };
    }

    if (brands) {
      match.brand = {
        $in: brands.split(','),
      };
    }

    if (isFocusedPack) {
      match.isFocusedPack = isFocusedPack;
    }

    if (hasDiscount === 'true') {
      match.discount = {
        $gt: 0,
      };
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
    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;
    const now = new Date();

    /**
     * ================= PIPELINE =================
     */
    const pipeline: any[] = [
      {
        $match: match,
      },

      /**
       * 1. Get van from logged-in user
       */
      {
        $lookup: {
          from: 'vans',
          let: {
            userId,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$$userId', '$associatedUsers'],
                },
              },
            },
            {
              $project: {
                vanId: 1,
                _id: 0,
              },
            },
          ],
          as: 'van',
        },
      },

      {
        $addFields: {
          vanId: {
            $arrayElemAt: ['$van.vanId', 0],
          },
        },
      },

      /**
       * 2. Lookup inventory for product + user van
       */
      {
        $lookup: {
          from: 'inventories',
          let: {
            productId: '$productId',
            vanId: '$vanId',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$vanId', '$$vanId'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            {
              $project: {
                quantity: 1,
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
       * 4. Filter only in-stock products if requested
       */
      ...(inStockOnly === 'true'
        ? [
            {
              $match: {
                stock: {
                  $gt: 0,
                },
              },
            },
          ]
        : []),

      /**
       * 5. Lookup latest valid customer category price
       *
       * price_master.productId = product.productId
       * price_master.categoryCode = customerCategoryId
       * price_master.effectiveDate <= now
       */
      {
        $lookup: {
          from: 'price_master',
          let: {
            productId: '$productId',
            categoryCode: priceCategoryCode,
            currentDate: now,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$categoryCode', '$$categoryCode'] },
                    { $lte: ['$effectiveDate', '$$currentDate'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            {
              $sort: {
                effectiveDate: -1,
                createdAt: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 0,
                priceId: 1,
                productId: 1,
                categoryCode: 1,
                categoryName: 1,

                casePriceExclVat: 1,
                casePriceInclVat: 1,
                piecePriceExclVat: 1,
                piecePriceInclVat: 1,

                effectiveDate: 1,
                priceFlag: 1,
              },
            },
          ],
          as: 'customerPrice',
        },
      },

      /**
       * 6. Convert price array to object
       */
      {
        $addFields: {
          customerPrice: {
            $arrayElemAt: ['$customerPrice', 0],
          },
        },
      },

      /**
       * 7. If price does not exist, do not show product
       */
      {
        $match: {
          customerPrice: {
            $ne: null,
          },
        },
      },

      /**
       * 8. Add final price fields from price_master
       */
      {
        $addFields: {
          priceId: '$customerPrice.priceId',
          priceCategoryCode: '$customerPrice.categoryCode',
          priceCategoryName: '$customerPrice.categoryName',
          priceEffectiveDate: '$customerPrice.effectiveDate',
          priceFlag: '$customerPrice.priceFlag',

          casePriceExclVat: '$customerPrice.casePriceExclVat',
          casePriceInclVat: '$customerPrice.casePriceInclVat',
          piecePriceExclVat: '$customerPrice.piecePriceExclVat',
          piecePriceInclVat: '$customerPrice.piecePriceInclVat',

          /**
           * App compatibility fields
           */
          casePrice: '$customerPrice.casePriceInclVat',
          piecePrice: '$customerPrice.piecePriceInclVat',
        },
      },

      /**
       * 9. Apply price filter after customer price applied
       */
      ...(minPrice || maxPrice
        ? [
            {
              $match: {
                casePriceInclVat: {
                  ...(minPrice ? { $gte: Number(minPrice) } : {}),
                  ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                },
              },
            },
          ]
        : []),

      /**
       * 10. Clean internal fields
       */
      {
        $project: {
          inventory: 0,
          van: 0,
          customerPrice: 0,
        },
      },

      /**
       * 11. Sort + paginate + count
       */
      {
        $facet: {
          items: [
            {
              $sort: {
                createdAt: -1,
              },
            },
            {
              $skip: skip,
            },
            {
              $limit: limitNumber,
            },
          ],
          meta: [
            {
              $count: 'total',
            },
          ],
        },
      },
    ];

    const [result] = await this.model.aggregate(pipeline);

    const items = result?.items ?? [];
    const total = result?.meta?.[0]?.total ?? 0;

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: items,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  /**
   * Get Product by ID
   * -----------------
   * Purpose : Retrieve a single product with latest customer category price
   *
   * Price rules:
   * - price_master.productId = product.productId
   * - price_master.categoryCode = customerCategoryId
   * - price_master.effectiveDate <= current date/time
   * - latest effectiveDate selected
   * - if price not found, product will not be shown
   */
  async findByProductId(
    productId: string,
    query?: {
      customerCategoryId?: string;
    },
  ) {
    const priceCategoryCode = query?.customerCategoryId || '';

    if (!priceCategoryCode) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    const now = new Date();

    const [product] = await this.model.aggregate([
      {
        $match: {
          productId,
          isDeleted: false,
        },
      },

      /**
       * Lookup latest valid price from price_master
       */
      {
        $lookup: {
          from: 'price_master',
          let: {
            productId: '$productId',
            categoryCode: priceCategoryCode,
            currentDate: now,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$categoryCode', '$$categoryCode'] },
                    { $lte: ['$effectiveDate', '$$currentDate'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            {
              $sort: {
                effectiveDate: -1,
                createdAt: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 0,
                priceId: 1,
                productId: 1,
                categoryCode: 1,
                categoryName: 1,

                casePriceExclVat: 1,
                casePriceInclVat: 1,
                piecePriceExclVat: 1,
                piecePriceInclVat: 1,

                effectiveDate: 1,
                priceFlag: 1,
              },
            },
          ],
          as: 'customerPrice',
        },
      },

      /**
       * Convert price array to object
       */
      {
        $addFields: {
          customerPrice: {
            $arrayElemAt: ['$customerPrice', 0],
          },
        },
      },

      /**
       * If price does not exist, do not return product
       */
      {
        $match: {
          customerPrice: {
            $ne: null,
          },
        },
      },

      /**
       * Add final price fields
       */
      {
        $addFields: {
          priceId: '$customerPrice.priceId',
          priceCategoryCode: '$customerPrice.categoryCode',
          priceCategoryName: '$customerPrice.categoryName',
          priceEffectiveDate: '$customerPrice.effectiveDate',
          priceFlag: '$customerPrice.priceFlag',

          casePriceExclVat: '$customerPrice.casePriceExclVat',
          casePriceInclVat: '$customerPrice.casePriceInclVat',
          piecePriceExclVat: '$customerPrice.piecePriceExclVat',
          piecePriceInclVat: '$customerPrice.piecePriceInclVat',

          /**
           * App compatibility fields
           */
          casePrice: '$customerPrice.casePriceInclVat',
          piecePrice: '$customerPrice.piecePriceInclVat',
        },
      },

      {
        $project: {
          customerPrice: 0,
        },
      },
    ]);

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
