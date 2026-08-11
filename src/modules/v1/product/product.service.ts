/**
 * Product Service
 * ----------------
 * Purpose : Handles business logic for product master lifecycle management
 * Used by : ProductController
 *
 * Responsibilities:
 * - Create product master records
 * - Restore soft-deleted products
 * - Fetch products with filters and pagination
 * - Retrieve single product details
 * - Update product information
 * - Soft-delete products
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Product master acts as source of truth
 * - Inventory quantities are handled separately
 * - Soft deletes preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Product,
  ProductSchema,
} from 'src/core/database/mongo/schema/product.schema';

import { ProductQueryDto } from './dto/product-query.dto';
import { PRODUCT } from './product.constants';
import { ProductCreateDto } from './dto/create-product.dto';
import { ProductUpdateDto } from './dto/update-product.dto';
import { BulkUpdateFocusedPackDto } from './dto/bulk-update-focused-pack.dto';
import { RequestContextStore } from 'src/core/context/request-context';
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';
import { PriceType, ProductStatus } from 'src/shared/enums/product.enums';
import * as XLSX from 'xlsx';
import {
  ProductCategory,
  ProductCategorySchema,
} from 'src/core/database/mongo/schema/product-category';
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import {
  WorkSession,
  WorkSessionSchema,
} from 'src/core/database/mongo/schema/work-session.schema';
import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';
import { SchemeService } from '../scheme/scheme.service';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

const round4 = (value: number) => Number(value.toFixed(4));

@Injectable()
export class ProductService extends MongoRepository<Product> {
  private readonly productCategoryModel;
  private readonly vanModel;
  private readonly workSessionModel;

  constructor(
    mongo: MongoService,
    private readonly oracleRepository: OracleRepository,
    private readonly schemeService: SchemeService,
  ) {
    super(mongo.getModel(Product.name, ProductSchema));
    this.productCategoryModel = mongo.getModel(
      ProductCategory.name,
      ProductCategorySchema,
    );
    this.vanModel = mongo.getModel(Van.name, VanSchema);
    this.workSessionModel = mongo.getModel(WorkSession.name, WorkSessionSchema);
  }

  private async attachApplicableSchemes(
    products: any[],
    query: ProductQueryDto,
    fallbackVanId?: string | null,
  ) {
    if (query.includeSchemes !== 'true' || !products.length) return products;

    const schemesByProduct =
      await this.schemeService.findApplicableSchemesForProducts(products, {
        provinceId: query.provinceId,
        routeId: query.routeId,
        vanId: query.vanId || fallbackVanId || undefined,
      });

    return products.map((product) => ({
      ...product,
      applicableSchemes: schemesByProduct.get(product.productId) ?? [],
    }));
  }

  private async attachCategoryNames(products: any[]) {
    if (!products.length) return products;

    const categoryIds = [
      ...new Set(
        products
          .flatMap((product) => [product.parentCategoryId, product.categoryId])
          .filter(Boolean)
          .map(String),
      ),
    ];

    const categories = categoryIds.length
      ? await this.productCategoryModel
          .find({
            categoryId: { $in: categoryIds },
            isDeleted: false,
          })
          .select({ categoryId: 1, name: 1, _id: 0 })
          .lean()
      : [];

    const categoryNameById = new Map(
      categories.map((category: any) => [
        String(category.categoryId),
        category.name,
      ]),
    );

    return products.map((product) => ({
      ...product,
      parentCategory:
        categoryNameById.get(String(product.parentCategoryId || '')) ||
        product.parentCategoryName ||
        product.parentCategoryId ||
        '',
      subCategory:
        categoryNameById.get(String(product.categoryId || '')) ||
        product.categoryName ||
        product.categoryId ||
        '',
    }));
  }

  private getExportColumns(columns?: string) {
    const definitions = [
      { key: 'primary', title: 'Product' },
      { key: 'productId', title: 'Product ID' },
      { key: 'productSysCode', title: 'System Code' },
      { key: 'compCode', title: 'Company Code' },
      { key: 'categoryId', title: 'Sub Category' },
      { key: 'parentCategoryId', title: 'Parent Category' },
      { key: 'casePrice', title: 'Case Price' },
      { key: 'piecePrice', title: 'Piece Price' },
      { key: 'caseNetWeight', title: 'Case Net Weight' },
      { key: 'pieceNetWeight', title: 'Piece Net Weight' },
      { key: 'priceType', title: 'Price Type' },
      { key: 'unitType', title: 'Unit Type' },
      { key: 'unitSize', title: 'Unit Size' },
      { key: 'unitQtyInCase', title: 'Units / Case' },
      { key: 'isFocusedPack', title: 'Focused Pack' },
      { key: 'status', title: 'Status' },
    ];
    const requested = columns
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const selected = requested?.length
      ? definitions.filter((column) => requested.includes(column.key))
      : definitions;
    return selected.length ? selected : definitions;
  }

  private escapePdfText(value: string) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private buildPdfBuffer(title: string, rows: string[][]) {
    const [headers = [], ...dataRows] = rows;
    const pageWidth = 842;
    const pageHeight = 595;
    const margin = 28;
    const tableWidth = pageWidth - margin * 2;
    const columnWidth = tableWidth / Math.max(headers.length, 1);
    const headerY = pageHeight - 96;
    const rowHeight = 23;
    const headerHeight = 25;
    const rowsPerPage = Math.max(
      1,
      Math.floor((headerY - margin - headerHeight) / rowHeight),
    );
    const pageRows: string[][][] = [];
    for (let index = 0; index < dataRows.length; index += rowsPerPage) {
      pageRows.push(dataRows.slice(index, index + rowsPerPage));
    }
    if (!pageRows.length) pageRows.push([]);
    const formatDate = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: REPORT_TIMEZONE,
    }).format(new Date());
    const fontSize = headers.length > 7 ? 6.5 : 7.5;
    const headerFontSize = headers.length > 7 ? 6.8 : 7.8;
    const textLimit = (width: number, size: number) =>
      Math.max(6, Math.floor(width / (size * 0.52)));
    const truncate = (value: string, limit: number) => {
      const cleanValue = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      return cleanValue.length > limit
        ? `${cleanValue.slice(0, Math.max(0, limit - 3))}...`
        : cleanValue;
    };
    const text = (x: number, y: number, value: string, size = fontSize) =>
      `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${this.escapePdfText(value)}) Tj ET`;
    const rect = (
      x: number,
      y: number,
      width: number,
      height: number,
      mode: 'S' | 'f' = 'S',
    ) =>
      `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${mode}`;
    const objects: string[] = [];
    const pageObjectIds: number[] = [];
    const fontObjectId = 3;
    let nextObjectId = 4;
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[fontObjectId] =
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    for (const [pageIndex, rowsForPage] of pageRows.entries()) {
      const pageObjectId = nextObjectId;
      const contentObjectId = nextObjectId + 1;
      nextObjectId += 2;
      pageObjectIds.push(pageObjectId);
      const commands: string[] = [
        '0.08 0.13 0.2 rg',
        text(margin, pageHeight - 42, title, 16),
        '0.35 0.43 0.53 rg',
        text(
          margin,
          pageHeight - 62,
          `Generated ${formatDate} - ${dataRows.length} row(s)`,
          8,
        ),
        text(
          pageWidth - margin - 84,
          pageHeight - 62,
          `Page ${pageIndex + 1} of ${pageRows.length}`,
          8,
        ),
        '0.15 0.39 0.92 rg',
        rect(margin, headerY, tableWidth, headerHeight, 'f'),
        '1 1 1 rg',
        ...headers.map((header, columnIndex) =>
          text(
            margin + columnIndex * columnWidth + 5,
            headerY + 9,
            truncate(header, textLimit(columnWidth - 10, headerFontSize)),
            headerFontSize,
          ),
        ),
      ];
      rowsForPage.forEach((row, rowIndex) => {
        const y = headerY - (rowIndex + 1) * rowHeight;
        if (rowIndex % 2 === 0)
          commands.push(
            '0.96 0.98 1 rg',
            rect(margin, y, tableWidth, rowHeight, 'f'),
          );
        commands.push(
          '0.85 0.89 0.94 RG',
          rect(margin, y, tableWidth, rowHeight),
          '0.08 0.13 0.2 rg',
        );
        row.forEach((value, columnIndex) => {
          const x = margin + columnIndex * columnWidth;
          commands.push(
            '0.85 0.89 0.94 RG',
            rect(x, y, columnWidth, rowHeight),
            '0.08 0.13 0.2 rg',
            text(
              x + 5,
              y + 8,
              truncate(value, textLimit(columnWidth - 10, fontSize)),
              fontSize,
            ),
          );
        });
      });
      const content = commands.join('\n');
      objects[pageObjectId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
      objects[contentObjectId] =
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    }
    objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let id = 1; id < objects.length; id += 1) {
      if (!objects[id]) continue;
      offsets[id] = Buffer.byteLength(pdf);
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) {
      pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf);
  }

  /**
   * Create Product
   * --------------
   * Purpose : Create new product or restore soft-deleted product
   *
   * Flow:
   * - Check for existing product (including soft-deleted)
   * - Restore soft-deleted product if found
   * - Create new product if not exists
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active products
   */
  async create(payload: ProductCreateDto) {
    return this.withTransaction(async (session) => {
      const unitQtyInCase = payload.unitQtyInCase || 1;
      const casePrice = payload.casePrice ?? payload.price;
      const caseNetWeight =
        payload.caseNetWeight ??
        (payload.netWeight !== undefined
          ? payload.netWeight * unitQtyInCase
          : undefined);

      if (casePrice === undefined || caseNetWeight === undefined) {
        throw new BadRequestException(
          'casePrice and caseNetWeight are required',
        );
      }

      // Check existing product (including soft-deleted)
      const existing = await this.findOne(
        {
          $or: [
            { productId: payload.productId },
            { productSysCode: payload.productSysCode },
          ],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active product
      if (existing && !existing.isDeleted) {
        throw new ConflictException(PRODUCT.DUPLICATE);
      }

      // Restore soft-deleted product
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            compCode: payload.productSysCode,
            name: payload.name,
            categoryId: payload.categoryId,
            parentCategoryId: payload.parentCategoryId,
            productSysCode: payload.productSysCode,
            casePrice,
            piecePrice: round4(casePrice / unitQtyInCase),
            caseNetWeight,
            pieceNetWeight: round4(caseNetWeight / unitQtyInCase),
            priceType: payload.priceType,
            unitType: payload.unitType,
            unitSize: payload.unitSize,
            isFocusedPack: payload.isFocusedPack ?? 'N',
            unitQtyInCase,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: PRODUCT.CREATED,
          data: { productId: existing.productId },
        };
      }

      // Create new product
      const product = await this.save(
        {
          compCode: payload.productSysCode,
          productId: payload.productId,
          name: payload.name,
          categoryId: payload.categoryId,
          parentCategoryId: payload.parentCategoryId,
          productSysCode: payload.productSysCode,
          casePrice,
          piecePrice: round4(casePrice / unitQtyInCase),
          caseNetWeight,
          pieceNetWeight: round4(caseNetWeight / unitQtyInCase),
          priceType: payload.priceType,
          unitType: payload.unitType,
          unitSize: payload.unitSize,
          isFocusedPack: payload.isFocusedPack ?? 'N',
          unitQtyInCase,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: PRODUCT.CREATED,
        data: product,
      };
    });
  }

  /**
   * Sync Products From ERP Oracle
   * -----------------------------
   * Source table : ESS_PRODUCT
   * Target table : product_master
   */
  async syncProductsFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.ORACLE_DISABLED,
        data: {
          synced: 0,
          skipped: true,
        },
      };
    }

    const toStringSafe = (value: any): string => {
      return String(value ?? '').trim();
    };

    const toNumberSafe = (value: any, defaultValue = 0): number => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : defaultValue;
    };

    const rows = await this.oracleRepository.query<any>(
      `
    SELECT
      VC_COMP_CODE           AS "compCode",
      VC_ITEM_CODE           AS "itemCode",
      VC_ITEM_DESC           AS "itemDesc",
      VC_TECH_DESC           AS "techDesc",
      VC_UNIT                AS "unitType",
      NU_SELLING_PRICE       AS "sellingPrice",
      NU_BASIC_PRICE         AS "basicPrice",
      VC_ITEM_GROUP          AS "itemGroup",
      VC_ITEM_SUB_GROUP      AS "itemSubGroup",
      CH_STATUS              AS "erpStatus",
      NU_NET_WT              AS "netWeight",
      NU_OUTER_QTY           AS "outerQty",
      PRODUCT_TYPE           AS "parentCategoryName",
      SUB_PRODUCT_TYPE       AS "categoryName",
      PRODUCT_TYPE_CODE      AS "parentCategoryCode",
      SUB_PRODUCT_TYPE_CODE  AS "categoryCode"
    FROM ESS_PRODUCT
    WHERE VC_ITEM_CODE IS NOT NULL
    `,
    );

    if (!rows.length) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.NOT_FOUND,
        data: {
          synced: 0,
        },
      };
    }

    /**
     * Deduplicate ERP rows by itemCode because productId is unique in Mongo.
     * If same item appears multiple times, latest row in Oracle result will be used.
     */
    const uniqueRowsMap = new Map<string, any>();

    for (const row of rows) {
      const itemCode = toStringSafe(row.itemCode);

      if (!itemCode) continue;

      uniqueRowsMap.set(itemCode, row);
    }

    const uniqueRows = Array.from(uniqueRowsMap.values());

    const operations: any = uniqueRows.map((row) => {
      const compCode = toStringSafe(row.compCode);
      const itemCode = toStringSafe(row.itemCode);

      const productId = itemCode;
      const productSysCode = itemCode;

      const unitQtyInCase = Math.max(toNumberSafe(row.outerQty, 1), 1);

      const casePrice = toNumberSafe(row.sellingPrice ?? row.basicPrice, 0);

      const piecePrice = round4(casePrice / unitQtyInCase);

      const caseNetWeight = toNumberSafe(row.netWeight, 0);

      const pieceNetWeight = round4(caseNetWeight / unitQtyInCase);

      const name =
        toStringSafe(row.itemDesc) || toStringSafe(row.techDesc) || itemCode;

      const categoryId =
        toStringSafe(row.categoryCode) ||
        toStringSafe(row.itemGroup) ||
        'UNCATEGORIZED';

      const parentCategoryId = toStringSafe(row.parentCategoryCode);

      const unitType = toStringSafe(row.unitType) || undefined;

      const unitSize = null;

      return {
        updateOne: {
          filter: {
            productId,
          },
          update: {
            $set: {
              compCode,
              productId,
              name,
              productSysCode,
              categoryId,

              casePrice,
              piecePrice,

              caseNetWeight,
              pieceNetWeight,

              priceType: PriceType.STANDARD,

              unitType,
              unitSize,
              unitQtyInCase,

              isDeleted: false,
              parentCategoryId,
            },
          },
          upsert: true,
        },
      };
    });

    if (!operations.length) {
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.NOT_FOUND,
        data: {
          synced: 0,
        },
      };
    }

    const result = await this.model.bulkWrite(operations, {
      ordered: false,
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.SYNCED,
      data: {
        totalERPRecords: rows.length,
        totalUniqueRecords: uniqueRows.length,
        totalValidRecords: operations.length,
        inserted: result.upsertedCount || 0,
        updated: result.modifiedCount || 0,
        matched: result.matchedCount || 0,
        synced: operations.length,
      },
    };
  }

  async exportProducts(query: ProductQueryDto) {
    const filter: Record<string, any> = {};
    const selectedCategoryIds =
      query.categoryIds?.split(',').filter(Boolean) ?? [];
    const categoryFilter = selectedCategoryIds.length
      ? [
          { categoryId: { $in: selectedCategoryIds } },
          { parentCategoryId: { $in: selectedCategoryIds } },
        ]
      : [];
    const searchFilter = query.searchText
      ? [
          { name: new RegExp(query.searchText, 'i') },
          { productId: new RegExp(query.searchText, 'i') },
          { productSysCode: new RegExp(query.searchText, 'i') },
        ]
      : [];
    if (categoryFilter.length && searchFilter.length) {
      filter.$and = [{ $or: categoryFilter }, { $or: searchFilter }];
    } else if (categoryFilter.length || searchFilter.length) {
      filter.$or = categoryFilter.length ? categoryFilter : searchFilter;
    }
    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.parentCategoryId)
      filter.parentCategoryId = query.parentCategoryId;
    if (query.status) filter.status = query.status;
    if (query.isFocusedPack) filter.isFocusedPack = query.isFocusedPack;
    if (query.minPrice || query.maxPrice) {
      filter.casePrice = {
        ...(query.minPrice ? { $gte: Number(query.minPrice) } : {}),
        ...(query.maxPrice ? { $lte: Number(query.maxPrice) } : {}),
      };
    }

    const [products, categories] = await Promise.all([
      this.findLean(filter, { sort: { createdAt: -1 } }),
      this.productCategoryModel.find({ isDeleted: false }).lean(),
    ]);
    const categoryNameById = new Map(
      categories.map((category: any) => [category.categoryId, category.name]),
    );
    const columns = this.getExportColumns(query.columns);
    const exportRows = products.map((product: any) => {
      const values: Record<string, string> = {
        primary: product.name || '',
        productId: product.productId || '',
        productSysCode: product.productSysCode || '',
        compCode: product.compCode || '',
        categoryId:
          categoryNameById.get(product.categoryId) || product.categoryId || '',
        parentCategoryId:
          categoryNameById.get(product.parentCategoryId) ||
          product.parentCategoryId ||
          '',
        casePrice:
          product.casePrice !== undefined ? String(product.casePrice) : '',
        piecePrice:
          product.piecePrice !== undefined ? String(product.piecePrice) : '',
        caseNetWeight:
          product.caseNetWeight !== undefined
            ? String(product.caseNetWeight)
            : '',
        pieceNetWeight:
          product.pieceNetWeight !== undefined
            ? String(product.pieceNetWeight)
            : '',
        priceType: product.priceType || '',
        unitType: product.unitType || '',
        unitSize: product.unitSize || '',
        unitQtyInCase:
          product.unitQtyInCase !== undefined
            ? String(product.unitQtyInCase)
            : '',
        isFocusedPack: product.isFocusedPack === 'Y' ? 'Yes' : 'No',
        status: product.status || '',
      };
      return columns.map((column) => values[column.key] ?? '');
    });
    const rows = [columns.map((column) => column.title), ...exportRows];

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildPdfBuffer('Product Listing', rows),
        fileName: 'product-listing.pdf',
        mimeType: 'application/pdf',
      };
    }
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      'Products',
    );
    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'product-listing.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async getFocusedPackTemplate() {
    const products = await this.findLean(
      {},
      { sort: { name: 1, productSysCode: 1 } },
    );
    const rows = [
      ['Name', 'Product Code', 'isFocusedPack'],
      ...products.map((product: any) => [
        product.name || '',
        product.productSysCode || '',
        product.isFocusedPack === 'Y' ? 'Y' : 'N',
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 42 }, { wch: 24 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Focused Packs');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'focused-pack-products-template.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async bulkUpdateFocusedPacks(dto: BulkUpdateFocusedPackDto) {
    const productCodes = dto.items.map((item) => item.productCode.trim());
    const products = await this.findLean({
      productSysCode: { $in: productCodes },
    });
    const productByCode = new Map(
      products.map((product: any) => [product.productSysCode, product]),
    );
    const seenCodes = new Set<string>();
    const operations: any[] = [];
    const results: Array<{
      row: number;
      status: 'UPDATED' | 'FAILED';
      productCode: string;
      message?: string;
    }> = [];

    for (const [index, item] of dto.items.entries()) {
      const productCode = item.productCode.trim();
      const row = index + 1;

      if (seenCodes.has(productCode)) {
        results.push({
          row,
          status: 'FAILED',
          productCode,
          message: 'Duplicate Product Code in upload',
        });
        continue;
      }
      seenCodes.add(productCode);

      if (!productByCode.has(productCode)) {
        results.push({
          row,
          status: 'FAILED',
          productCode,
          message: 'Product Code not found',
        });
        continue;
      }

      operations.push({
        updateOne: {
          filter: { productSysCode: productCode },
          update: { $set: { isFocusedPack: item.isFocusedPack } },
        },
      });
      results.push({ row, status: 'UPDATED', productCode });
    }

    if (operations.length) {
      await this.model.bulkWrite(operations, { ordered: false });
    }

    const updated = results.filter(
      (result) => result.status === 'UPDATED',
    ).length;
    const failed = results.length - updated;

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack bulk upload processed',
      data: {
        total: dto.items.length,
        updated,
        failed,
        results,
      },
    };
  }

  // async findAll(query: ProductQueryDto) {
  //   const {
  //     searchText,
  //     categoryIds,
  //     brands,
  //     status,
  //     minPrice,
  //     maxPrice,
  //     inStockOnly,
  //     hasDiscount,
  //     page = 1,
  //     limit = 20,
  //     isFocusedPack,
  //     customerCategoryId,
  //     includeUnpricedProducts,
  //   } = query;

  //   /**
  //    * ================= GET USER =================
  //    */
  //   const ctx = RequestContextStore.getStore();
  //   const userId = ctx?.userId;

  //   /**
  //    * ================= PRICE CATEGORY =================
  //    */
  //   const priceCategoryCode = customerCategoryId || '';

  //   /**
  //    * If customerCategoryId not sent,
  //    * product should not show because price cannot be found.
  //    */
  //   if (!priceCategoryCode) {
  //     const basicFilter: Record<string, any> = {};
  //     if (status) basicFilter.status = status;
  //     if (categoryIds) {
  //       const selectedCategoryIds = categoryIds.split(',');
  //       basicFilter.$or = [
  //         { categoryId: { $in: selectedCategoryIds } },
  //         { parentCategoryId: { $in: selectedCategoryIds } },
  //       ];
  //     }
  //     if (query.categoryId) basicFilter.categoryId = query.categoryId;
  //     if (query.parentCategoryId) basicFilter.parentCategoryId = query.parentCategoryId;
  //     if (brands) basicFilter.brand = { $in: brands.split(',') };
  //     if (isFocusedPack) basicFilter.isFocusedPack = isFocusedPack;
  //     if (searchText) {
  //       const regex = new RegExp(searchText, 'i');
  //       const searchFilters = [
  //         { productId: regex },
  //         { productSysCode: regex },
  //         { name: regex },
  //       ];
  //       if (basicFilter.$or) {
  //         basicFilter.$and = [{ $or: basicFilter.$or }, { $or: searchFilters }];
  //         delete basicFilter.$or;
  //       } else {
  //         basicFilter.$or = searchFilters;
  //       }
  //     }
  //     if (minPrice || maxPrice) {
  //       basicFilter.casePrice = {
  //         ...(minPrice ? { $gte: Number(minPrice) } : {}),
  //         ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
  //       };
  //     }

  //     const result = await this.paginate(basicFilter, {
  //       page: Number(page),
  //       limit: Number(limit),
  //       sort: { createdAt: -1 },
  //     });
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: PRODUCT.FETCHED,
  //       data: result.items,
  //       meta: result.meta,
  //     };
  //   }

  //   /**
  //    * ================= BUILD MATCH =================
  //    */
  //   const match: any = {
  //     isDeleted: false,
  //   };

  //   if (status) {
  //     match.status = status;
  //   }

  //   if (categoryIds) {
  //     const selectedCategoryIds = categoryIds.split(',');
  //     match.$or = [
  //       { categoryId: { $in: selectedCategoryIds } },
  //       { parentCategoryId: { $in: selectedCategoryIds } },
  //     ];
  //   }
  //   if (query.categoryId) match.categoryId = query.categoryId;
  //   if (query.parentCategoryId) match.parentCategoryId = query.parentCategoryId;

  //   if (brands) {
  //     match.brand = {
  //       $in: brands.split(','),
  //     };
  //   }

  //   if (isFocusedPack) {
  //     match.isFocusedPack = isFocusedPack;
  //   }

  //   if (hasDiscount === 'true') {
  //     match.discount = {
  //       $gt: 0,
  //     };
  //   }

  //   if (searchText) {
  //     const regex = new RegExp(searchText, 'i');

  //     const searchFilters = [
  //       { name: regex },
  //       { productSysCode: regex },
  //       { productId: regex },
  //       { sku: regex },
  //       { brand: regex },
  //     ];
  //     if (match.$or) {
  //       match.$and = [{ $or: match.$or }, { $or: searchFilters }];
  //       delete match.$or;
  //     } else {
  //       match.$or = searchFilters;
  //     }
  //   }

  //   /**
  //    * ================= PAGINATION =================
  //    */
  //   const pageNumber = Number(page);
  //   const limitNumber = Number(limit);
  //   const skip = (pageNumber - 1) * limitNumber;
  //   const now = new Date();

  //   /**
  //    * ================= PIPELINE =================
  //    */
  //   const pipeline: any[] = [
  //     {
  //       $match: match,
  //     },

  //     /**
  //      * 1. Get van from logged-in user
  //      */
  //     {
  //       $lookup: {
  //         from: 'vans',
  //         let: {
  //           userId,
  //         },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $in: ['$$userId', '$associatedUsers'],
  //               },
  //             },
  //           },
  //           {
  //             $project: {
  //               vanId: 1,
  //               _id: 0,
  //             },
  //           },
  //         ],
  //         as: 'van',
  //       },
  //     },

  //     {
  //       $addFields: {
  //         vanId: {
  //           $arrayElemAt: ['$van.vanId', 0],
  //         },
  //       },
  //     },

  //     /**
  //      * 2. Lookup inventory for product + user van
  //      */
  //     {
  //       $lookup: {
  //         from: 'inventories',
  //         let: {
  //           productId: '$productId',
  //           vanId: '$vanId',
  //         },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   { $eq: ['$productId', '$$productId'] },
  //                   { $eq: ['$vanId', '$$vanId'] },
  //                   { $eq: ['$isDeleted', false] },
  //                 ],
  //               },
  //             },
  //           },
  //           {
  //             $project: {
  //               quantity: 1,
  //               _id: 0,
  //             },
  //           },
  //         ],
  //         as: 'inventory',
  //       },
  //     },

  //     /**
  //      * 3. Add stock
  //      */
  //     {
  //       $addFields: {
  //         stock: {
  //           $ifNull: [{ $arrayElemAt: ['$inventory.quantity', 0] }, 0],
  //         },
  //       },
  //     },

  //     /**
  //      * 4. Filter only in-stock products if requested
  //      */
  //     ...(inStockOnly === 'true'
  //       ? [
  //           {
  //             $match: {
  //               stock: {
  //                 $gt: 0,
  //               },
  //             },
  //           },
  //         ]
  //       : []),

  //     /**
  //      * 5. Lookup latest valid customer category price
  //      *
  //      * price_master.productId = product.productId
  //      * price_master.categoryCode = customerCategoryId
  //      * price_master.effectiveDate <= now
  //      */
  //     {
  //       $lookup: {
  //         from: 'price_master',
  //         let: {
  //           productId: '$productId',
  //           categoryCode: priceCategoryCode,
  //           currentDate: now,
  //         },
  //         pipeline: [
  //           {
  //             $match: {
  //               $expr: {
  //                 $and: [
  //                   { $eq: ['$productId', '$$productId'] },
  //                   { $eq: ['$categoryCode', '$$categoryCode'] },
  //                   { $lte: ['$effectiveDate', '$$currentDate'] },
  //                   { $eq: ['$isDeleted', false] },
  //                 ],
  //               },
  //             },
  //           },
  //           {
  //             $sort: {
  //               effectiveDate: -1,
  //               createdAt: -1,
  //             },
  //           },
  //           {
  //             $limit: 1,
  //           },
  //           {
  //             $project: {
  //               _id: 0,
  //               priceId: 1,
  //               productId: 1,
  //               categoryCode: 1,
  //               categoryName: 1,

  //               casePriceExclVat: 1,
  //               casePriceInclVat: 1,
  //               piecePriceExclVat: 1,
  //               piecePriceInclVat: 1,

  //               effectiveDate: 1,
  //               priceFlag: 1,
  //             },
  //           },
  //         ],
  //         as: 'customerPrice',
  //       },
  //     },

  //     /**
  //      * 6. Convert price array to object
  //      */
  //     {
  //       $addFields: {
  //         customerPrice: {
  //           $arrayElemAt: ['$customerPrice', 0],
  //         },
  //       },
  //     },

  //     /**
  //      * 7. If price does not exist, do not show product
  //      */
  //     ...(includeUnpricedProducts === 'true'
  //       ? []
  //       : [
  //           {
  //             $match: {
  //               customerPrice: {
  //                 $ne: null,
  //               },
  //             },
  //           },
  //         ]),

  //     /**
  //      * 8. Add final price fields from price_master
  //      */
  //     {
  //       $addFields: {
  //         priceId: '$customerPrice.priceId',
  //         priceCategoryCode: '$customerPrice.categoryCode',
  //         priceCategoryName: '$customerPrice.categoryName',
  //         priceEffectiveDate: '$customerPrice.effectiveDate',
  //         priceFlag: '$customerPrice.priceFlag',

  //         casePriceExclVat: {
  //           $ifNull: ['$customerPrice.casePriceExclVat', '$casePrice'],
  //         },
  //         casePriceInclVat: {
  //           $ifNull: ['$customerPrice.casePriceInclVat', '$casePrice'],
  //         },
  //         piecePriceExclVat: {
  //           $ifNull: ['$customerPrice.piecePriceExclVat', '$piecePrice'],
  //         },
  //         piecePriceInclVat: {
  //           $ifNull: ['$customerPrice.piecePriceInclVat', '$piecePrice'],
  //         },

  //         /**
  //          * App compatibility fields
  //          */
  //         casePrice: {
  //           $ifNull: ['$customerPrice.casePriceInclVat', '$casePrice'],
  //         },
  //         piecePrice: {
  //           $ifNull: ['$customerPrice.piecePriceInclVat', '$piecePrice'],
  //         },
  //       },
  //     },

  //     /**
  //      * 9. Apply price filter after customer price applied
  //      */
  //     ...(minPrice || maxPrice
  //       ? [
  //           {
  //             $match: {
  //               casePriceInclVat: {
  //                 ...(minPrice ? { $gte: Number(minPrice) } : {}),
  //                 ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
  //               },
  //             },
  //           },
  //         ]
  //       : []),

  //     /**
  //      * 10. Clean internal fields
  //      */
  //     {
  //       $project: {
  //         inventory: 0,
  //         van: 0,
  //         customerPrice: 0,
  //       },
  //     },

  //     /**
  //      * 11. Sort + paginate + count
  //      */
  //     {
  //       $facet: {
  //         items: [
  //           {
  //             $sort: {
  //               createdAt: -1,
  //             },
  //           },
  //           {
  //             $skip: skip,
  //           },
  //           {
  //             $limit: limitNumber,
  //           },
  //         ],
  //         meta: [
  //           {
  //             $count: 'total',
  //           },
  //         ],
  //       },
  //     },
  //   ];

  //   const [result] = await this.model.aggregate(pipeline);

  //   const items = result?.items ?? [];
  //   const total = result?.meta?.[0]?.total ?? 0;

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: PRODUCT.FETCHED,
  //     data: items,
  //     meta: {
  //       total,
  //       page: pageNumber,
  //       limit: limitNumber,
  //       totalPages: Math.ceil(total / limitNumber),
  //     },
  //   };
  // }

  async findAll(query: ProductQueryDto) {
    const {
      searchText,
      categoryIds,
      brands,
      status,
      minPrice,
      maxPrice,
      inStockOnly,
      hasDiscount,
      page = 1,
      limit = 20,
      isFocusedPack,
      customerCategoryId,
      includeUnpricedProducts,
      sortBy = 'stock',
    } = query;

    /**
     * ================= GET USER =================
     */
    const ctx = RequestContextStore.getStore();
    const userId = ctx?.userId;

    if (!userId) {
      return {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'User context not found',
        data: [],
        meta: {
          total: 0,
          page: Number(page),
          limit: Number(limit),
          totalPages: 0,
        },
      };
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * limitNumber;
    const now = new Date();

    /**
     * ================= SORT CONFIG =================
     *
     * Normal list:
     * - stock lookup happens only after pagination for 20 items.
     *
     * sortBy=stock OR inStockOnly=true:
     * - stock lookup happens before pagination because stock affects sorting/filtering.
     */
    const shouldSortByStock = sortBy === 'stock';
    const shouldCalculateStockBeforeFacet =
      shouldSortByStock || inStockOnly === 'true';

    const sortOrder = query.sortOrder === 'asc' ? 1 : -1;

    /**
     * ================= PRICE CATEGORY =================
     */
    const priceCategoryCode = customerCategoryId || '';

    /**
     * ================= GET USER VAN ONCE =================
     *
     * This replaces expensive van lookup inside aggregation.
     */
    const activeWorkSession = await this.workSessionModel
      .findOne({
        userId,
        status: WorkSessionStatus.ACTIVE,
        isDeleted: { $ne: true },
      })
      .select('vanId')
      .sort({ createdAt: -1 })
      .lean();
    const userVanId = activeWorkSession?.vanId || ctx?.vanId || null;
    const requestedVanId = query.vanId || userVanId;
    const requestedVan = requestedVanId
      ? await this.vanModel
          .findOne({
            vanId: requestedVanId,
            isDeleted: { $ne: true },
          })
          .select('categoryIds')
          .lean()
      : null;
    const vanCategoryIds = requestedVan?.categoryIds ?? [];

    /**
     * ================= BUILD PRODUCT MATCH =================
     */
    const match: any = {
      isDeleted: false,
    };

    if (query.vanId) {
      match.$and = vanCategoryIds.length
        ? [
            {
              $or: [
                { categoryId: { $in: vanCategoryIds } },
                { parentCategoryId: { $in: vanCategoryIds } },
              ],
            },
          ]
        : [{ _id: { $exists: false } }];
    }

    if (status) {
      match.status = status;
    }

    if (categoryIds) {
      const selectedCategoryIds = categoryIds.split(',').filter(Boolean);

      match.$or = [
        {
          categoryId: {
            $in: selectedCategoryIds,
          },
        },
        {
          parentCategoryId: {
            $in: selectedCategoryIds,
          },
        },
      ];
    }

    if (query.categoryId) {
      match.categoryId = query.categoryId;
    }

    if (query.parentCategoryId) {
      match.parentCategoryId = query.parentCategoryId;
    }

    if (brands) {
      match.brand = {
        $in: brands.split(',').filter(Boolean),
      };
    }

    if (isFocusedPack !== undefined) {
      match.isFocusedPack = isFocusedPack;
    }

    if (hasDiscount === 'true') {
      match.discount = {
        $gt: 0,
      };
    }

    if (searchText) {
      const escapedSearchText = searchText.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );

      const regex = new RegExp(escapedSearchText, 'i');

      const searchFilters = [
        { name: regex },
        { productSysCode: regex },
        { productId: regex },
        { sku: regex },
        { brand: regex },
      ];

      if (match.$or) {
        match.$and = [
          ...(match.$and ?? []),
          { $or: match.$or },
          { $or: searchFilters },
        ];
        delete match.$or;
      } else {
        match.$or = searchFilters;
      }
    }

    /**
     * ================= INVENTORY LOOKUP STAGES =================
     */
    const inventoryLookupStages: any[] = [
      {
        $lookup: {
          from: 'inventories',
          let: {
            productId: '$productId',
            vanId: userVanId,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$vanId', '$$vanId'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            {
              $project: {
                quantity: 1,
                _id: 0,
              },
            },
            {
              $limit: 1,
            },
          ],
          as: 'inventory',
        },
      },
      {
        $addFields: {
          stock: {
            $ifNull: [{ $arrayElemAt: ['$inventory.quantity', 0] }, 0],
          },
        },
      },
    ];

    /**
     * ================= STOCK FILTER STAGE =================
     */
    const stockFilterStages: any[] =
      inStockOnly === 'true'
        ? [
            {
              $match: {
                stock: {
                  $gt: 0,
                },
              },
            },
          ]
        : [];

    /**
     * ================= SORT STAGE =================
     */
    const sortStage = {
      $sort: shouldSortByStock
        ? {
            stock: sortOrder,
            createdAt: -1,
          }
        : {
            createdAt: -1,
          },
    };

    /**
     * ============================================================
     * CASE 1: customerCategoryId not sent
     * ============================================================
     */
    if (!priceCategoryCode) {
      const basicPipeline: any[] = [
        {
          $match: match,
        },

        ...(minPrice || maxPrice
          ? [
              {
                $match: {
                  casePrice: {
                    ...(minPrice ? { $gte: Number(minPrice) } : {}),
                    ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                  },
                },
              },
            ]
          : []),

        /**
         * Stock before facet only when stock affects sorting/filtering.
         */
        ...(shouldCalculateStockBeforeFacet ? inventoryLookupStages : []),
        ...(shouldCalculateStockBeforeFacet ? stockFilterStages : []),

        {
          $facet: {
            items: [
              sortStage,
              {
                $skip: skip,
              },
              {
                $limit: limitNumber,
              },

              /**
               * Normal listing:
               * Calculate stock only for paginated 20 items.
               */
              ...(!shouldCalculateStockBeforeFacet
                ? inventoryLookupStages
                : []),

              {
                $project: {
                  inventory: 0,
                },
              },
            ],
            meta: [
              {
                $count: 'total',
              },
            ],
          },
        },
      ];

      const [result] = await this.model
        .aggregate(basicPipeline)
        .allowDiskUse(true);

      const items = result?.items ?? [];
      const total = result?.meta?.[0]?.total ?? 0;
      const itemsWithCategories = await this.attachCategoryNames(items);
      const itemsWithSchemes = await this.attachApplicableSchemes(
        itemsWithCategories,
        query,
        userVanId,
      );

      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.FETCHED,
        data: itemsWithSchemes,
        meta: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber),
        },
      };
    }

    /**
     * ============================================================
     * CASE 2: customerCategoryId sent
     * ============================================================
     */
    const pricePipeline: any[] = [
      {
        $match: match,
      },

      /**
       * Lookup latest valid price from price_master.
       */
      {
        $lookup: {
          from: 'price_master',
          let: {
            productId: '$productId',
            categoryCode: priceCategoryCode,
            currentDate: now,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$categoryCode', '$$categoryCode'] },
                    { $lte: ['$effectiveDate', '$$currentDate'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            {
              $sort: {
                effectiveDate: -1,
                createdAt: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 0,
                priceId: 1,
                productId: 1,
                categoryCode: 1,
                categoryName: 1,

                casePriceExclVat: 1,
                casePriceInclVat: 1,
                piecePriceExclVat: 1,
                piecePriceInclVat: 1,

                effectiveDate: 1,
                priceFlag: 1,
              },
            },
          ],
          as: 'customerPrice',
        },
      },

      {
        $addFields: {
          customerPrice: {
            $arrayElemAt: ['$customerPrice', 0],
          },
        },
      },

      /**
       * If includeUnpricedProducts=false, remove products without customer price.
       */
      ...(includeUnpricedProducts === 'true'
        ? []
        : [
            {
              $match: {
                customerPrice: {
                  $ne: null,
                },
              },
            },
          ]),

      /**
       * Add final price fields.
       */
      {
        $addFields: {
          priceId: '$customerPrice.priceId',
          priceCategoryCode: '$customerPrice.categoryCode',
          priceCategoryName: '$customerPrice.categoryName',
          priceEffectiveDate: '$customerPrice.effectiveDate',
          priceFlag: '$customerPrice.priceFlag',

          casePriceExclVat: {
            $ifNull: ['$customerPrice.casePriceExclVat', '$casePrice'],
          },
          casePriceInclVat: {
            $ifNull: ['$customerPrice.casePriceInclVat', '$casePrice'],
          },
          piecePriceExclVat: {
            $ifNull: ['$customerPrice.piecePriceExclVat', '$piecePrice'],
          },
          piecePriceInclVat: {
            $ifNull: ['$customerPrice.piecePriceInclVat', '$piecePrice'],
          },

          casePrice: {
            $ifNull: ['$customerPrice.casePriceInclVat', '$casePrice'],
          },
          piecePrice: {
            $ifNull: ['$customerPrice.piecePriceInclVat', '$piecePrice'],
          },
        },
      },

      /**
       * Apply price filter after customer price is calculated.
       */
      ...(minPrice || maxPrice
        ? [
            {
              $match: {
                casePriceInclVat: {
                  ...(minPrice ? { $gte: Number(minPrice) } : {}),
                  ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                },
              },
            },
          ]
        : []),

      /**
       * Stock before facet only when stock affects sorting/filtering.
       */
      ...(shouldCalculateStockBeforeFacet ? inventoryLookupStages : []),
      ...(shouldCalculateStockBeforeFacet ? stockFilterStages : []),

      {
        $facet: {
          items: [
            sortStage,
            {
              $skip: skip,
            },
            {
              $limit: limitNumber,
            },

            /**
             * Normal listing:
             * Calculate stock only for paginated 20 items.
             */
            ...(!shouldCalculateStockBeforeFacet ? inventoryLookupStages : []),

            {
              $project: {
                inventory: 0,
                customerPrice: 0,
              },
            },
          ],
          meta: [
            {
              $count: 'total',
            },
          ],
        },
      },
    ];

    const [result] = await this.model
      .aggregate(pricePipeline)
      .allowDiskUse(true);

    const items = result?.items ?? [];
    const total = result?.meta?.[0]?.total ?? 0;
    const itemsWithCategories = await this.attachCategoryNames(items);
    const itemsWithSchemes = await this.attachApplicableSchemes(
      itemsWithCategories,
      query,
      userVanId,
    );

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: itemsWithSchemes,
      meta: {
        total,
        page: pageNumber,
        limit: limitNumber,
        totalPages: Math.ceil(total / limitNumber),
      },
    };
  }

  /**
   * Get Product by ID
   * -----------------
   * Purpose : Retrieve a single product with latest customer category price
   *
   * Price rules:
   * - price_master.productId = product.productId
   * - price_master.categoryCode = customerCategoryId
   * - price_master.effectiveDate <= current date/time
   * - latest effectiveDate selected
   * - if price not found, product will not be shown
   */
  async findByProductId(
    productId: string,
    query?: {
      customerCategoryId?: string;
    },
  ) {
    const priceCategoryCode = query?.customerCategoryId || '';

    if (!priceCategoryCode) {
      const product = await this.findOne({ productId }, { lean: true });
      if (!product) throw new NotFoundException(PRODUCT.NOT_FOUND);
      return {
        statusCode: HttpStatus.OK,
        message: PRODUCT.FETCHED,
        data: (await this.attachCategoryNames([product]))[0],
      };
    }

    const now = new Date();

    const [product] = await this.model.aggregate([
      {
        $match: {
          productId,
          isDeleted: false,
        },
      },

      /**
       * Lookup latest valid price from price_master
       */
      {
        $lookup: {
          from: 'price_master',
          let: {
            productId: '$productId',
            categoryCode: priceCategoryCode,
            currentDate: now,
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$productId', '$$productId'] },
                    { $eq: ['$categoryCode', '$$categoryCode'] },
                    { $lte: ['$effectiveDate', '$$currentDate'] },
                    { $eq: ['$isDeleted', false] },
                  ],
                },
              },
            },
            {
              $sort: {
                effectiveDate: -1,
                createdAt: -1,
              },
            },
            {
              $limit: 1,
            },
            {
              $project: {
                _id: 0,
                priceId: 1,
                productId: 1,
                categoryCode: 1,
                categoryName: 1,

                casePriceExclVat: 1,
                casePriceInclVat: 1,
                piecePriceExclVat: 1,
                piecePriceInclVat: 1,

                effectiveDate: 1,
                priceFlag: 1,
              },
            },
          ],
          as: 'customerPrice',
        },
      },

      /**
       * Convert price array to object
       */
      {
        $addFields: {
          customerPrice: {
            $arrayElemAt: ['$customerPrice', 0],
          },
        },
      },

      /**
       * If price does not exist, do not return product
       */
      {
        $match: {
          customerPrice: {
            $ne: null,
          },
        },
      },

      /**
       * Add final price fields
       */
      {
        $addFields: {
          priceId: '$customerPrice.priceId',
          priceCategoryCode: '$customerPrice.categoryCode',
          priceCategoryName: '$customerPrice.categoryName',
          priceEffectiveDate: '$customerPrice.effectiveDate',
          priceFlag: '$customerPrice.priceFlag',

          casePriceExclVat: '$customerPrice.casePriceExclVat',
          casePriceInclVat: '$customerPrice.casePriceInclVat',
          piecePriceExclVat: '$customerPrice.piecePriceExclVat',
          piecePriceInclVat: '$customerPrice.piecePriceInclVat',

          /**
           * App compatibility fields
           */
          casePrice: '$customerPrice.casePriceInclVat',
          piecePrice: '$customerPrice.piecePriceInclVat',
        },
      },

      {
        $project: {
          customerPrice: 0,
        },
      },
    ]);

    if (!product) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.FETCHED,
      data: (await this.attachCategoryNames([product]))[0],
    };
  }

  /**
   * Update Product
   * --------------
   * Purpose : Update product master data
   */
  async update(productId: string, payload: ProductUpdateDto) {
    const {
      price,
      netWeight,
      casePrice,
      caseNetWeight,
      unitQtyInCase,
      ...values
    } = payload;
    const existing = await this.findOne({ productId });

    if (!existing) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    const nextUnitQtyInCase = unitQtyInCase ?? existing.unitQtyInCase;
    const nextCasePrice = casePrice ?? price ?? existing.casePrice;
    const nextCaseNetWeight =
      caseNetWeight ??
      (netWeight !== undefined
        ? netWeight * nextUnitQtyInCase
        : existing.caseNetWeight);
    const shouldSyncDerivedValues =
      casePrice !== undefined ||
      price !== undefined ||
      caseNetWeight !== undefined ||
      netWeight !== undefined ||
      unitQtyInCase !== undefined;

    const product = await this.updateOne(
      { productId },
      {
        ...values,
        ...(unitQtyInCase !== undefined ? { unitQtyInCase } : {}),
        ...(shouldSyncDerivedValues
          ? {
              casePrice: nextCasePrice,
              piecePrice: round4(nextCasePrice / nextUnitQtyInCase),
              caseNetWeight: nextCaseNetWeight,
              pieceNetWeight: round4(nextCaseNetWeight / nextUnitQtyInCase),
            }
          : {}),
      },
    );

    if (!product) {
      throw new NotFoundException(PRODUCT.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.UPDATED,
      data: product,
    };
  }

  /**
   * Delete Product (Soft Delete)
   * ---------------------------
   * Purpose : Soft delete product
   */
  async delete(productId: string) {
    const deletedProduct = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { productId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(PRODUCT.NOT_FOUND);
      }

      await this.softDelete({ productId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: PRODUCT.DELETED,
      data: deletedProduct,
    };
  }
}
