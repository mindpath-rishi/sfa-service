
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { Beat, BeatSchema } from 'src/core/database/mongo/schema/beat.schema';

import { BEAT } from './beat.constants';
import { CreateBeatDto } from './dto/create-beat.dto';
import { UpdateBeatDto } from './dto/update-beat.dto';
import { BeatQueryDto } from './dto/beat-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class BeatService extends MongoRepository<Beat> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Beat.name, BeatSchema));
  }

  async create(payload: CreateBeatDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<Beat> = {};

        
        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(BEAT.DUPLICATE);
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
            message: BEAT.CREATED,
            data: { beatId: existing.beatId },
          };
        }

        const doc = await this.save(
          {
            beatId: IdGenerator.generate('BEAT', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: BEAT.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: BeatQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Beat> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ beatId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: BEAT.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByBeatId(beatId: string) {
    const doc = await this.findOne({ beatId }, { lean: true });

    if (!doc) throw new NotFoundException(BEAT.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: BEAT.FETCHED,
      data: doc,
    };
  }

  async update(beatId: string, dto: UpdateBeatDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { beatId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(BEAT.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: BEAT.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(beatId: string) {
    const existing = await this.findOne({ beatId });

    if (!existing) throw new NotFoundException(BEAT.NOT_FOUND);

    await this.softDelete({ beatId });

    return {
      statusCode: HttpStatus.OK,
      message: BEAT.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(BEAT.DUPLICATE);
    }
    throw error;
  }
}
