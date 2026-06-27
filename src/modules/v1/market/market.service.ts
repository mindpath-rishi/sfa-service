
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { Market, MarketSchema } from 'src/core/database/mongo/schema/market.schema';

import { MARKET } from './market.constants';
import { CreateMarketDto } from './dto/create-market.dto';
import { UpdateMarketDto } from './dto/update-market.dto';
import { MarketQueryDto } from './dto/market-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class MarketService extends MongoRepository<Market> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Market.name, MarketSchema));
  }

  async create(payload: CreateMarketDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<Market> = {};

        
        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(MARKET.DUPLICATE);
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
            message: MARKET.CREATED,
            data: { marketId: existing.marketId },
          };
        }

        const doc = await this.save(
          {
            marketId: IdGenerator.generate('MARK', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: MARKET.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: MarketQueryDto) {
    const { searchText, status, provinceId, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Market> = {};

    if (status) filter.status = status;
    if (provinceId) filter.provinceId = provinceId;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ marketId: regex }, { name: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: MARKET.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByMarketId(marketId: string) {
    const doc = await this.findOne({ marketId }, { lean: true });

    if (!doc) throw new NotFoundException(MARKET.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: MARKET.FETCHED,
      data: doc,
    };
  }

  async update(marketId: string, dto: UpdateMarketDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { marketId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(MARKET.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: MARKET.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(marketId: string) {
    const existing = await this.findOne({ marketId });

    if (!existing) throw new NotFoundException(MARKET.NOT_FOUND);

    await this.softDelete({ marketId });

    return {
      statusCode: HttpStatus.OK,
      message: MARKET.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(MARKET.DUPLICATE);
    }
    throw error;
  }
}
