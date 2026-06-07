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
  Target,
  TargetSchema,
} from 'src/core/database/mongo/schema/target.schema';

import { TARGET } from './target.constants';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { TargetQueryDto } from './dto/target-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class TargetService extends MongoRepository<Target> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Target.name, TargetSchema));
  }

  async create(payload: CreateTargetDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<Target> = {};

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(TARGET.DUPLICATE);
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
            message: TARGET.CREATED,
            data: { userId: existing.userId },
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
          message: TARGET.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: TargetQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Target> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ userId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: TARGET.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByUserId(userId: string) {
    const doc = await this.findOne({ userId }, { lean: true });

    if (!doc) throw new NotFoundException(TARGET.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: TARGET.FETCHED,
      data: doc,
    };
  }

  async update(userId: string, dto: UpdateTargetDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ userId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(TARGET.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: TARGET.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(userId: string) {
    const existing = await this.findOne({ userId });

    if (!existing) throw new NotFoundException(TARGET.NOT_FOUND);

    await this.softDelete({ userId });

    return {
      statusCode: HttpStatus.OK,
      message: TARGET.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(TARGET.DUPLICATE);
    }
    throw error;
  }
}
