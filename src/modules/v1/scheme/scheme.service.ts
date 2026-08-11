import {
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  Scheme,
  SchemeSchema,
} from 'src/core/database/mongo/schema/scheme.schema';
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import { Model } from 'mongoose';

import { SchemeStatus } from 'src/shared/enums/scheme.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

import { SCHEME } from './scheme.constants';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { SchemeQueryDto } from './dto/scheme-query.dto';

@Injectable()
export class SchemeService extends MongoRepository<Scheme> {
  private readonly vanModel: Model<Van>;

  constructor(mongo: MongoService) {
    super(mongo.getModel(Scheme.name, SchemeSchema));
    this.vanModel = mongo.getModel(Van.name, VanSchema);
  }

  private async getVanProvinceId(vanId?: string) {
    if (!vanId) return undefined;

    const van = await this.vanModel
      .findOne({ vanId, isDeleted: { $ne: true } })
      .select('provinceId')
      .lean();

    return van?.provinceId;
  }

  async create(payload: CreateSchemeDto) {
    try {
      if (new Date(payload.startDate) > new Date(payload.endDate)) {
        throw new ConflictException(SCHEME.INVALID_PERIOD);
      }

      const doc = await this.save({
        schemeId: IdGenerator.generate('SCHM', 8),
        ...payload,
      });

      return {
        statusCode: HttpStatus.CREATED,
        message: SCHEME.CREATED,
        data: doc,
      };
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: SchemeQueryDto) {
    const {
      searchText,
      page = 1,
      limit = 20,
      categoryId,
      subCategoryId,
      productId,
      provinceId,
      routeId,
      vanId,
      schemeType,
      status,
      effectiveDate,
    } = query;

    const filter: FilterQuery<Scheme> = {};

    if (categoryId) filter.categoryIds = categoryId;
    if (subCategoryId) filter.subCategoryIds = subCategoryId;
    if (productId) filter.productIds = productId;
    if (provinceId) filter.provinceIds = provinceId;
    if (routeId) filter.routeIds = routeId;
    if (vanId) filter.vanIds = vanId;
    if (schemeType) filter.schemeType = schemeType;
    if (status) filter.status = status;

    if (effectiveDate) {
      filter.startDate = { $lte: effectiveDate };
      filter.endDate = { $gte: effectiveDate };
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ schemeId: regex }, { name: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: SCHEME.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findBySchemeId(schemeId: string) {
    const doc = await this.findOne({ schemeId }, { lean: true });

    if (!doc) throw new NotFoundException(SCHEME.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: SCHEME.FETCHED,
      data: doc,
    };
  }

  async update(schemeId: string, dto: UpdateSchemeDto) {
    try {
      const existing = await this.findOne({ schemeId });

      if (!existing) throw new NotFoundException(SCHEME.NOT_FOUND);

      const startDate = dto.startDate ?? existing.startDate;
      const endDate = dto.endDate ?? existing.endDate;

      if (new Date(startDate) > new Date(endDate)) {
        throw new ConflictException(SCHEME.INVALID_PERIOD);
      }

      const doc = await this.updateOne({ schemeId }, dto, { new: true });

      return {
        statusCode: HttpStatus.OK,
        message: SCHEME.UPDATED,
        data: doc,
      };
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(schemeId: string) {
    const existing = await this.findOne({ schemeId });

    if (!existing) throw new NotFoundException(SCHEME.NOT_FOUND);

    await this.softDelete({ schemeId });

    return {
      statusCode: HttpStatus.OK,
      message: SCHEME.DELETED,
      data: existing,
    };
  }

  /**
   * Find schemes applicable to a given product/geography combination
   * on a given date. Used by the mobile app to apply schemes at sale time.
   */
  async findApplicableSchemes(params: {
    productId: string;
    categoryId?: string;
    subCategoryId?: string;
    provinceId?: string;
    routeId?: string;
    vanId?: string;
    date?: Date;
  }) {
    const {
      productId,
      categoryId,
      subCategoryId,
      routeId,
      vanId,
      date = new Date(),
    } = params;
    const provinceId = await this.getVanProvinceId(vanId);
    const effectiveDayStart = new Date(date);
    const effectiveDayEnd = new Date(date);
    effectiveDayStart.setUTCHours(0, 0, 0, 0);
    effectiveDayEnd.setUTCHours(23, 59, 59, 999);

    const productClause: FilterQuery<Scheme>[] = [{ productIds: productId }];

    for (const categoryValue of [categoryId, subCategoryId]) {
      if (!categoryValue) continue;
      productClause.push(
        { categoryIds: categoryValue },
        { subCategoryIds: categoryValue },
      );
    }
    productClause.push({
      categoryIds: { $size: 0 },
      subCategoryIds: { $size: 0 },
      productIds: { $size: 0 },
    });

    const geographyClause: FilterQuery<Scheme>[] = [];
    if (provinceId) geographyClause.push({ provinceIds: provinceId });
    if (routeId) geographyClause.push({ routeIds: routeId });
    if (vanId) geographyClause.push({ vanIds: vanId });
    geographyClause.push({
      provinceIds: { $size: 0 },
      routeIds: { $size: 0 },
      vanIds: { $size: 0 },
    });

    const filter: FilterQuery<Scheme> = {
      status: SchemeStatus.ACTIVE,
      isDeleted: false,
      startDate: { $lte: effectiveDayEnd },
      endDate: { $gte: effectiveDayStart },
      $and: [{ $or: productClause }, { $or: geographyClause }],
    };

    return this.findLean(filter);
  }

  async findApplicableSchemesForProducts(
    products: {
      productId: string;
      categoryId?: string;
      parentCategoryId?: string;
    }[],
    params: {
      provinceId?: string;
      routeId?: string;
      vanId?: string;
      date?: Date;
    } = {},
  ) {
    if (!products.length) return new Map<string, Scheme[]>();

    const date = params.date ?? new Date();
    const provinceId = await this.getVanProvinceId(params.vanId);
    const effectiveDayStart = new Date(date);
    const effectiveDayEnd = new Date(date);
    effectiveDayStart.setUTCHours(0, 0, 0, 0);
    effectiveDayEnd.setUTCHours(23, 59, 59, 999);

    const productIds = [
      ...new Set(products.map((product) => product.productId)),
    ];
    const categoryIds = [
      ...new Set(
        products
          .flatMap((product) => [product.categoryId, product.parentCategoryId])
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const productClause: FilterQuery<Scheme>[] = [
      { productIds: { $in: productIds } },
      { categoryIds: { $in: categoryIds } },
      { subCategoryIds: { $in: categoryIds } },
      {
        categoryIds: { $size: 0 },
        subCategoryIds: { $size: 0 },
        productIds: { $size: 0 },
      },
    ];
    const geographyClause: FilterQuery<Scheme>[] = [];
    if (provinceId) geographyClause.push({ provinceIds: provinceId });
    if (params.routeId) geographyClause.push({ routeIds: params.routeId });
    if (params.vanId) geographyClause.push({ vanIds: params.vanId });
    geographyClause.push({
      provinceIds: { $size: 0 },
      routeIds: { $size: 0 },
      vanIds: { $size: 0 },
    });

    const schemes = await this.findLean({
      status: SchemeStatus.ACTIVE,
      isDeleted: false,
      startDate: { $lte: effectiveDayEnd },
      endDate: { $gte: effectiveDayStart },
      $and: [{ $or: productClause }, { $or: geographyClause }],
    });

    return new Map(
      products.map((product) => {
        const applicable = schemes.filter((scheme) => {
          const hasProductScope = Boolean(
            scheme.productIds?.length ||
            scheme.categoryIds?.length ||
            scheme.subCategoryIds?.length,
          );
          if (!hasProductScope) return true;

          return (
            scheme.productIds?.includes(product.productId) ||
            (product.categoryId &&
              (scheme.categoryIds?.includes(product.categoryId) ||
                scheme.subCategoryIds?.includes(product.categoryId))) ||
            (product.parentCategoryId &&
              (scheme.categoryIds?.includes(product.parentCategoryId) ||
                scheme.subCategoryIds?.includes(product.parentCategoryId)))
          );
        });

        return [product.productId, applicable];
      }),
    );
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(SCHEME.DUPLICATE);
    }
    throw error;
  }
}
