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
  CustomerSalesItem,
  CustomerSalesItemSchema,
} from 'src/core/database/mongo/schema/customer-sales-item.schema';

import { CUSTOMER_SALES_ITEM } from './customer-sales-item.constants';
import { CreateCustomerSalesItemDto } from './dto/create-customer-sales-item.dto';
import { UpdateCustomerSalesItemDto } from './dto/update-customer-sales-item.dto';
import { CustomerSalesItemQueryDto } from './dto/customer-sales-item-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class CustomerSalesItemService extends MongoRepository<CustomerSalesItem> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(CustomerSalesItem.name, CustomerSalesItemSchema));
  }

  async create(payload: CreateCustomerSalesItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<CustomerSalesItem> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(CUSTOMER_SALES_ITEM.DUPLICATE);
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
            message: CUSTOMER_SALES_ITEM.CREATED,
            data: { saleId: existing.saleId },
          };
        }

        const doc = await this.save(
          {
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: CUSTOMER_SALES_ITEM.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: CustomerSalesItemQueryDto) {
    const { searchText, page = 1, limit = 20 } = query;

    const filter: FilterQuery<CustomerSalesItem> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ saleId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_SALES_ITEM.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findBySaleId(saleId: string) {
    const doc = await this.findOne({ saleId }, { lean: true });

    if (!doc) throw new NotFoundException(CUSTOMER_SALES_ITEM.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_SALES_ITEM.FETCHED,
      data: doc,
    };
  }

  async update(saleId: string, dto: UpdateCustomerSalesItemDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ saleId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(CUSTOMER_SALES_ITEM.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: CUSTOMER_SALES_ITEM.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(saleId: string) {
    const existing = await this.findOne({ saleId });

    if (!existing) throw new NotFoundException(CUSTOMER_SALES_ITEM.NOT_FOUND);

    await this.softDelete({ saleId });

    return {
      statusCode: HttpStatus.OK,
      message: CUSTOMER_SALES_ITEM.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CUSTOMER_SALES_ITEM.DUPLICATE);
    }
    throw error;
  }
}
