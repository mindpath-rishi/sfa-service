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

@Injectable()
export class SaleService extends MongoRepository<Sale> {
  constructor(
    mongo: MongoService,
    private readonly productService: ProductService,
    private readonly saleItemService: SaleItemService,
    private readonly paymentService: PaymentService,
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
         * CALCULATE TOTALS
         * ====================================================== */

        let totalCases = 0;
        let totalPieces = 0;
        let totalQty = 0;
        let totalWeight = 0;
        let totalValue = 0;

        const processedItems: any[] = [];

        for (const item of items) {
          const caseQty = item.caseQty || 0;
          const pieceQty = item.pieceQty || 0;

          /**
           * Fetch product
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

          /* ================= CALCULATIONS ================= */

          const quantity = caseQty * unitQtyInCase + pieceQty;

          const piecePrice = casePrice / unitQtyInCase;

          const itemValue = caseQty * casePrice + pieceQty * piecePrice;

          const pieceNetWeight = product.pieceWeight || 0;
          const caseNetWeight = product.caseWeight || 0;

          const itemWeight = quantity * pieceNetWeight;

          /* ================= ACCUMULATE ================= */

          totalCases += caseQty;
          totalPieces += pieceQty;
          totalQty += quantity;
          totalWeight += itemWeight;
          totalValue += itemValue;

          /* ================= PUSH ITEM ================= */

          processedItems.push({
            saleId: '',
            productId: item.productId,
            productName: item.productName,

            caseQty,
            pieceQty,
            quantity,

            casePrice,
            piecePrice,

            unitQtyInCase,

            pieceNetWeight,
            caseNetWeight,

            totalWeight: itemWeight,
            totalValue: itemValue,
          });
        }

        /* ======================================================
         * VALIDATE FRONTEND DATA (ANTI-TAMPER)
         * ====================================================== */

        if (
          (payload.totalCases ?? 0) !== totalCases ||
          (payload.totalPieces ?? 0) !== totalPieces ||
          (payload.totalQty ?? 0) !== totalQty ||
          (payload.totalValue ?? 0) !== totalValue
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

        const pendingAmount = totalValue - (paidAmount || 0);

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

        await this.saleItemService.insertMany(itemsToInsert, {
          session,
        });

        /* ======================================================
         * CREATE PAYMENT (IF PAID)
         * ====================================================== */

        if (paidAmount > 0) {
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
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Sale> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ salesId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: SALE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findBySalesId(salesId: string) {
    const doc = await this.findOne({ salesId }, { lean: true });

    if (!doc) throw new NotFoundException(SALE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: SALE.FETCHED,
      data: doc,
    };
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
