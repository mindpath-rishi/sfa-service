
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { Channel, ChannelSchema } from 'src/core/database/mongo/schema/channel.schema';

import { CHANNEL } from './channel.constants';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ChannelQueryDto } from './dto/channel-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class ChannelService extends MongoRepository<Channel> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Channel.name, ChannelSchema));
  }

  async create(payload: CreateChannelDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<Channel> = {};

        
        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(CHANNEL.DUPLICATE);
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
            message: CHANNEL.CREATED,
            data: { channelId: existing.channelId },
          };
        }

        const doc = await this.save(
          {
            channelId: IdGenerator.generate('CHAN', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: CHANNEL.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: ChannelQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Channel> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ channelId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: CHANNEL.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByChannelId(channelId: string) {
    const doc = await this.findOne({ channelId }, { lean: true });

    if (!doc) throw new NotFoundException(CHANNEL.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: CHANNEL.FETCHED,
      data: doc,
    };
  }

  async update(channelId: string, dto: UpdateChannelDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { channelId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(CHANNEL.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: CHANNEL.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(channelId: string) {
    const existing = await this.findOne({ channelId });

    if (!existing) throw new NotFoundException(CHANNEL.NOT_FOUND);

    await this.softDelete({ channelId });

    return {
      statusCode: HttpStatus.OK,
      message: CHANNEL.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(CHANNEL.DUPLICATE);
    }
    throw error;
  }
}
