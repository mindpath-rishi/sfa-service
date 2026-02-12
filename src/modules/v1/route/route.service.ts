
import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import { Route, RouteSchema } from 'src/core/database/mongo/schema/route.schema';

import { ROUTE } from './route.constants';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { RouteQueryDto } from './dto/route-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';

@Injectable()
export class RouteService extends MongoRepository<Route> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Route.name, RouteSchema));
  }

  async create(payload: CreateRouteDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.name) {
          payload.name = TextNormalizer.normalize(payload.name, NormalizeType.TITLE);
        }

        const filter: FilterQuery<Route> = {};

        

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(ROUTE.DUPLICATE);
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
            message: ROUTE.CREATED,
            data: { routeId: existing.routeId },
          };
        }

        const doc = await this.save(
          {
            routeId: IdGenerator.generate('ROUT', 8),
            ...payload,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: ROUTE.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: RouteQueryDto) {
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Route> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ routeId: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByRouteId(routeId: string) {
    const doc = await this.findOne({ routeId }, { lean: true });

    if (!doc) throw new NotFoundException(ROUTE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.FETCHED,
      data: doc,
    };
  }

  async update(routeId: string, dto: UpdateRouteDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (dto.name) {
          dto.name = TextNormalizer.normalize(dto.name, NormalizeType.TITLE);
        }

        const doc = await this.updateOne(
          { routeId },
          dto,
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(ROUTE.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ROUTE.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(routeId: string) {
    const existing = await this.findOne({ routeId });

    if (!existing) throw new NotFoundException(ROUTE.NOT_FOUND);

    await this.softDelete({ routeId });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(ROUTE.DUPLICATE);
    }
    throw error;
  }
}
