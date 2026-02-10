/**
 * Province Service
 * ----------------
 * Purpose : Handles business logic for province lifecycle management
 * Used by : ProvinceController
 *
 * Responsibilities:
 * - Create provinces
 * - Restore soft-deleted provinces
 * - Fetch province lists with filters and pagination
 * - Retrieve single province details
 * - Update province information
 * - Soft-delete provinces
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Province name uniqueness is enforced per country
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

import { Province, ProvinceSchema } from 'src/core/database/mongo/schema/province.schema';

import { PROVINCE } from './province.constants';
import { CreateProvinceDto } from './dto/create-province.dto';
import { UpdateProvinceDto } from './dto/update-province.dto';
import { ProvinceQueryDto } from './dto/province-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class ProvinceService extends MongoRepository<Province> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Province.name, ProvinceSchema));
  }

  /**
   * Create Province
   * ---------------
   * Purpose : Create new province or restore soft-deleted province
   */
  async create(payload: CreateProvinceDto) {
    return this.withTransaction(async (session) => {
      const normalizedName = TextNormalizer.normalize(
        payload.name,
        NormalizeType.TITLE,
      );

      // Duplicate check scoped by country
      const existing = await this.findOne(
        {
          countryId: payload.countryId,
          name: { $regex: `^${normalizedName}$`, $options: 'i' } as any,
        },
        { session, includeDeleted: true },
      );

      if (existing && !existing.isDeleted) {
        throw new ConflictException(PROVINCE.DUPLICATE);
      }

      // Restore soft-deleted province
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            countryId: payload.countryId,
            name: normalizedName,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: PROVINCE.CREATED,
          data: { provinceId: existing.provinceId },
        };
      }

      // Create new province
      const province = await this.save(
        {
          provinceId: IdGenerator.generate('PROV', 8),
          countryId: payload.countryId,
          name: normalizedName,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: PROVINCE.CREATED,
        data: province,
      };
    });
  }

  /**
   * Get Provinces (List)
   * -------------------
   */
  async findAll(query: ProvinceQueryDto) {
    const { searchText, status, countryId, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (countryId) filter.countryId = countryId;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ provinceId: regex }, { name: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PROVINCE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Province by ID
   * -----------------
   */
  async findByProvinceId(provinceId: string) {
    const province = await this.findOne({ provinceId }, { lean: true });

    if (!province) throw new NotFoundException(PROVINCE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: PROVINCE.FETCHED,
      data: province,
    };
  }

  /**
   * Update Province
   * ---------------
   */
  async update(provinceId: string, dto: UpdateProvinceDto) {
    if (dto.name) {
      dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
    }

    const province = await this.updateOne({ provinceId }, dto);

    if (!province) throw new NotFoundException(PROVINCE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: PROVINCE.UPDATED,
      data: province,
    };
  }

  /**
   * Delete Province (Soft Delete)
   * ----------------------------
   */
  async delete(provinceId: string) {
    const deleted = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { provinceId, isDeleted: false },
        { session },
      );

      if (!existing) throw new NotFoundException(PROVINCE.NOT_FOUND);

      await this.softDelete({ provinceId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: PROVINCE.DELETED,
      data: deleted,
    };
  }
}
