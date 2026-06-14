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
  Leave,
  LeaveSchema,
} from 'src/core/database/mongo/schema/leave.schema';

import { LEAVE } from './leave.constants';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { LeaveQueryDto } from './dto/leave-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

@Injectable()
export class LeaveService extends MongoRepository<Leave> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Leave.name, LeaveSchema));
  }

  async create(payload: CreateLeaveDto) {
    try {
      return await this.withTransaction(async (session) => {
        const filter: FilterQuery<Leave> = {
          userId: payload.userId,
          createdAt: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(LEAVE.DUPLICATE);
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
            message: LEAVE.CREATED,
            data: { leaveId: existing.leaveId },
          };
        }

        const doc = await this.save(
          {
            leaveId: IdGenerator.generate('LEAV', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: LEAVE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: LeaveQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Leave> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ leaveId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: LEAVE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByLeaveId(leaveId: string) {
    const doc = await this.findOne({ leaveId }, { lean: true });

    if (!doc) throw new NotFoundException(LEAVE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: LEAVE.FETCHED,
      data: doc,
    };
  }

  async update(leaveId: string, dto: UpdateLeaveDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ leaveId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(LEAVE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: LEAVE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(leaveId: string) {
    const existing = await this.findOne({ leaveId });

    if (!existing) throw new NotFoundException(LEAVE.NOT_FOUND);

    await this.softDelete({ leaveId });

    return {
      statusCode: HttpStatus.OK,
      message: LEAVE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(LEAVE.DUPLICATE);
    }
    throw error;
  }
}
