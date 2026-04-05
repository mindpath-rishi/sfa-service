import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  RouteCustomerMapping,
  RouteCustomerMappingSchema,
} from 'src/core/database/mongo/schema/route-customer-mapping.schema';

import { ROUTE_CUSTOMER_MAPPING } from './route-customer-mapping.constants';
import { CreateRouteCustomerMappingDto } from './dto/create-route-customer-mapping.dto';
import { UpdateRouteCustomerMappingDto } from './dto/update-route-customer-mapping.dto';
import { RouteCustomerMappingQueryDto } from './dto/route-customer-mapping-query.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';

@Injectable()
export class RouteCustomerMappingService extends MongoRepository<RouteCustomerMapping> {
  constructor(mongo: MongoService) {
    super(
      mongo.getModel(RouteCustomerMapping.name, RouteCustomerMappingSchema),
    );
  }

  async create(payload: CreateRouteCustomerMappingDto) {
    try {
      return await this.withTransaction(async (session) => {
        const { routeId, customerId, day } = payload;

        // ✅ Check existing ACTIVE mapping
        const existing = await this.findOne(
          { routeId, customerId, status: RouteCustomerMappingStatus.ACTIVE },
          { session },
        );

        if (existing) {
          throw new ConflictException(ROUTE_CUSTOMER_MAPPING.DUPLICATE);
        }

        const doc = await this.save(
          {
            mappingId: IdGenerator.generate('ROUT', 8),
            ...payload,
            status: RouteCustomerMappingStatus.ACTIVE,
            effectiveFrom: new Date(),
          },
          { session },
        );

        return {
          statusCode: HttpStatus.CREATED,
          message: ROUTE_CUSTOMER_MAPPING.CREATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: RouteCustomerMappingQueryDto) {
    const { searchText, status, page = 1, limit = 20, routeId } = query;

    const filter: FilterQuery<RouteCustomerMapping> = {};

    if (status) filter.status = status;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ mappingId: regex }];
    }

    if(routeId) filter.routeId = routeId;

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_CUSTOMER_MAPPING.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByMappingId(mappingId: string) {
    const doc = await this.findOne({ mappingId }, { lean: true });

    if (!doc) throw new NotFoundException(ROUTE_CUSTOMER_MAPPING.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_CUSTOMER_MAPPING.FETCHED,
      data: doc,
    };
  }

  async update(mappingId: string, dto: UpdateRouteCustomerMappingDto) {
    try {
      return await this.withTransaction(async (session) => {
        const doc = await this.updateOne({ mappingId }, dto, {
          session,
          new: true,
        });

        if (!doc) throw new NotFoundException(ROUTE_CUSTOMER_MAPPING.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: ROUTE_CUSTOMER_MAPPING.UPDATED,
          data: doc,
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(mappingId: string) {
    const existing = await this.findOne({ mappingId });

    if (!existing)
      throw new NotFoundException(ROUTE_CUSTOMER_MAPPING.NOT_FOUND);

    await this.softDelete({ mappingId });

    return {
      statusCode: HttpStatus.OK,
      message: ROUTE_CUSTOMER_MAPPING.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(ROUTE_CUSTOMER_MAPPING.DUPLICATE);
    }
    throw error;
  }
}
