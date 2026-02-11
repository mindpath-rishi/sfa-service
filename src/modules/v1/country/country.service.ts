
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { Country, CountrySchema } from 'src/core/database/mongo/schema/country.schema';

import { COUNTRY } from './country.constants';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CountryQueryDto } from './dto/country-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class CountryService extends MongoRepository<Country> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Country.name, CountrySchema));
  }

  async create(payload: CreateCountryDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<Country> = {};

        
        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(COUNTRY.DUPLICATE);
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
            message: COUNTRY.CREATED,
            data: { countryId: existing.countryId },
          };
        }

        const doc = await this.save(
          {
            countryId: IdGenerator.generate('COUN', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: COUNTRY.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: CountryQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Country> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ countryId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: COUNTRY.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByCountryId(countryId: string) {
    const doc = await this.findOne({ countryId }, { lean: true });

    if (!doc) throw new NotFoundException(COUNTRY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: COUNTRY.FETCHED,
      data: doc,
    };
  }

  async update(countryId: string, dto: UpdateCountryDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { countryId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(COUNTRY.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: COUNTRY.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(countryId: string) {
    const existing = await this.findOne({ countryId });

    if (!existing) throw new NotFoundException(COUNTRY.NOT_FOUND);

    await this.softDelete({ countryId });

    return {
      statusCode: HttpStatus.OK,
      message: COUNTRY.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(COUNTRY.DUPLICATE);
    }
    throw error;
  }
}
