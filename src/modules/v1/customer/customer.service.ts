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
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';

import { CUSTOMER } from './customer.constants';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class CustomerService extends MongoRepository<Customer> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Customer.name, CustomerSchema));
  }

  async create(payload: CreateCustomerDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<Customer> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(CUSTOMER.DUPLICATE);
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
            message: CUSTOMER.CREATED,
            data: { customerId: existing.customerId },
          };
        }

        const doc = await this.save(
          {
            customerId: IdGenerator.generate('CUST', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: CUSTOMER.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: CustomerQueryDto) {
    const { searchText, status, page = 1, limit = 20, customerIds } = query;

    const filter: FilterQuery<Customer> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ name: regex }];
    }

    if (customerIds) {
      filter.customerId = { $in: customerIds } as any;
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByCustomerId(customerId: string) {
    const doc = await this.findOne({ customerId }, { lean: true });

    if (!doc) throw new NotFoundException(CUSTOMER.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.FETCHED,
      data: doc,
    };
  }

  async update(customerId: string, dto: UpdateCustomerDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ customerId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(CUSTOMER.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: CUSTOMER.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(customerId: string) {
    const existing = await this.findOne({ customerId });

    if (!existing) throw new NotFoundException(CUSTOMER.NOT_FOUND);

    await this.softDelete({ customerId });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CUSTOMER.DUPLICATE);
    }
    throw error;
  }
}
