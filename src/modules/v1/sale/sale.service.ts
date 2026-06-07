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

import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';

import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { ProductService } from '../product/product.service';
import { SalePaymentStatus, SaleType } from 'src/shared/enums/sale.enums';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleItemService } from '../sale-item/sale-item.service';
import { PaymentService } from '../payment/payment.service';
import { PaymentStatus } from 'src/shared/enums/payment.enums';
import { SaleQueryDto } from './dto/sale.query.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { SALE } from './sale.constants';
import { VanInventoryStatus } from 'src/shared/enums/van-inventory.enums';
import { VanInventoryService } from '../van-inventory/van-inventory.service';
import {
  Direction,
  TransactionType,
} from 'src/shared/enums/inventory-transaction.enums';
import { InventoryTransactionService } from '../inventory-transaction/inventory-transaction.service';
import { CustomerService } from '../customer/customer.service';
import { VanDailyStockService } from '../van-daily-stock/van-daily-stock.service';

@Injectable()
export class SaleService extends MongoRepository<Sale> {
  constructor(
    mongo: MongoService,
    private readonly productService: ProductService,
    private readonly saleItemService: SaleItemService,
    private readonly paymentService: PaymentService,
    private readonly inventoryService: VanInventoryService,
    private readonly inventoryTxnService: InventoryTransactionService,
    private readonly customerService: CustomerService,
    private readonly vanDailyStockService: VanDailyStockService,
  ) {
    super(mongo.getModel(Sale.name, SaleSchema));
  }

  async create(payload: CreateSaleDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { items = [], ...rest } = payload;
        const { type, paidAmount } = rest;

        if (!items.length) {
          throw new BadRequestException('At least one item is required');
        }

        if (
          type === SaleType.CASH &&
          (!paidAmount || paidAmount < rest?.totalValue)
        ) {
          throw new BadRequestException(
            'Full payment should be paid for cash payment',
          );
        }

        /* ======================================================
         * HELPERS
         * ====================================================== */

        const toFixed4 = (val: number) => Number((val || 0).toFixed(4));

        const isEqual = (a: number, b: number) => Math.abs(a - b) < 0.0001;

        /* ======================================================
         * CALCULATE TOTALS (BACKEND SOURCE OF TRUTH)
         * ====================================================== */

        let totalCases = 0;
        let totalPieces = 0;
        let totalQty = 0;
        let totalWeight = 0;
        let totalValue = 0;
        let netCases = 0;

        const processedItems: any[] = [];

        for (const item of items) {
          const caseQty = item.caseQty || 0;
          const pieceQty = item.pieceQty || 0;

          const response = await this.productService.findByProductId(
            item.productId,
          );
          const product = response?.data;

          if (!product) {
            throw new BadRequestException(
              `Product not found: ${item.productId}`,
            );
          }

          /* ================= PRICE (FROM BACKEND ONLY) ================= */

          const unitQtyInCase = product.unitQtyInCase || 1;
          const casePrice = Number(product.casePrice || 0);

          // ✅ Use backend stored piece price OR derive safely
          const piecePrice = Number(
            product.piecePrice ?? casePrice / unitQtyInCase,
          );

          /* ================= QUANTITY ================= */

          const quantity = caseQty * unitQtyInCase + pieceQty;

          /* ================= VALUE ================= */

          const itemValueRaw = caseQty * casePrice + pieceQty * piecePrice;

          const itemValue = toFixed4(itemValueRaw);

          /* ================= WEIGHT ================= */

          const pieceNetWeight = Number(product.pieceNetWeight || 0);
          const caseNetWeight = Number(product.caseNetWeight || 0);

          const itemWeightRaw = quantity * pieceNetWeight;
          const itemWeight = toFixed4(itemWeightRaw);

          /* ================= TOTALS ================= */

          totalCases += caseQty;
          totalPieces += pieceQty;
          totalQty += quantity;
          totalWeight += itemWeight;
          totalValue += itemValue;
          netCases += quantity / unitQtyInCase;

          processedItems.push({
            saleId: '',
            productId: item.productId,
            productName: item.productName,

            caseQty,
            pieceQty,
            quantity,

            casePrice: toFixed4(casePrice),
            piecePrice: toFixed4(piecePrice),

            unitQtyInCase,

            pieceNetWeight,
            caseNetWeight,

            totalNetWeight: itemWeight,
            totalValue: itemValue,
          });
        }

        /* ================= FINAL ROUNDING ================= */

        totalWeight = toFixed4(totalWeight);
        totalValue = toFixed4(totalValue);

        console.log('BACKEND TOTAL:', totalValue);

        console.log('Other  Total', totalCases, totalPieces, totalQty);

        /* ======================================================
         * VALIDATE FRONTEND DATA (SAFE COMPARISON)
         * ====================================================== */

        if (
          !isEqual(payload.totalCases ?? 0, totalCases) ||
          !isEqual(payload.totalPieces ?? 0, totalPieces) ||
          !isEqual(payload.totalQty ?? 0, totalQty) ||
          !isEqual(payload.totalValue ?? 0, totalValue)
        ) {
          throw new BadRequestException({
            message: 'Sales data mismatch. Please refresh and try again.',
            expected: {
              totalCases,
              totalPieces,
              totalQty,
              totalValue,
            },
            received: {
              totalCases: payload.totalCases,
              totalPieces: payload.totalPieces,
              totalQty: payload.totalQty,
              totalValue: payload.totalValue,
            },
          });
        }

        /* ======================================================
         * PAYMENT CALCULATION
         * ====================================================== */

        const pendingAmount = toFixed4(totalValue - (paidAmount || 0));

        let paymentStatus = SalePaymentStatus.UNPAID;

        if (pendingAmount <= 0) {
          paymentStatus = SalePaymentStatus.PAID;
        } else if (paidAmount > 0) {
          paymentStatus = SalePaymentStatus.PARTIAL;
        }

        /* ======================================================
         * CREATE SALES HEADER
         * ====================================================== */

        const saleId = IdGenerator.generate('SALE', 8);

        const doc = await this.save(
          {
            saleId,
            ...rest,

            totalCases,
            totalPieces,
            totalQty,
            totalWeight,
            totalValue,

            paidAmount,
            pendingAmount,
            paymentStatus,
            netCases,
          },
          { session },
        );

        /* ======================================================
         * INSERT ITEMS
         * ====================================================== */

        const itemsToInsert = processedItems.map((item) => ({
          ...item,
          saleId,
        }));

        await this.saleItemService.insertMany(itemsToInsert, session);

        /* ======================================================
         * INVENTORY DEDUCTION + TRANSACTION LOG
         * ====================================================== */

        for (const item of processedItems) {
          const { productId, quantity, caseQty, pieceQty } = item;

          const inventory = await this.inventoryService.findOne(
            {
              productId,
              vanId: doc.vanId,
              status: VanInventoryStatus.ACTIVE,
            },
            { session },
          );

          if (!inventory) {
            throw new BadRequestException(
              `Inventory not found for product: ${productId}`,
            );
          }

          if (inventory.quantity < quantity) {
            throw new BadRequestException(
              `Insufficient stock for product ${productId}. Available: ${inventory.quantity}, Required: ${quantity}`,
            );
          }

          await this.inventoryService.updateOne(
            { inventoryId: inventory.inventoryId },
            {
              $inc: {
                quantity: -quantity,
              },
            },
            { session },
          );

          const response = await this.vanDailyStockService.updateOne(
            {
              productId: inventory?.productId,
              vanId: inventory?.vanId,
              date: { $gte: new Date().setHours(0, 0, 0, 0) } as any,
            },
            {
              $inc: {
                outQty: quantity,
                closingQty: -quantity,
              },
            },
            {
              session,
            },
          );

          console.log('Van Daily Stock Update Result:', response);

          await this.inventoryTxnService.create(
            {
              productId,
              vanId: doc.vanId,
              employeeId: doc.employeeId,

              transactionType: TransactionType.SALE,
              direction: Direction.OUT,

              quantity,
              cases: caseQty,
              pieces: pieceQty,

              referenceNo: saleId,
              remark: 'Stock deducted from sale',

              transactionDate: doc.date,
            },
            session,
          );
        }

        /* ======================================================
         * CREATE PAYMENT
         * ====================================================== */

        if (paidAmount > 0 && payload?.paymentMode !== 'CREDIT') {
          await this.paymentService.create(
            {
              customerId: doc.customerId,
              vanId: doc.vanId,
              employeeId: doc.employeeId,
              amount: paidAmount,
              paymentMode: payload.paymentMode,
              status: PaymentStatus.SUCCESS,
              date: doc.date,
              sales: [
                {
                  saleId,
                  amount: paidAmount,
                },
              ],
              remark: `Payment received by ${payload?.paymentMode}`,
            },
            session,
            true,
          );
        }

        /* ======================================================
         * CUSTOMER OUTSTANDING UPDATE (CREDIT SALE)
         * ====================================================== */

        console.log(type, pendingAmount);
        if (type === SaleType.CREDIT && pendingAmount > 0) {
          await this.customerService.updateOne(
            { customerId: doc.customerId },
            {
              $inc: {
                outstanding: pendingAmount,
              },
            },
            { session },
          );
        }

        /* ======================================================
         * RESPONSE
         * ====================================================== */

        return {
          statusCode: HttpStatus.CREATED,
          message: SALE.CREATED,
          data: {
            saleId,
          },
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: SaleQueryDto) {
    const {
      searchText,
      salesId,
      vanId,
      vanName,
      customerId,
      customerName,
      employeeId,
      employeeName,
      status,
      type,
      paymentStatus,
      page = 1,
      limit = 20,
    } = query;

    const match: Record<string, any> = {
      isDeleted: false,
    };
    const toSafeRegex = (value: string) =>
      new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    if (status) match.status = status;
    if (salesId) match.saleId = salesId;
    if (vanId) match.vanId = vanId;
    if (customerId) match.customerId = customerId;
    if (employeeId) match.employeeId = employeeId;
    if (employeeName) match.employeeName = employeeName;
    if (type) match.type = type;
    if (paymentStatus) match.paymentStatus = paymentStatus;

    if (vanName) {
      match.vanName = toSafeRegex(vanName);
    }

    if (customerName) {
      match.customerName = toSafeRegex(customerName);
    }

    if (searchText) {
      const regex = toSafeRegex(searchText);
      match.$or = [{ customerName: regex }, { vanName: regex }];
    }

    if (type) {
      match.type = type;
    }

    const skip = (page - 1) * limit;

    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'sale_items',
          localField: 'saleId',
          foreignField: 'saleId',
          as: 'items',
        },
      },
      {
        $facet: {
          items: [{ $skip: skip }, { $limit: limit }],
          meta: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await this.model.aggregate(pipeline);
    const total = result?.meta?.[0]?.total ?? 0;

    return {
      statusCode: HttpStatus.OK,
      message: SALE.FETCHED,
      data: result?.items ?? [],
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLastSixMonthCategoryWiseSale(query: {
    vanId?: string;
    outletId?: string;
  }) {
    const { vanId, outletId } = query;

    const currentDate = new Date();

    const monthsData: any = [];

    for (let i = 0; i < 6; i++) {
      const date = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - i,
        1,
      );

      monthsData.push({
        year: date.getFullYear(),
        monthNumber: date.getMonth() + 1,
        month: date.toLocaleString('default', {
          month: 'short',
        }),
      });
    }

    const startDate = new Date(
      monthsData[5].year,
      monthsData[5].monthNumber - 1,
      1,
    );

    const match: Record<string, any> = {
      isDeleted: false,
      date: {
        $gte: startDate,
      },
    };

    if (vanId) {
      match.vanId = vanId;
    }

    if (outletId) {
      match.customerId = outletId;
    }

    const pipeline: any[] = [
      {
        $match: match,
      },

      {
        $lookup: {
          from: 'sale_items',
          localField: 'saleId',
          foreignField: 'saleId',
          as: 'items',
        },
      },

      {
        $unwind: '$items',
      },

      {
        $match: {
          'items.isDeleted': false,
        },
      },

      // Product Master Lookup
      {
        $lookup: {
          from: 'product_master',
          localField: 'items.productId',
          foreignField: 'productId',
          as: 'product',
        },
      },

      {
        $unwind: {
          path: '$product',
          preserveNullAndEmptyArrays: true,
        },
      },

      // Product Category Lookup
      {
        $lookup: {
          from: 'productcategories',
          localField: 'product.categoryId',
          foreignField: 'categoryId',
          as: 'category',
        },
      },

      {
        $unwind: {
          path: '$category',
          preserveNullAndEmptyArrays: true,
        },
      },

      {
        $group: {
          _id: {
            year: {
              $year: '$date',
            },

            monthNumber: {
              $month: '$date',
            },

            categoryName: {
              $ifNull: ['$category.name', 'UNKNOWN'],
            },
          },

          totalCases: {
            $sum: {
              $ifNull: ['$items.caseQty', 0],
            },
          },

          totalPieces: {
            $sum: {
              $ifNull: ['$items.pieceQty', 0],
            },
          },

          totalQtyInCases: {
            $sum: {
              $add: [
                {
                  $ifNull: ['$items.caseQty', 0],
                },

                {
                  $cond: [
                    {
                      $gt: ['$items.unitQtyInCase', 0],
                    },

                    {
                      $divide: [
                        {
                          $ifNull: ['$items.pieceQty', 0],
                        },
                        '$items.unitQtyInCase',
                      ],
                    },

                    0,
                  ],
                },
              ],
            },
          },

          totalValue: {
            $sum: {
              $ifNull: ['$items.totalValue', 0],
            },
          },

          totalWeight: {
            $sum: {
              $ifNull: ['$items.totalNetWeight', 0],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,

          year: '$_id.year',

          monthNumber: '$_id.monthNumber',

          categoryName: '$_id.categoryName',

          totalCases: 1,

          totalPieces: 1,

          totalQtyInCases: {
            $round: ['$totalQtyInCases', 3],
          },

          totalValue: {
            $round: ['$totalValue', 3],
          },

          totalWeight: {
            $round: ['$totalWeight', 3],
          },
        },
      },
    ];

    try {
      const rawData = await this.model.aggregate(pipeline);

      const categories = [...new Set(rawData.map((item) => item.categoryName))];

      const finalData: any = [];

      for (const monthData of monthsData) {
        for (const categoryName of categories) {
          const existing = rawData.find(
            (item) =>
              item.year === monthData.year &&
              item.monthNumber === monthData.monthNumber &&
              item.categoryName === categoryName,
          );

          finalData.push({
            year: monthData.year,

            monthNumber: monthData.monthNumber,

            month: monthData.month,

            categoryName,

            totalCases: existing?.totalCases ?? 0,

            totalPieces: existing?.totalPieces ?? 0,

            totalQtyInCases: existing?.totalQtyInCases ?? 0,

            totalValue: existing?.totalValue ?? 0,

            totalWeight: existing?.totalWeight ?? 0,
          });
        }
      }

      return {
        statusCode: HttpStatus.OK,
        message: 'Last six month category wise sales fetched successfully',
        data: finalData,
      };
    } catch (error) {
      console.log(error);

      throw error;
    }
  }

  async findBySaleId(saleId: string) {
    const [doc] = await this.model.aggregate([
      {
        $match: {
          saleId,
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: 'sale_items',
          localField: 'saleId',
          foreignField: 'saleId',
          as: 'items',
        },
      },
    ]);

    if (!doc) throw new NotFoundException(SALE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: SALE.FETCHED,
      data: doc,
    };
  }

  async findBySalesId(salesId: string) {
    return this.findBySaleId(salesId);
  }

  async update(salesId: string, dto: UpdateSaleDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ salesId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(SALE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: SALE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(salesId: string) {
    const existing = await this.findOne({ salesId });

    if (!existing) throw new NotFoundException(SALE.NOT_FOUND);

    await this.softDelete({ salesId });

    return {
      statusCode: HttpStatus.OK,
      message: SALE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(SALE.DUPLICATE);
    }
    throw error;
  }
}
