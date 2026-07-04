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
  InventoryTransaction,
  InventoryTransactionSchema,
} from 'src/core/database/mongo/schema/inventory-transaction.schema';

import { INVENTORY_TRANSACTION } from './inventory-transaction.constants';
import { CreateInventoryTransactionDto } from './dto/create-inventory-transaction.dto';
import { UpdateInventoryTransactionDto } from './dto/update-inventory-transaction.dto';
import { InventoryTransactionQueryDto } from './dto/inventory-transaction-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { ClientSession } from 'mongoose';

@Injectable()
export class InventoryTransactionService extends MongoRepository<InventoryTransaction> {
  constructor(mongo: MongoService) {
    super(
      mongo.getModel(InventoryTransaction.name, InventoryTransactionSchema),
    );
  }

  async create(
    payload: CreateInventoryTransactionDto,
    session?: ClientSession,
  ) {
    try {
      return await this.withTransaction(async (session) => {
        const { productId, vanId, referenceNo } = payload;
        const filter: FilterQuery<InventoryTransaction> = {
          productId,
          vanId,
          referenceNo,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(INVENTORY_TRANSACTION.DUPLICATE);
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
            message: INVENTORY_TRANSACTION.CREATED,
            data: { transactionId: existing.transactionId },
          };
        }

        const doc = await this.save(
          {
            transactionId: IdGenerator.generate('INVE', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: INVENTORY_TRANSACTION.CREATED,
          data: doc,
        };
      }, session);
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: InventoryTransactionQueryDto) {
    const {
      searchText,
      status,
      page = 1,
      limit = 20,
      transactionId,
      productId,
      vanId,
      employeeId,
      warehouseId,
      transactionType,
      quantity,
      cases,
      pieces,
      referenceNo,
      remark,
      transactionDate,
    } = query;

    const filter: FilterQuery<InventoryTransaction> = {};

    if (status) filter.status = status;
    if (transactionId) filter.transactionId = transactionId;
    if (productId) filter.productId = productId;
    if (vanId) filter.vanId = vanId;
    if (employeeId) filter.employeeId = employeeId;
    if (warehouseId) filter.warehouseId = warehouseId;
    if (transactionType) filter.transactionType = transactionType;
    if (quantity !== undefined) filter.quantity = quantity;
    if (cases !== undefined) filter.cases = cases;
    if (pieces !== undefined) filter.pieces = pieces;
    if (referenceNo) filter.referenceNo = referenceNo;
    if (remark) filter.remark = remark;
    if (transactionDate) filter.transactionDate = transactionDate;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ transactionId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: INVENTORY_TRANSACTION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByTransactionId(transactionId: string) {
    const doc = await this.findOne({ transactionId }, { lean: true });

    if (!doc) throw new NotFoundException(INVENTORY_TRANSACTION.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: INVENTORY_TRANSACTION.FETCHED,
      data: doc,
    };
  }

  async update(transactionId: string, dto: UpdateInventoryTransactionDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ transactionId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(INVENTORY_TRANSACTION.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: INVENTORY_TRANSACTION.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(transactionId: string) {
    const existing = await this.findOne({ transactionId });

    if (!existing) throw new NotFoundException(INVENTORY_TRANSACTION.NOT_FOUND);

    await this.softDelete({ transactionId });

    return {
      statusCode: HttpStatus.OK,
      message: INVENTORY_TRANSACTION.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(INVENTORY_TRANSACTION.DUPLICATE);
    }
    throw error;
  }
}
