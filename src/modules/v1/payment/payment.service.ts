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
import { ClientSession } from 'mongoose';

@Injectable()
export class PaymentService extends MongoRepository<Payment> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Payment.name, PaymentSchema));
  }

  async create(payload: CreatePaymentDto, session?: ClientSession) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<Payment> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(PAYMENT.DUPLICATE);
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
            message: PAYMENT.CREATED,
            data: { paymentId: existing.paymentId },
          };
        }

        const doc = await this.save(
          {
            paymentId: IdGenerator.generate('PAYM', 8),
            ...payload,
          },
          { session },
        );

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

  async findAll(query: PaymentQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Payment> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ paymentId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PAYMENT.FETCHED,
      data: result.items,
      meta: result.meta,
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
