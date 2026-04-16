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
  Payment,
  PaymentSchema,
} from 'src/core/database/mongo/schema/payment.schema';

import { PAYMENT } from './payment.constants';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { ClientSession, Model } from 'mongoose';
import { CustomerService } from '../customer/customer.service';
import { SaleService } from '../sale/sale.service';
import {
  SalePaymentStatus,
  SaleStatus,
  SaleType,
} from 'src/shared/enums/sale.enums';
import { Sale } from 'src/core/database/mongo/schema/sale.schema';
import { InjectModel } from '@nestjs/mongoose';

@Injectable()
export class PaymentService extends MongoRepository<Payment> {
  constructor(
    mongo: MongoService,
    private readonly customerService: CustomerService,
    @InjectModel(Sale.name)
    private readonly saleModel: Model<Sale>,
  ) {
    super(mongo.getModel(Payment.name, PaymentSchema));
  }

  async create(
    payload: CreatePaymentDto,
    session?: ClientSession,
    isOther?: boolean,
  ) {
    try {
      return await this.withTransaction(async (session) => {
        // 🔥 STEP 1: FIFO CLEAR
        let doc;
        if (!isOther) {
          const fifoResult = await this.clearCreditFIFOWithMapping(
            payload.customerId,
            payload.amount,
            session,
          );

          // 🔥 STEP 2: UPDATE CUSTOMER OUTSTANDING ONLY
          // if (fifoResult.usedAmount > 0) {
          await this.customerService.updateOne(
            { customerId: payload.customerId },
            {
              $inc: {
                outstanding: payload?.amount,
              },
            },
            { session },
          );
          // }

          // 🔥 STEP 3: CREATE PAYMENT
          doc = await this.save(
            {
              paymentId: IdGenerator.generate('PAYM', 8),
              ...payload,
              sales: fifoResult.mappedSales,
            },
            { session },
          );
        } else {
          doc = await this.save(
            {
              paymentId: IdGenerator.generate('PAYM', 8),
              ...payload,
            },
            { session },
          );
        }

        return {
          statusCode: HttpStatus.CREATED,
          message: PAYMENT.CREATED,
          data: doc,
        };
      }, session);
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async clearCreditFIFOWithMapping(
    customerId: string,
    paymentAmount: number,
    session: ClientSession,
  ) {
    const sales = await this.saleModel
      .find(
        {
          customerId,
          type: SaleType.CREDIT,
          pendingAmount: { $gt: 0 },
          status: SaleStatus.COMPLETED,
        },
        null,
        { session },
      )
      .sort({ date: 1 }); // ✅ IMPORTANT for FIFO

    let remainingAmount = paymentAmount;

    const mappedSales: { saleId: string; amount: number }[] = [];

    for (const sale of sales) {
      if (remainingAmount <= 0) break;

      const pending = sale.pendingAmount;

      let used = 0;
      let updateData: any = {};

      if (remainingAmount >= pending) {
        // ✅ FULL CLEAR
        used = pending;

        updateData = {
          $inc: {
            paidAmount: pending,
          },
          $set: {
            pendingAmount: 0,
            paymentStatus: SalePaymentStatus.PAID,
          },
        };

        remainingAmount -= pending;
      } else {
        // ✅ PARTIAL CLEAR
        used = remainingAmount;

        updateData = {
          $inc: {
            paidAmount: remainingAmount,
            pendingAmount: -remainingAmount,
          },
          $set: {
            paymentStatus: SalePaymentStatus.PARTIAL,
          },
        };

        remainingAmount = 0;
      }

      mappedSales.push({
        saleId: sale.saleId,
        amount: used,
      });

      await this.saleModel.updateOne({ _id: sale._id }, updateData, {
        session,
      });
    }

    return {
      mappedSales,
      usedAmount: paymentAmount - remainingAmount,
      remainingAmount,
    };
  }

  async findAll(query: PaymentQueryDto) {
    const {
      searchText,
      status,
      page = 1,
      limit = 20,
      vanId,
      employeeId,
      customerId,
    } = query;

    const match: any = {};

    if (status) match.status = status;
    if (vanId) match.vanId = vanId;
    if (employeeId) match.employeeId = employeeId;
    if (customerId) match.customerId = customerId;

    const pipeline: any[] = [
      { $match: match },

      // 🔗 Customer Lookup
      {
        $lookup: {
          from: 'customer_master',
          localField: 'customerId',
          foreignField: 'customerId',
          as: 'customer',
        },
      },
      {
        $unwind: {
          path: '$customer',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'vans',
          localField: 'vanId',
          foreignField: 'vanId',
          as: 'van',
        },
      },
      {
        $unwind: {
          path: '$van',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          customerName: '$customer.name',
          vanName: '$van.name',
        },
      },
    ];

    // 🔍 Apply search AFTER lookup
    if (searchText) {
      const regex = new RegExp(searchText, 'i');

      pipeline.push({
        $match: {
          $or: [
            { paymentId: regex },
            { customerName: regex },
            { vanName: regex }, // ✅ NEW
          ],
        },
      });
    }

    // Sorting
    pipeline.push({ $sort: { createdAt: -1 } });

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
      this.model.aggregate([...pipeline, { $count: 'count' }]),
    ]);

    return {
      statusCode: HttpStatus.OK,
      message: PAYMENT.FETCHED,
      data,
      meta: {
        total: total[0]?.count || 0,
        page,
        limit,
      },
    };
  }

  async findByPaymentId(paymentId: string) {
    const doc = await this.findOne({ paymentId }, { lean: true });

    if (!doc) throw new NotFoundException(PAYMENT.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: PAYMENT.FETCHED,
      data: doc,
    };
  }

  async update(paymentId: string, dto: UpdatePaymentDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ paymentId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(PAYMENT.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: PAYMENT.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(paymentId: string) {
    const existing = await this.findOne({ paymentId });

    if (!existing) throw new NotFoundException(PAYMENT.NOT_FOUND);

    await this.softDelete({ paymentId });

    return {
      statusCode: HttpStatus.OK,
      message: PAYMENT.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(PAYMENT.DUPLICATE);
    }
    throw error;
  }
}
