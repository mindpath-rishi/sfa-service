import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import {
  Designation,
  DesignationSchema,
} from 'src/core/database/mongo/schema/designation.schema';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';
import { DESIGNATION } from './designation.constants';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { DesignationQueryDto } from './dto/designation-query.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@Injectable()
export class DesignationService extends MongoRepository<Designation> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Designation.name, DesignationSchema));
  }

  async create(payload: CreateDesignationDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(
            payload.name,
            NormalizeType.TITLE,
          );
        }

        const existing = await this.findOne(
          { name: payload.name },
          { session, includeDeleted: true },
        );

        if (existing && !existing.isDeleted) {
          throw new ConflictException(DESIGNATION.DUPLICATE);
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
            message: DESIGNATION.CREATED,
            data: { designationId: existing.designationId },
          };
        }

        const doc = await this.save(
          {
            designationId: IdGenerator.generate('DESIG', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: DESIGNATION.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: DesignationQueryDto) {
    const {
      searchText,
      status,
      parentCategoryId,
      countryId,
      provinceId,
      marketId,
      page = 1,
      limit = 20,
    } = query;
    const filter: FilterQuery<Designation> = {};

    if (status) filter.status = status;
    if (parentCategoryId) filter.parentCategoryId = parentCategoryId;
    if (countryId) filter.countryId = countryId;
    if (provinceId) filter.provinceId = provinceId;
    if (marketId) filter.marketId = marketId;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { designationId: regex },
        { name: regex },
        { parentCategoryId: regex },
        { countryId: regex },
        { provinceId: regex },
        { marketId: regex },
      ];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: DESIGNATION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByDesignationId(designationId: string) {
    const doc = await this.findOne({ designationId }, { lean: true });

    if (!doc) throw new NotFoundException(DESIGNATION.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: DESIGNATION.FETCHED,
      data: doc,
    };
  }

  async update(designationId: string, dto: UpdateDesignationDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne({ designationId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(DESIGNATION.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: DESIGNATION.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(designationId: string) {
    const existing = await this.findOne({ designationId });

    if (!existing) throw new NotFoundException(DESIGNATION.NOT_FOUND);

    await this.softDelete({ designationId });

    return {
      statusCode: HttpStatus.OK,
      message: DESIGNATION.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(DESIGNATION.DUPLICATE);
    }
    throw error;
  }
}
