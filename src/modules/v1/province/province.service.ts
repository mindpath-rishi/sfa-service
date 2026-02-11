
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

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

  async create(payload: CreateProvinceDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<Province> = {};

        
        if (payload.name) filter.name = payload.name;

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(PROVINCE.DUPLICATE);
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
            message: PROVINCE.CREATED,
            data: { provinceId: existing.provinceId },
          };
        }

        const doc = await this.save(
          {
            provinceId: IdGenerator.generate('PROV', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: PROVINCE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: ProvinceQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Province> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ provinceId: regex }];
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

  async findByProvinceId(provinceId: string) {
    const doc = await this.findOne({ provinceId }, { lean: true });

    if (!doc) throw new NotFoundException(PROVINCE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: PROVINCE.FETCHED,
      data: doc,
    };
  }

  async update(provinceId: string, dto: UpdateProvinceDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { provinceId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(PROVINCE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: PROVINCE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(provinceId: string) {
    const existing = await this.findOne({ provinceId });

    if (!existing) throw new NotFoundException(PROVINCE.NOT_FOUND);

    await this.softDelete({ provinceId });

    return {
      statusCode: HttpStatus.OK,
      message: PROVINCE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(PROVINCE.DUPLICATE);
    }
    throw error;
  }
}
