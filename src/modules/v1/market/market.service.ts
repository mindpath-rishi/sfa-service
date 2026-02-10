/**
 * Market Service
 * --------------
 * Purpose : Handles business logic for market lifecycle management
 * Used by : MarketController
 *
 * Responsibilities:
 * - Create markets
 * - Restore soft-deleted markets
 * - Fetch market lists with filters and pagination
 * - Retrieve single market details
 * - Update market information
 * - Soft-delete markets
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Market name uniqueness is enforced
 * - Soft deletes preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

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

  /**
   * Create Market
   * -------------
   * Purpose : Create new market or restore soft-deleted market
   */
  async create(payload: CreateMarketDto) {
    return this.withTransaction(async (session) => {
      const normalizedName = TextNormalizer.normalize(
        payload.name,
        NormalizeType.TITLE,
      );

      const existing = await this.findOne(
        {
          name: { $regex: `^${normalizedName}$`, $options: 'i' } as any,
        },
        { session, includeDeleted: true },
      );

      if (existing && !existing.isDeleted) {
        throw new ConflictException(MARKET.DUPLICATE);
      }

      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            name: normalizedName,
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

      const market = await this.save(
        {
          marketId: IdGenerator.generate('MKT', 8),
          name: normalizedName,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: MARKET.CREATED,
        data: market,
      };
    });
  }

  async findAll(query: MarketQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) filter.status = status;

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
    const market = await this.findOne({ marketId }, { lean: true });

    if (!market) throw new NotFoundException(MARKET.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: MARKET.FETCHED,
      data: market,
    };
  }

  async update(marketId: string, dto: UpdateMarketDto) {
    if (dto.name) {
      dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
    }

    const market = await this.updateOne({ marketId }, dto);

    if (!market) throw new NotFoundException(MARKET.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: MARKET.UPDATED,
      data: market,
    };
  }

  async delete(marketId: string) {
    const deleted = await this.withTransaction(async (session) => {
      const existing = await this.findOne({ marketId, isDeleted: false }, { session });

      if (!existing) throw new NotFoundException(MARKET.NOT_FOUND);

      await this.softDelete({ marketId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: MARKET.DELETED,
      data: deleted,
    };
  }
}
