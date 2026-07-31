/**
 * Van Service
 * -----------
 * Purpose : Handles business logic for van lifecycle management
 * Used by : VanController
 *
 * Responsibilities:
 * - Create van master records
 * - Restore soft-deleted vans
 * - Fetch vans with filters and pagination
 * - Retrieve single van details
 * - Update van information
 * - Soft-delete vans
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Van master acts as source of truth
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

import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import {
  Province,
  ProvinceSchema,
} from 'src/core/database/mongo/schema/province.schema';
import {
  Position,
  PositionSchema,
} from 'src/core/database/mongo/schema/position.schema';
import { Role, RoleSchema } from 'src/core/database/mongo/schema/role.schema';
import {
  ProductCategory,
  ProductCategorySchema,
} from 'src/core/database/mongo/schema/product-category';
import { CreateVanDto } from './dto/create-van.dto';
import { UpdateVanDto } from './dto/update-van.dto';
import { UpdateVanBreakdownDto } from './dto/update-van-breakdown.dto';
import { VanQueryDto } from './dto/van-query.dto';
import { VAN } from './van.constants';
import { RequestContextStore } from 'src/core/context/request-context';
import { VanStatus } from 'src/shared/enums/van.enums';
import { ChangeVanDto } from './van.controller';
import { OracleRepository } from 'src/core/database/oracle/oracle.repository';
import * as XLSX from 'xlsx';
import { ClientSession } from 'mongoose';
import { EmployeeType } from 'src/shared/enums/employee.enums';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

@Injectable()
export class VanService extends MongoRepository<Van> {
  private readonly employeeModel;
  private readonly provinceModel;
  private readonly positionModel;
  private readonly roleModel;
  private readonly productCategoryModel;

  constructor(
    mongo: MongoService,
    private readonly oracleRepository: OracleRepository,
  ) {
    super(mongo.getModel(Van.name, VanSchema));
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
    this.provinceModel = mongo.getModel(Province.name, ProvinceSchema);
    this.positionModel = mongo.getModel(Position.name, PositionSchema);
    this.roleModel = mongo.getModel(Role.name, RoleSchema);
    this.productCategoryModel = mongo.getModel(
      ProductCategory.name,
      ProductCategorySchema,
    );
  }

  private async validateProvince(provinceId?: string, session?: ClientSession) {
    if (!provinceId) return;

    const provinceQuery = this.provinceModel
      .findOne({ provinceId, status: 'ACTIVE', isDeleted: { $ne: true } })
      .select('provinceId')
      .lean();
    if (session) provinceQuery.session(session);

    if (!(await provinceQuery)) {
      throw new BadRequestException(`Active province not found: ${provinceId}`);
    }
  }

  private async validateProductCategories(
    categoryIds?: string[],
    session?: ClientSession,
  ) {
    if (categoryIds === undefined) return;

    const uniqueCategoryIds = [
      ...new Set(categoryIds.map((categoryId) => categoryId.trim())),
    ].filter(Boolean);
    if (!uniqueCategoryIds.length) {
      throw new BadRequestException(
        'At least one product category must be associated with the van',
      );
    }

    const categoriesQuery = this.productCategoryModel
      .find({
        categoryId: { $in: uniqueCategoryIds },
        type: 'PARENT',
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('categoryId')
      .lean();
    if (session) categoriesQuery.session(session);

    const categories = await categoriesQuery;
    const foundCategoryIds = new Set(
      categories.map((category: any) => category.categoryId),
    );
    const missingCategoryIds = uniqueCategoryIds.filter(
      (categoryId) => !foundCategoryIds.has(categoryId),
    );

    if (missingCategoryIds.length) {
      throw new BadRequestException(
        `Active parent product categories not found: ${missingCategoryIds.join(', ')}`,
      );
    }
  }

  private async validateDriver(
    driverEmployeeId: string,
    currentVanId?: string,
    session?: ClientSession,
  ) {
    const driverQuery = this.employeeModel
      .findOne({
        employeeId: driverEmployeeId,
        employeeType: EmployeeType.SUPPORTING_STAFF,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('employeeId name')
      .lean();
    if (session) driverQuery.session(session);
    const driver = await driverQuery;
    if (!driver) {
      throw new BadRequestException(
        `Active supporting staff driver not found: ${driverEmployeeId}`,
      );
    }

    const mappedVan = await this.findOne(
      {
        driverEmployeeId,
        ...(currentVanId ? { vanId: { $ne: currentVanId } } : {}),
        isDeleted: { $ne: true },
      },
      { session, lean: true },
    );
    if (mappedVan) {
      throw new ConflictException(
        `Driver ${driverEmployeeId} is already assigned to van ${mappedVan.vanId}`,
      );
    }
    return driver;
  }

  private async getVanChangeEligibilityFilter(userId: string) {
    const employee = await this.employeeModel
      .findOne({
        employeeId: userId,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('employeeId')
      .lean();

    if (!employee) {
      throw new BadRequestException(
        'An active employee position is required to change van',
      );
    }

    const position = await this.positionModel
      .findOne({
        employeeId: userId,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('positionId provinceId reportTo vanIds')
      .lean();

    if (!position?.provinceId) {
      throw new BadRequestException(
        'The employee position must belong to an active province',
      );
    }
    await this.validateProvince(position.provinceId);

    const hierarchyVanIds = new Set<string>(position.vanIds || []);
    const visitedPositionIds = new Set<string>([position.positionId]);
    let reportTo = position.reportTo;

    while (reportTo && !visitedPositionIds.has(reportTo)) {
      visitedPositionIds.add(reportTo);

      const reportingPosition = await this.positionModel
        .findOne({
          positionId: reportTo,
          provinceId: position.provinceId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('positionId reportTo vanIds')
        .lean();

      if (!reportingPosition) break;

      for (const vanId of reportingPosition.vanIds || []) {
        hierarchyVanIds.add(vanId);
      }
      reportTo = reportingPosition.reportTo;
    }

    return {
      vanId: { $in: [...hierarchyVanIds] },
      status: VanStatus.ACTIVE,
      isDeleted: { $ne: true },
    };
  }

  async getVanChangeOptions() {
    const userId = RequestContextStore.getStore()?.userId;
    if (!userId) {
      throw new BadRequestException('Authenticated employee is required');
    }

    const vans = await this.findLean(
      await this.getVanChangeEligibilityFilter(userId),
      { sort: { name: 1 } },
    );

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: vans,
      meta: {
        total: vans.length,
        page: 1,
        limit: vans.length,
        totalPages: vans.length ? 1 : 0,
      },
    };
  }

  async validateVanChangeOption(vanId: string, userId: string) {
    const van = await this.findOne({
      ...(await this.getVanChangeEligibilityFilter(userId)),
      vanId,
    });

    if (!van) {
      throw new BadRequestException(
        'Requested van is not available for this employee hierarchy',
      );
    }

    return van;
  }

  private normalizeVanPayload<T extends CreateVanDto | UpdateVanDto>(
    payload: T,
  ): Partial<Van> {
    return {
      ...payload,
      associatedRoutes: payload.associatedRoutes?.map((route) => ({
        routeId: route.routeId,
        day: route.day,
        fromDate: new Date(route.fromDate),
        toDate: new Date(route.toDate),
      })),
    };
  }

  private async syncSalesmanPositionCategories(
    vanId: string,
    categoryIds: string[],
    session?: ClientSession,
  ) {
    const rolesQuery = this.roleModel
      .find({
        name: 'SALESMAN',
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('roleId')
      .lean();
    if (session) rolesQuery.session(session);
    const salesmanRoleIds = (await rolesQuery).map((role) => role.roleId);
    if (!salesmanRoleIds.length) return;

    await this.positionModel.updateMany(
      {
        roleId: { $in: salesmanRoleIds },
        vanIds: vanId,
        isDeleted: { $ne: true },
      },
      {
        $set: {
          parentCategoryId: [
            ...new Set(categoryIds.map((categoryId) => categoryId.trim())),
          ],
        },
      },
      { session },
    );
  }

  private async buildVanFilter(query: VanQueryDto) {
    const { searchText, status } = query;
    const filter: Record<string, any> = {};

    if (query.userId) {
      const position = await this.positionModel
        .findOne({
          employeeId: query.userId,
          isDeleted: { $ne: true },
        })
        .select('vanIds')
        .lean();
      filter.vanId = { $in: position?.vanIds || [] };
    }

    if (status) {
      filter.status = status;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { vanId: regex },
        { name: regex },
        { driverName: regex },
        { vanNumber: regex },
      ];
    }

    return filter;
  }

  private getSort(query: VanQueryDto) {
    const sortFieldMap: Record<string, string> = {
      primary: 'name',
      secondary: 'vanNumber',
      owner: 'driverName',
      metric: 'capacity',
      routes: 'associatedRoutes',
      madeYear: 'madeYear',
      name: 'name',
      vanNumber: 'vanNumber',
      driverName: 'driverName',
      provinceId: 'provinceId',
      capacity: 'capacity',
      status: 'status',
      createdAt: 'createdAt',
    };
    const sortField = sortFieldMap[query.sortBy || 'createdAt'] || 'createdAt';
    const sortDirection: 1 | -1 = query.sortOrder === 'asc' ? 1 : -1;

    return { [sortField]: sortDirection };
  }

  private getExportColumns(columns?: string) {
    const definitions = [
      { key: 'primary', title: 'Van' },
      { key: 'vanId', title: 'Van ID' },
      { key: 'secondary', title: 'Van Number' },
      { key: 'owner', title: 'Driver' },
      { key: 'provinceId', title: 'Province' },
      { key: 'metric', title: 'Capacity (Cases)' },
      { key: 'madeYear', title: 'Made Year' },
      { key: 'routes', title: 'Associated Routes' },
      { key: 'status', title: 'Status' },
    ];
    const requested = columns
      ?.split(',')
      .map((column) => column.trim())
      .filter(Boolean);

    if (!requested?.length) return definitions;

    const selected = definitions.filter((column) =>
      requested.includes(column.key),
    );

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

        if (rowIndex % 2 === 0) {
          commands.push(
            '0.96 0.98 1 rg',
            rect(margin, y, tableWidth, rowHeight, 'f'),
          );
        }

        commands.push(
          '0.85 0.89 0.94 RG',
          rect(margin, y, tableWidth, rowHeight),
        );
        commands.push('0.08 0.13 0.2 rg');

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
   * Create Van
   * ----------
   * Purpose : Create new van or restore soft-deleted van
   *
   * Flow:
   * - Check for existing van (including soft-deleted)
   * - Restore soft-deleted van if found
   * - Create new van if not exists
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active vans
   */
  async create(payload: CreateVanDto) {
    return this.withTransaction(async (session) => {
      // Check existing van (including soft-deleted)
      const existing = await this.findOne(
        {
          $or: [{ vanId: payload.vanId }, { vanNumber: payload.vanNumber }],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active van
      if (existing && !existing.isDeleted) {
        throw new ConflictException(VAN.DUPLICATE);
      }

      await this.validateProductCategories(payload.categoryIds, session);
      const driver = await this.validateDriver(
        payload.driverEmployeeId,
        undefined,
        session,
      );
      const normalizedPayload = {
        ...payload,
        driverName: driver.name,
      };

      // Restore soft-deleted van
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          this.normalizeVanPayload({
            ...normalizedPayload,
            status: 'ACTIVE',
            isDeleted: false,
          } as CreateVanDto),
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: VAN.CREATED,
          data: { vanId: existing.vanId },
        };
      }

      // Create new van
      const van = await this.save(this.normalizeVanPayload(normalizedPayload), {
        session,
      });

      return {
        statusCode: HttpStatus.CREATED,
        message: VAN.CREATED,
        data: van,
      };
    });
  }

  /**
   * Sync Vans From ERP Oracle
   * -------------------------
   * Source table : VAN_MASTER
   * Target table : vans
   */
  async syncVansFromERP() {
    if (!this.oracleRepository.isEnabled()) {
      return {
        statusCode: HttpStatus.OK,
        message: 'OracleDB is disabled. Van sync skipped.',
        data: {
          synced: 0,
          skipped: true,
        },
      };
    }

    const toStringSafe = (value: any): string => {
      return String(value ?? '').trim();
    };

    const rows = await this.oracleRepository.query<any>(
      `
    SELECT
      VC_WAREHOUSE_CODE AS "warehouseCode",
      VC_WAREHOUSE_DESC AS "warehouseDesc",
      VC_ADD1           AS "address1",
      VC_ADD2           AS "address2",
      VC_MASTER_CODE    AS "masterCode"
    FROM VAN_MASTER
    WHERE VC_WAREHOUSE_CODE IS NOT NULL
    `,
    );

    if (!rows.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No vans found from ERP.',
        data: {
          synced: 0,
        },
      };
    }

    /**
     * Deduplicate by warehouse code because vanId is unique in Mongo.
     */
    const uniqueRowsMap = new Map<string, any>();

    for (const row of rows) {
      const warehouseCode = toStringSafe(row.warehouseCode);

      if (!warehouseCode) continue;

      uniqueRowsMap.set(warehouseCode, row);
    }

    const uniqueRows = Array.from(uniqueRowsMap.values());

    const operations = uniqueRows.map((row) => {
      const warehouseCode = toStringSafe(row.warehouseCode);

      const vanId = warehouseCode;
      const vanNumber = warehouseCode;

      const name =
        toStringSafe(row.warehouseDesc) ||
        toStringSafe(row.masterCode) ||
        warehouseCode;

      return {
        updateOne: {
          filter: {
            vanId,
          },
          update: {
            $set: {
              vanId,
              name,
              vanNumber,
            },
            $setOnInsert: {
              associatedRoutes: [],
            },
          },
          upsert: true,
        },
      };
    });

    if (!operations.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'No valid vans found from ERP.',
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
      message: 'ERP vans synced successfully.',
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

  /**
   * Get Vans (List)
   * --------------
   * Purpose : Retrieve vans with filtering and pagination
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Pagination & sorting
   */
  async findAll(query: VanQueryDto) {
    const { page = 1, limit = 20 } = query;

    const result = await this.paginate(await this.buildVanFilter(query), {
      page,
      limit,
      sort: this.getSort(query),
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async exportVans(
    query: VanQueryDto & { fileType?: 'excel' | 'pdf'; columns?: string },
  ) {
    const columns = this.getExportColumns(query.columns);
    const vans = await this.findLean(await this.buildVanFilter(query), {
      sort: this.getSort(query),
    });
    const provinceIds = [
      ...new Set(vans.map((van: any) => van.provinceId).filter(Boolean)),
    ];
    const provinces = provinceIds.length
      ? await this.provinceModel
          .find({ provinceId: { $in: provinceIds } })
          .select('provinceId name')
          .lean()
      : [];
    const provinceNameById = new Map(
      provinces.map((province: any) => [province.provinceId, province.name]),
    );
    const exportRows = vans.map((van: any) => {
      const routes = Array.isArray(van.associatedRoutes)
        ? van.associatedRoutes
        : [];
      const values: Record<string, string> = {
        primary: van.name || '',
        vanId: van.vanId || '',
        secondary: van.vanNumber || '',
        owner: van.driverName || '',
        provinceId: van.provinceId
          ? provinceNameById.get(van.provinceId) || van.provinceId
          : '',
        metric: van.capacity !== undefined ? String(van.capacity) : '',
        madeYear: van.madeYear !== undefined ? String(van.madeYear) : '',
        routes: routes
          .map((route: any) => {
            const fromDate = route.fromDate
              ? new Date(route.fromDate).toISOString().slice(0, 10)
              : '';
            const toDate = route.toDate
              ? new Date(route.toDate).toISOString().slice(0, 10)
              : '';

            return [
              route.routeId,
              fromDate && toDate ? `${fromDate} to ${toDate}` : '',
            ]
              .filter(Boolean)
              .join(' ');
          })
          .filter(Boolean)
          .join(', '),
        status: van.status || '',
      };

      return columns.map((column) => values[column.key] ?? '');
    });
    const headerRow = columns.map((column) => column.title);

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildPdfBuffer('Van Listing', [headerRow, ...exportRows]),
        fileName: 'van-listing.pdf',
        mimeType: 'application/pdf',
      };
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vans');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'van-listing.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async findByVanId(vanId: string) {
    const today = new Date();

    const pipeline: any[] = [
      { $match: { vanId, isDeleted: false } },

      {
        $unwind: {
          path: '$associatedRoutes',
          preserveNullAndEmptyArrays: true,
        },
      },

      /**
       * ✅ lookup route
       */
      {
        $lookup: {
          from: 'route_master',
          let: { routeId: '$associatedRoutes.routeId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$routeId', '$$routeId'] },
              },
            },
            {
              $project: {
                _id: 0,
                routeId: 1,
                name: 1,
                day: 1,
                distance: 1,
                provinceId: 1,
                marketId: 1,
                status: 1,
              },
            },
          ],
          as: 'route',
        },
      },

      {
        $addFields: {
          route: { $arrayElemAt: ['$route', 0] },
        },
      },

      /**
       * ✅ active flag
       */
      {
        $addFields: {
          isActive: {
            $and: [
              { $lte: ['$associatedRoutes.fromDate', today] },
              { $gte: ['$associatedRoutes.toDate', today] },
            ],
          },
        },
      },

      /**
       * 🚀 REMOVE DUPLICATES HERE (KEY FIX)
       */
      {
        $group: {
          _id: {
            vanId: '$vanId',
            routeId: '$associatedRoutes.routeId',
          },

          vanId: { $first: '$vanId' },
          name: { $first: '$name' },
          vanNumber: { $first: '$vanNumber' },
          driverName: { $first: '$driverName' },
          provinceId: { $first: '$provinceId' },
          categoryIds: { $first: '$categoryIds' },
          capacity: { $first: '$capacity' },
          madeYear: { $first: '$madeYear' },
          status: { $first: '$status' },

          routeData: {
            $first: {
              routeId: '$associatedRoutes.routeId',
              day: '$associatedRoutes.day',
              fromDate: '$associatedRoutes.fromDate',
              toDate: '$associatedRoutes.toDate',
              isActive: '$isActive',
              route: '$route',
            },
          },
        },
      },

      /**
       * ✅ regroup by van
       */
      {
        $group: {
          _id: '$vanId',
          vanId: { $first: '$vanId' },
          name: { $first: '$name' },
          vanNumber: { $first: '$vanNumber' },
          driverName: { $first: '$driverName' },
          provinceId: { $first: '$provinceId' },
          categoryIds: { $first: '$categoryIds' },
          capacity: { $first: '$capacity' },
          madeYear: { $first: '$madeYear' },
          status: { $first: '$status' },

          routes: {
            $push: '$routeData',
          },
        },
      },

      /**
       * ✅ active route
       */
      {
        $addFields: {
          activeRoute: {
            $first: {
              $filter: {
                input: '$routes',
                as: 'r',
                cond: { $eq: ['$$r.isActive', true] },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          vanId: 1,
          name: 1,
          vanNumber: 1,
          driverName: 1,
          provinceId: 1,
          categoryIds: 1,
          capacity: 1,
          madeYear: 1,
          status: 1,
          activeRoute: 1,
          routes: 1,
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);
    const doc = result?.[0];

    if (!doc) {
      throw new NotFoundException(VAN.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: doc,
    };
  }

  /**
   * Update Van
   * ----------
   * Purpose : Update editable van master fields
   *
   * Notes:
   * - Identity fields remain unchanged
   */
  async update(vanId: string, dto: UpdateVanDto) {
    await this.withTransaction(async (session) => {
      const existing = await this.findOne({ vanId }, { session });

      if (!existing) {
        throw new NotFoundException(VAN.NOT_FOUND);
      }

      if (dto.vanNumber && dto.vanNumber !== existing.vanNumber) {
        const duplicate = await this.findOne(
          { vanNumber: dto.vanNumber },
          { session },
        );

        if (duplicate && duplicate.vanId !== vanId) {
          throw new ConflictException(VAN.DUPLICATE);
        }
      }

      await this.validateProductCategories(dto.categoryIds, session);
      const driver = dto.driverEmployeeId
        ? await this.validateDriver(dto.driverEmployeeId, vanId, session)
        : null;
      await this.updateOne(
        { vanId },
        this.normalizeVanPayload({
          ...dto,
          ...(driver ? { driverName: driver.name } : {}),
        }),
        {
          session,
        },
      );
      if (dto.categoryIds !== undefined) {
        await this.syncSalesmanPositionCategories(
          vanId,
          dto.categoryIds,
          session,
        );
      }
    });
    const updated = await this.findByVanId(vanId);

    return {
      ...updated,
      message: VAN.UPDATED,
    };
  }

  async updateBreakdown(dto: UpdateVanBreakdownDto) {
    const vanIds = dto.vanIds.map((vanId) => vanId.trim()).filter(Boolean);
    const vans = await this.findLean({ vanId: { $in: vanIds } });
    const foundVanIds = new Set(vans.map((van) => van.vanId));
    const missingVanIds = vanIds.filter((vanId) => !foundVanIds.has(vanId));

    if (missingVanIds.length) {
      throw new BadRequestException(
        `Van not found: ${missingVanIds.join(', ')}`,
      );
    }

    await Promise.all(
      vanIds.map((vanId) => {
        const query = this.model.updateOne(
          { vanId, isDeleted: { $ne: true } },
          {
            $set: {
              status: VanStatus.BREAKDOWN,
              breakdownReason: dto.reason,
            },
          },
        );
        (query as any)._auditMetadata = {
          breakdownReason: dto.reason,
        };
        return query.exec();
      }),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Van breakdown updated successfully',
      data: {
        vanIds,
        status: VanStatus.BREAKDOWN,
        reason: dto.reason,
      },
    };
  }

  /**
   * Delete Van (Soft Delete)
   * -----------------------
   * Purpose : Soft delete van
   *
   * Flow:
   * - Validate existing van
   * - Mark van as deleted
   *
   * Notes:
   * - Records remain for audit purposes
   */
  async delete(vanId: string) {
    const deletedVan = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { vanId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(VAN.NOT_FOUND);
      }

      await this.softDelete({ vanId }, { session });
      await this.model.updateOne(
        { vanId },
        { $unset: { driverEmployeeId: 1, driverName: 1 } },
        { session },
      );
      await this.positionModel.updateMany(
        { vanIds: vanId },
        { $pull: { vanIds: vanId } },
        { session },
      );

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN.DELETED,
      data: deletedVan,
    };
  }

  async getVanMappedRoutes() {
    const ctx: any = RequestContextStore.getStore();
    const userId = ctx?.userId;

    const today = new Date();
    const position = await this.positionModel
      .findOne({
        employeeId: userId,
        isDeleted: { $ne: true },
      })
      .select('vanIds')
      .lean();

    const pipeline: any[] = [
      /**
       * ✅ Match vans for logged-in user
       */
      {
        $match: {
          vanId: { $in: position?.vanIds || [] },
          status: VanStatus.ACTIVE,
          isDeleted: false,
        },
      },

      /**
       * ✅ Unwind routes
       */
      {
        $unwind: {
          path: '$associatedRoutes',
          // A user can be assigned to a van before routes are assigned to it.
          // Keep that van in the result and return an empty routes array.
          preserveNullAndEmptyArrays: false,
        },
      },

      /**
       * ✅ Lookup route details
       */
      {
        $lookup: {
          from: 'route_master',
          localField: 'associatedRoutes.routeId',
          foreignField: 'routeId',
          as: 'route',
        },
      },

      /**
       * ✅ Convert route array → object
       */
      {
        $addFields: {
          route: { $arrayElemAt: ['$route', 0] },
        },
      },

      /**
       * ✅ Calculate active flag
       */
      {
        $addFields: {
          isActive: {
            $and: [
              { $lte: ['$associatedRoutes.fromDate', today] },
              { $gte: ['$associatedRoutes.toDate', today] },
            ],
          },
        },
      },

      /**
       * ✅ Shape flat structure before grouping
       */
      {
        $project: {
          _id: 0,
          vanId: '$vanId',
          vanName: '$name',
          vanNumber: '$vanNumber',
          provinceId: '$provinceId',
          categoryIds: '$categoryIds',
          status: '$status',
          routeId: '$associatedRoutes.routeId',
          day: '$associatedRoutes.day',
          fromDate: '$associatedRoutes.fromDate',
          toDate: '$associatedRoutes.toDate',
          isActive: 1,
          route: {
            routeId: '$route.routeId',
            name: '$route.name',
            distance: '$route.distance',
            day: '$route.day',
            status: '$route.status',
            outletCount: '$route.outletCount',
            provinceId: '$route.provinceId',
            marketId: '$route.marketId',
            countryId: '$route.countryId',
            customerCategoryId: '$route.customerCategoryId',
          },
        },
      },

      /**
       * 🚀 Group by van (MAIN FIX)
       */
      {
        $group: {
          _id: '$vanId',
          vanName: { $first: '$vanName' },
          vanId: { $first: '$vanId' },
          vanNumber: { $first: '$vanNumber' },
          provinceId: { $first: '$provinceId' },
          categoryIds: { $first: '$categoryIds' },
          status: { $first: '$status' },
          routes: {
            $push: {
              routeId: '$routeId',
              day: '$day',
              fromDate: '$fromDate',
              toDate: '$toDate',
              isActive: '$isActive',
              route: '$route',
            },
          },
        },
      },

      /**
       * ✅ Final response shape
       */
      {
        $project: {
          _id: 0,
          vanName: 1,
          vanId: 1,
          vanNumber: 1,
          provinceId: 1,
          categoryIds: 1,
          status: 1,
          routes: {
            $filter: {
              input: '$routes',
              as: 'mappedRoute',
              cond: { $ne: ['$$mappedRoute.routeId', null] },
            },
          },
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);

    if (!result || result.length === 0) {
      throw new NotFoundException(VAN.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: result[0],
    };
  }

  async changeVan(dto: ChangeVanDto) {
    const { oldVanId, vanId, employeeId } = dto;

    if (oldVanId === vanId) {
      throw new BadRequestException('Old and new van cannot be same');
    }

    await this.validateVanChangeOption(vanId, employeeId);

    await this.withTransaction(async (session) => {
      const employee = await this.employeeModel
        .findOne({
          employeeId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('employeeId')
        .session(session)
        .lean();

      if (!employee) {
        throw new BadRequestException(
          'An active employee position is required to change van',
        );
      }

      const position = await this.positionModel
        .findOne({
          employeeId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('positionId vanIds')
        .session(session)
        .lean();

      if (!position) {
        throw new BadRequestException('Active employee position not found');
      }

      const nextVanIds = [
        ...new Set(
          (position.vanIds || [])
            .filter((mappedVanId) => mappedVanId !== oldVanId)
            .concat(vanId),
        ),
      ];

      await this.positionModel.updateOne(
        { positionId: position.positionId },
        { $set: { vanIds: nextVanIds } },
        { session },
      );
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Van changed successfully',
      data: {
        oldVanId,
        newVanId: vanId,
        employeeId,
      },
    };
  }
}
