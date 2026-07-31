import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
  BadRequestException,
  HttpException,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';

import {
  Target,
  TargetSchema,
} from 'src/core/database/mongo/schema/target.schema';

import { TARGET } from './target.constants';
import { CreateTargetDto } from './dto/create-target.dto';
import { UpdateTargetDto } from './dto/update-target.dto';
import { TargetQueryDto } from './dto/target-query.dto';
import { BulkUploadTargetsDto } from './dto/bulk-upload-targets.dto';
import * as XLSX from 'xlsx';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FocusedPackTarget } from 'src/core/database/mongo/schema/focused-pack-target.schema';
import { CreateFocusedPackTargetDto } from './dto/create-focused-pack-target.dto';
import { UpdateFocusedPackTargetDto } from './dto/update-focused-pack-target.dto';
import { FocusedPackTargetQueryDto } from './dto/focused-pack-target-query.dto';
import { BulkUploadFocusedPackTargetsDto } from './dto/bulk-upload-focused-pack-targets.dto';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

@Injectable()
export class TargetService extends MongoRepository<Target> {
  constructor(
    mongo: MongoService,
    @InjectModel(FocusedPackTarget.name)
    private readonly focusedPackTargetModel: Model<FocusedPackTarget>,
  ) {
    super(mongo.getModel(Target.name, TargetSchema));
  }

  async upsertFocusedPackTarget(payload: CreateFocusedPackTargetDto) {
    this.validateTargetPeriod(payload.startDate, payload.endDate);
    const storedPayload = this.toStoredWeight(payload);
    const data = await this.focusedPackTargetModel.findOneAndUpdate(
      {
        userId: payload.userId,
        productId: payload.productId,
        startDate: payload.startDate,
        endDate: payload.endDate,
      },
      { $set: storedPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack target saved successfully',
      data: this.toKgWeight(data),
    };
  }

  async findAllFocusedPackTargets(query: FocusedPackTargetQueryDto) {
    const { page = 1, limit = 20, userId, productId, searchText, date } = query;
    const filter: Record<string, unknown> = {};

    if (userId) filter.userId = userId;
    if (productId) filter.productId = productId;
    if (date) {
      filter.startDate = { $lte: date };
      filter.endDate = { $gte: date };
    }
    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { userName: regex },
        { productName: regex },
        { productId: regex },
      ];
    }

    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const [items, total] = await Promise.all([
      this.focusedPackTargetModel
        .find(filter)
        .sort({ startDate: -1, createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      this.focusedPackTargetModel.countDocuments(filter),
    ]);

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack targets fetched successfully',
      data: items.map((item) => this.toKgWeight(item)),
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async findFocusedPackTargetById(id: string) {
    const data = await this.focusedPackTargetModel
      .findById(id)
      .lean()
      .catch(() => null);
    if (!data) throw new NotFoundException('Focused Pack target not found');

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack target fetched successfully',
      data: this.toKgWeight(data),
    };
  }

  async updateFocusedPackTarget(
    id: string,
    payload: UpdateFocusedPackTargetDto,
  ) {
    const existing = await this.focusedPackTargetModel
      .findById(id)
      .lean()
      .catch(() => null);
    if (!existing) throw new NotFoundException('Focused Pack target not found');

    const startDate = payload.startDate || existing.startDate;
    const endDate = payload.endDate || existing.endDate;
    this.validateTargetPeriod(startDate, endDate);

    const data = await this.focusedPackTargetModel.findByIdAndUpdate(
      id,
      { $set: this.toStoredWeight(payload) },
      { new: true, runValidators: true },
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack target updated successfully',
      data: this.toKgWeight(data),
    };
  }

  async deleteFocusedPackTarget(id: string) {
    const data = await this.focusedPackTargetModel
      .findByIdAndDelete(id)
      .catch(() => null);
    if (!data) throw new NotFoundException('Focused Pack target not found');

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack target deleted successfully',
      data: { id },
    };
  }

  async bulkUploadFocusedPackTargets(dto: BulkUploadFocusedPackTargetsDto) {
    const results: Array<{
      row: number;
      userId: string;
      productId: string;
      status: 'CREATED' | 'UPDATED' | 'FAILED';
      message?: string;
    }> = [];
    let created = 0;
    let updated = 0;

    for (const [index, item] of dto.items.entries()) {
      try {
        this.validateTargetPeriod(item.startDate, item.endDate);
        const filter = {
          userId: item.userId,
          productId: item.productId,
          startDate: item.startDate,
          endDate: item.endDate,
        };
        const exists = await this.focusedPackTargetModel.exists(filter);
        await this.focusedPackTargetModel.findOneAndUpdate(
          filter,
          { $set: this.toStoredWeight(item) },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );
        const status = exists ? 'UPDATED' : 'CREATED';
        if (exists) updated += 1;
        else created += 1;
        results.push({
          row: index + 1,
          userId: item.userId,
          productId: item.productId,
          status,
        });
      } catch (error) {
        results.push({
          row: index + 1,
          userId: item.userId,
          productId: item.productId,
          status: 'FAILED',
          message: this.getErrorMessage(error),
        });
      }
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Focused Pack target bulk upload processed',
      data: {
        total: dto.items.length,
        created,
        updated,
        failed: dto.items.length - created - updated,
        results,
      },
    };
  }

  private validateTargetPeriod(startDate: Date, endDate: Date) {
    if (endDate < startDate) {
      throw new BadRequestException('End date must be on or after start date');
    }
  }

  private toStoredWeight<T extends { targetTonnage?: number }>(value: T): T {
    if (value.targetTonnage === undefined) return value;
    return {
      ...value,
      targetTonnage: Number(value.targetTonnage) / 1000,
    };
  }

  private toKgWeight(value: any) {
    if (!value) return value;
    const plain =
      typeof value.toObject === 'function' ? value.toObject() : value;
    return {
      ...plain,
      targetTonnage: Number(plain.targetTonnage || 0) * 1000,
    };
  }

  async create(payload: CreateTargetDto) {
    try {
      return await this.withTransaction(async (session) => {
        if (payload.endDate < payload.startDate) {
          throw new BadRequestException(
            'End date must be on or after start date',
          );
        }

        const filter: FilterQuery<Target> = {
          userId: payload.userId,
          parentCategoryId: payload.parentCategoryId,
          categoryId: payload.categoryId,
          startDate: payload.startDate,
          endDate: payload.endDate,
        };

        const existing = await this.findOne(filter, {
          session,
          includeDeleted: true,
        });

        if (existing && !existing.isDeleted) {
          throw new ConflictException(TARGET.DUPLICATE);
        }

        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...this.toStoredWeight(payload),
              isDeleted: false,
            },
            { session },
          );

          return {
            statusCode: HttpStatus.OK,
            message: TARGET.CREATED,
            data: { userId: existing.userId },
          };
        }

        const doc = await this.save(this.toStoredWeight(payload), { session });

        return {
          statusCode: HttpStatus.CREATED,
          message: TARGET.CREATED,
          data: this.toKgWeight(doc),
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async bulkUpload(dto: BulkUploadTargetsDto) {
    const results: Array<{
      row: number;
      userName?: string;
      category: string;
      status: 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'FAILED';
      message?: string;
    }> = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const [index, item] of dto.items.entries()) {
      try {
        if (item.endDate < item.startDate) {
          throw new BadRequestException(
            'End date must be on or after start date',
          );
        }
        const storedItem = this.toStoredWeight(item);

        const filter: FilterQuery<Target> = {
          userId: item.userId,
          parentCategoryId: item.parentCategoryId,
          categoryId: item.categoryId,
          startDate: item.startDate,
          endDate: item.endDate,
        };
        const existing = await this.findOne(filter, { includeDeleted: true });

        if (!existing) {
          await this.save(storedItem);
          created += 1;
          results.push({
            row: index + 1,
            userName: item.userName,
            category: item.category,
            status: 'CREATED',
          });
          continue;
        }

        const changed =
          existing.isDeleted ||
          Object.entries(storedItem).some(([key, value]) => {
            const current = existing.get(key);
            if (value instanceof Date)
              return new Date(current).getTime() !== value.getTime();
            return current !== value;
          });

        if (changed) {
          await this.updateById(existing._id.toString(), {
            ...storedItem,
            isDeleted: false,
          });
          updated += 1;
          results.push({
            row: index + 1,
            userName: item.userName,
            category: item.category,
            status: 'UPDATED',
          });
        } else {
          unchanged += 1;
          results.push({
            row: index + 1,
            userName: item.userName,
            category: item.category,
            status: 'UNCHANGED',
          });
        }
      } catch (error) {
        results.push({
          row: index + 1,
          userName: item.userName,
          category: item.category,
          status: 'FAILED',
          message: this.getErrorMessage(error),
        });
      }
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Targets bulk upload processed',
      data: {
        total: dto.items.length,
        created,
        updated,
        unchanged,
        failed: dto.items.length - created - updated - unchanged,
        results,
      },
    };
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'string') return response;
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        return Array.isArray(message)
          ? message.join(', ')
          : message || 'Unable to create target';
      }
    }
    return error instanceof Error ? error.message : 'Unable to create target';
  }

  async findAll(query: TargetQueryDto) {
    const { searchText, page = 1, limit = 20 } = query;

    const filter: FilterQuery<Target> = {};

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ userId: regex }];
    }
    if (query.uboTarget !== undefined) filter.uboTarget = query.uboTarget;

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: TARGET.FETCHED,
      data: result.items.map((item) => this.toKgWeight(item)),
      meta: result.meta,
    };
  }

  async exportTargets(query: TargetQueryDto) {
    const filter: FilterQuery<Target> = {};
    if (query.searchText)
      filter.$or = [{ userId: new RegExp(query.searchText, 'i') }];
    if (query.userId) filter.userId = query.userId;
    if (query.parentCategoryId)
      filter.parentCategoryId = query.parentCategoryId;
    if (query.categoryId) filter.categoryId = query.categoryId;
    if (query.uboTarget !== undefined) filter.uboTarget = query.uboTarget;

    const definitions = [
      { key: 'primary', title: 'User' },
      { key: 'userId', title: 'User ID' },
      { key: 'parentCategory', title: 'Parent Category' },
      { key: 'category', title: 'Child Category' },
      { key: 'targetCases', title: 'Cases' },
      { key: 'targetTonnage', title: 'KG' },
      { key: 'targetValue', title: 'Value' },
      { key: 'uboTarget', title: 'UBO Target' },
      { key: 'startDate', title: 'Start Date' },
      { key: 'endDate', title: 'End Date' },
    ];
    const requested = query.columns
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const selected = requested?.length
      ? definitions.filter((column) => requested.includes(column.key))
      : definitions;
    const columns = selected.length ? selected : definitions;
    const targets = await this.findLean(filter, { sort: { startDate: -1 } });
    const rows = [
      columns.map((column) => column.title),
      ...targets.map((target: any) => {
        const values: Record<string, string> = {
          primary: target.userName || target.userId || '',
          userId: target.userId || '',
          parentCategory: target.parentCategory || '',
          category: target.category || '',
          targetCases: String(target.targetCases ?? 0),
          targetTonnage: String(Number(target.targetTonnage ?? 0) * 1000),
          targetValue: String(target.targetValue ?? 0),
          uboTarget: String(target.uboTarget ?? 0),
          startDate: target.startDate
            ? new Date(target.startDate).toISOString().slice(0, 10)
            : '',
          endDate: target.endDate
            ? new Date(target.endDate).toISOString().slice(0, 10)
            : '',
        };
        return columns.map((column) => values[column.key] ?? '');
      }),
    ];

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildExportPdf(rows),
        fileName: 'target-listing.pdf',
        mimeType: 'application/pdf',
      };
    }

    const uploadHeaders = [
      'userId',
      'userName',
      'parentCategoryId',
      'parentCategory',
      'categoryId',
      'category',
      'description',
      'targetCases',
      'targetTonnage',
      'targetValue',
      'uboTarget',
      'startDate',
      'endDate',
    ];
    const uploadRows = [
      uploadHeaders,
      ...targets.map((target: any) => [
        target.userId || '',
        target.userName || '',
        target.parentCategoryId || '',
        target.parentCategory || '',
        target.categoryId || '',
        target.category || '',
        target.description || '',
        Number(target.targetCases ?? 0),
        Number(target.targetTonnage ?? 0) * 1000,
        Number(target.targetValue ?? 0),
        Number(target.uboTarget ?? 0),
        target.startDate
          ? new Date(target.startDate).toISOString().slice(0, 10)
          : '',
        target.endDate
          ? new Date(target.endDate).toISOString().slice(0, 10)
          : '',
      ]),
    ];
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(uploadRows);
    worksheet['!autofilter'] = { ref: `A1:L${uploadRows.length}` };
    worksheet['!cols'] = uploadHeaders.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Targets');
    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'target-upload-export.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private buildExportPdf(rows: string[][]) {
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
    const pages: string[][][] = [];
    for (let index = 0; index < dataRows.length; index += rowsPerPage) {
      pages.push(dataRows.slice(index, index + rowsPerPage));
    }
    if (!pages.length) pages.push([]);

    const generatedAt = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: REPORT_TIMEZONE,
    }).format(new Date());
    const fontSize = headers.length > 7 ? 6.5 : 7.5;
    const headerFontSize = headers.length > 7 ? 6.8 : 7.8;
    const escape = (value: string) =>
      value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const textLimit = (width: number, size: number) =>
      Math.max(6, Math.floor(width / (size * 0.52)));
    const truncate = (value: string, limit: number) => {
      const clean = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      return clean.length > limit
        ? `${clean.slice(0, Math.max(0, limit - 3))}...`
        : clean;
    };
    const text = (x: number, y: number, value: string, size = fontSize) =>
      `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escape(value)}) Tj ET`;
    const rect = (
      x: number,
      y: number,
      width: number,
      height: number,
      mode: 'S' | 'f' = 'S',
    ) =>
      `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${mode}`;
    const objects: string[] = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    const pageIds: number[] = [];
    let nextId = 4;
    pages.forEach((pageRows, pageIndex) => {
      const pageId = nextId++;
      const contentId = nextId++;
      pageIds.push(pageId);
      const commands: string[] = [
        '0.08 0.13 0.2 rg',
        text(margin, pageHeight - 42, 'Target Listing', 16),
        '0.35 0.43 0.53 rg',
        text(
          margin,
          pageHeight - 62,
          `Generated ${generatedAt} - ${dataRows.length} row(s)`,
          8,
        ),
        text(
          pageWidth - margin - 84,
          pageHeight - 62,
          `Page ${pageIndex + 1} of ${pages.length}`,
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
      pageRows.forEach((row, rowIndex) => {
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
      objects[pageId] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] =
        `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (let id = 1; id < objects.length; id += 1) {
      if (!objects[id]) continue;
      offsets[id] = Buffer.byteLength(pdf);
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1)
      pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf);
  }

  async findByUserId(userId: string) {
    const doc = await this.findOne({ userId }, { lean: true });

    if (!doc) throw new NotFoundException(TARGET.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: TARGET.FETCHED,
      data: this.toKgWeight(doc),
    };
  }

  async update(idOrUserId: string, dto: UpdateTargetDto) {
    try {
      return await this.withTransaction(async (session) => {
        const existing = Types.ObjectId.isValid(idOrUserId)
          ? await this.model
              .findOne({ _id: idOrUserId, isDeleted: false })
              .session(session)
          : await this.findOne({ userId: idOrUserId }, { session });

        if (!existing) throw new NotFoundException(TARGET.NOT_FOUND);

        const startDate = dto.startDate ?? existing.startDate;
        const endDate = dto.endDate ?? existing.endDate;
        this.validateTargetPeriod(startDate, endDate);

        const doc = await this.model.findOneAndUpdate(
          { _id: existing._id, isDeleted: false },
          this.toStoredWeight(dto),
          { session, new: true },
        );

        if (!doc) throw new NotFoundException(TARGET.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: TARGET.UPDATED,
          data: this.toKgWeight(doc),
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(userId: string) {
    const existing = await this.findOne({ userId });

    if (!existing) throw new NotFoundException(TARGET.NOT_FOUND);

    await this.softDelete({ userId });

    return {
      statusCode: HttpStatus.OK,
      message: TARGET.DELETED,
      data: this.toKgWeight(existing),
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(TARGET.DUPLICATE);
    }
    throw error;
  }
}
