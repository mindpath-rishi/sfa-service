
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { OutletType, OutletTypeSchema } from 'src/core/database/mongo/schema/outlet-type.schema';

import { OUTLET_TYPE } from './outlet-type.constants';
import { CreateOutletTypeDto } from './dto/create-outlet-type.dto';
import { UpdateOutletTypeDto } from './dto/update-outlet-type.dto';
import { OutletTypeQueryDto } from './dto/outlet-type-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class OutletTypeService extends MongoRepository<OutletType> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(OutletType.name, OutletTypeSchema));
  }

  async create(payload: CreateOutletTypeDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<OutletType> = {};

        
        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(OUTLET_TYPE.DUPLICATE);
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
            message: OUTLET_TYPE.CREATED,
            data: { outletTypeId: existing.outletTypeId },
          };
        }

        const doc = await this.save(
          {
            outletTypeId: IdGenerator.generate('OUTL', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: OUTLET_TYPE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: OutletTypeQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<OutletType> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ outletTypeId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: OUTLET_TYPE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByOutletTypeId(outletTypeId: string) {
    const doc = await this.findOne({ outletTypeId }, { lean: true });

    if (!doc) throw new NotFoundException(OUTLET_TYPE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: OUTLET_TYPE.FETCHED,
      data: doc,
    };
  }

  async update(outletTypeId: string, dto: UpdateOutletTypeDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { outletTypeId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(OUTLET_TYPE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: OUTLET_TYPE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(outletTypeId: string) {
    const existing = await this.findOne({ outletTypeId });

    if (!existing) throw new NotFoundException(OUTLET_TYPE.NOT_FOUND);

    await this.softDelete({ outletTypeId });

    return {
      statusCode: HttpStatus.OK,
      message: OUTLET_TYPE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(OUTLET_TYPE.DUPLICATE);
    }
    throw error;
  }
}
