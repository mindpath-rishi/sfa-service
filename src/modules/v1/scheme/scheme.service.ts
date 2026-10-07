import {
  BadRequestException,
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
import {
  Product,
  ProductSchema,
} from 'src/core/database/mongo/schema/product.schema';
import { Model } from 'mongoose';

import {
  SchemeFreeUnit,
  SchemeStatus,
  SchemeType,
} from 'src/shared/enums/scheme.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

import { SCHEME } from './scheme.constants';
import { CreateSchemeDto } from './dto/create-scheme.dto';
import { UpdateSchemeDto } from './dto/update-scheme.dto';
import { SchemeQueryDto } from './dto/scheme-query.dto';

@Injectable()
export class SchemeService extends MongoRepository<Scheme> {
  private readonly vanModel: Model<Van>;
  private readonly productModel: Model<Product>;

  constructor(mongo: MongoService) {
    super(mongo.getModel(Scheme.name, SchemeSchema));
    this.vanModel = mongo.getModel(Van.name, VanSchema);
    this.productModel = mongo.getModel(Product.name, ProductSchema);
  }

  /**
   * Validate the fields a group scheme needs and fill the free product name.
   * `scheme` is the full (merged) scheme as it will be stored.
   */
  private async prepareGroupScheme(
    scheme: Partial<CreateSchemeDto>,
  ): Promise<Partial<CreateSchemeDto>> {
    const { schemeType } = scheme;
    if (schemeType === SchemeType.COMBO_FREE_QTY) {
      return this.prepareComboScheme(scheme);
    }
    if (
      schemeType !== SchemeType.GROUP_FREE_QTY &&
      schemeType !== SchemeType.GROUP_FREE_PERCENT
    ) {
      return {};
    }

    const hasScope = Boolean(
      scheme.categoryIds?.length ||
      scheme.subCategoryIds?.length ||
      scheme.productIds?.length,
    );
    if (!hasScope) throw new BadRequestException(SCHEME.GROUP_SCOPE_REQUIRED);
    if (!(Number(scheme.groupMinCases) > 0)) {
      throw new BadRequestException(SCHEME.GROUP_MIN_CASES_REQUIRED);
    }

    if (schemeType === SchemeType.GROUP_FREE_PERCENT) {
      if (!(Number(scheme.freePercent) > 0)) {
        throw new BadRequestException(SCHEME.GROUP_FREE_PERCENT_REQUIRED);
      }
      return {};
    }

    if (!(Number(scheme.freeQty) > 0) || !scheme.freeProductId) {
      throw new BadRequestException(SCHEME.GROUP_FREE_QTY_REQUIRED);
    }
    const product = await this.productModel
      .findOne({ productId: scheme.freeProductId, isDeleted: { $ne: true } })
      .select('productId name')
      .lean();
    if (!product) {
      throw new BadRequestException(
        `Free product not found: ${scheme.freeProductId}`,
      );
    }
    return { freeProductName: scheme.freeProductName || product.name };
  }

  /**
   * COMBO_FREE_QTY: validate the combo products and free product, fill product
   * names, and scope the scheme to exactly the combo products so it is attached
   * to each of their cart lines.
   */
  private async prepareComboScheme(
    scheme: Partial<CreateSchemeDto>,
  ): Promise<Partial<CreateSchemeDto>> {
    const comboItems = (scheme.comboItems ?? []).map((item) => ({
      productId: String(item.productId ?? '').trim(),
      productName: item.productName,
      qty: Number(item.qty) || 0,
      unit:
        item.unit === SchemeFreeUnit.PIECE
          ? SchemeFreeUnit.PIECE
          : SchemeFreeUnit.CASE,
    }));
    if (
      !comboItems.length ||
      comboItems.some((item) => !item.productId || item.qty <= 0)
    ) {
      throw new BadRequestException(SCHEME.COMBO_ITEMS_REQUIRED);
    }
    const comboProductIds = comboItems.map((item) => item.productId);
    if (new Set(comboProductIds).size !== comboProductIds.length) {
      throw new BadRequestException(SCHEME.COMBO_DUPLICATE_PRODUCT);
    }
    if (!(Number(scheme.freeQty) > 0) || !scheme.freeProductId) {
      throw new BadRequestException(SCHEME.COMBO_FREE_QTY_REQUIRED);
    }

    const productIds = [...new Set([...comboProductIds, scheme.freeProductId])];
    const products = await this.productModel
      .find({ productId: { $in: productIds }, isDeleted: { $ne: true } })
      .select('productId name')
      .lean();
    const nameById = new Map(
      products.map((product) => [product.productId, product.name]),
    );
    const missing = productIds.filter((productId) => !nameById.has(productId));
    if (missing.length) {
      throw new BadRequestException(`Product not found: ${missing.join(', ')}`);
    }

    return {
      comboItems: comboItems.map((item) => ({
        ...item,
        productName: item.productName || nameById.get(item.productId),
      })),
      productIds: comboProductIds,
      categoryIds: [],
      subCategoryIds: [],
      freeProductName:
        scheme.freeProductName || nameById.get(scheme.freeProductId),
    };
  }

  /**
   * A scheme must match every geography dimension it defines
   * (province AND route AND van); within a dimension any listed value matches.
   * An empty dimension applies everywhere.
   */
  private geographyClause(params: {
    provinceId?: string;
    routeId?: string;
    vanId?: string;
  }): FilterQuery<Scheme>[] {
    const dimension = (
      field: 'provinceIds' | 'routeIds' | 'vanIds',
      value?: string,
    ) => ({
      $or: [
        { [field]: { $exists: false } },
        { [field]: { $size: 0 } },
        ...(value ? [{ [field]: value }] : []),
      ],
    });

    return [
      dimension('provinceIds', params.provinceId),
      dimension('routeIds', params.routeId),
      dimension('vanIds', params.vanId),
    ] as FilterQuery<Scheme>[];
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

      const groupFields = await this.prepareGroupScheme(payload);

      const doc = await this.save({
        schemeId: IdGenerator.generate('SCHM', 8),
        ...payload,
        ...groupFields,
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

      const existingScheme = (
        typeof (existing as any).toObject === 'function'
          ? (existing as any).toObject()
          : existing
      ) as Partial<CreateSchemeDto>;
      const groupFields = await this.prepareGroupScheme({
        ...existingScheme,
        ...dto,
      });

      const doc = await this.updateOne(
        { schemeId },
        { ...dto, ...groupFields },
        { new: true },
      );

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
    const provinceId =
      params.provinceId || (await this.getVanProvinceId(vanId));
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

    const filter: FilterQuery<Scheme> = {
      status: SchemeStatus.ACTIVE,
      isDeleted: false,
      startDate: { $lte: effectiveDayEnd },
      endDate: { $gte: effectiveDayStart },
      $and: [
        { $or: productClause },
        ...this.geographyClause({ provinceId, routeId, vanId }),
      ],
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
    const provinceId =
      params.provinceId || (await this.getVanProvinceId(params.vanId));
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
    const schemes = await this.findLean({
      status: SchemeStatus.ACTIVE,
      isDeleted: false,
      startDate: { $lte: effectiveDayEnd },
      endDate: { $gte: effectiveDayStart },
      $and: [
        { $or: productClause },
        ...this.geographyClause({
          provinceId,
          routeId: params.routeId,
          vanId: params.vanId,
        }),
      ],
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
