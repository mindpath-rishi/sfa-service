
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { CustomerSales, CustomerSalesSchema } from 'src/core/database/mongo/schema/customer-sales.schema';

import { CUSTOMER_SALES } from './customer-sales.constants';
import { CreateCustomerSalesDto } from './dto/create-customer-sales.dto';
import { UpdateCustomerSalesDto } from './dto/update-customer-sales.dto';
import { CustomerSalesQueryDto } from './dto/customer-sales-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';


@Injectable()
export class CustomerSalesService extends MongoRepository<CustomerSales> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(CustomerSales.name, CustomerSalesSchema));
  }

  async create(payload: CreateCustomerSalesDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const filter: FilterQuery<CustomerSales> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(CUSTOMER_SALES.DUPLICATE);
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
            message: CUSTOMER_SALES.CREATED,
            data: { salesId: existing.salesId },
          };
        }

        const doc = await this.save(
          {
            salesId: IdGenerator.generate('CUST', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: CUSTOMER_SALES.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: CustomerSalesQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<CustomerSales> = {};

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
      message: CUSTOMER_SALES.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findBySalesId(salesId: string) {
    const doc = await this.findOne({ salesId }, { lean: true });

    if (!doc) throw new NotFoundException(CUSTOMER_SALES.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_SALES.FETCHED,
      data: doc,
    };
  }

  async update(salesId: string, dto: UpdateCustomerSalesDto) {
    try {
      return await this.withTransaction(async (session) => {
        

        const doc = await this.updateOne(
          { salesId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(CUSTOMER_SALES.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: CUSTOMER_SALES.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(salesId: string) {
    const existing = await this.findOne({ salesId });

    if (!existing) throw new NotFoundException(CUSTOMER_SALES.NOT_FOUND);

    await this.softDelete({ salesId });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_SALES.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CUSTOMER_SALES.DUPLICATE);
    }
    throw error;
  }
}
