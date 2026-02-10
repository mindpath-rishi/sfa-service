
/**
 * Country Service
 * ----------------
 * Purpose : Handles business logic for country lifecycle management
 * Used by : CountryController
 *
 * Responsibilities:
 * - Create countrys
 * - Restore soft-deleted countrys
 * - Fetch country lists with filters and pagination
 * - Retrieve single country details
 * - Update country information
 * - Soft-delete countrys
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Unique field constraints are enforced
 * - Soft deletes preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
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

  /**
   * Create Country
   * --------------
   * Purpose : Create new country or restore soft-deleted country
   */
  async create(payload: CreateCountryDto) {
    return this.withTransaction(async (session) => {
      // Normalize name if provided
      if (payload.name) {
        payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
      }

      // Check for existing record (including soft-deleted)
      const filter: FilterQuery<Country> = {};

      if (payload.name) {
          filter.name = payload.name;
        }

      

      const existing = await this.findOne(
        filter,
        { session, includeDeleted: true },
      );

      // If exists and not deleted, throw conflict
      if (existing && !existing.isDeleted) {
        throw new ConflictException(COUNTRY.DUPLICATE);
      }

      // Restore soft-deleted record
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

      // Create new record with system-generated ID
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
  }

  /**
   * Get Countrys (List)
   * -----------------
   */
  async findAll(query: CountryQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Country> = {};

    if (status) filter.status = status;
    

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { countryId: regex },
        { name: regex }
      ].filter(Boolean);
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

  /**
   * Get Country by countryId
   * ----------------------------
   */
  async findByCountryId(countryId: string) {
    const doc = await this.findOne({ countryId }, { lean: true });

    if (!doc) throw new NotFoundException(COUNTRY.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: COUNTRY.FETCHED,
      data: doc,
    };
  }

  /**
   * Update Country
   * ---------------
   */
async update(countryId: string, dto: UpdateCountryDto) {
  return this.withTransaction(async (session) => {
    // Normalize name if provided in update
    if (dto.name) {
      dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
    }

    // Check for unique field conflicts on update
    if (dto.name) {
        const existing = await this.findOne(
          {
            name: dto.name,
            countryId: { $ne: countryId }
          } as unknown as FilterQuery<Country>,
          { session },
        );

        if (existing) {
          throw new ConflictException(COUNTRY.DUPLICATE);
        }
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
}

  /**
   * Delete Country (Soft Delete)
   * ----------------------
   */
  async delete(countryId: string) {
    const deleted = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { countryId, isDeleted: false },
        { session },
      );

      if (!existing) throw new NotFoundException(COUNTRY.NOT_FOUND);

      await this.softDelete({ countryId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: COUNTRY.DELETED,
      data: deleted,
    };
  }

  /**
   * Handle database duplicate key errors
   */
  private handleDuplicateError(error: any): never {
    // Check if it's a MongoDB duplicate key error
    if (error.code === 11000 || error.code === 11001) {
      const fieldMatch = error.message.match(/index:\s*([^s]+)/);
      const fieldName = fieldMatch ? fieldMatch[1].split('_')[0] : 'unknown';
      
      throw new ConflictException(
        `${COUNTRY.DUPLICATE} (${fieldName})`
      );
    }
    throw error;
  }
}
