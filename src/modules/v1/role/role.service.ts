/**
 * Role Service
 * ------------
 * Purpose : Handle business logic for role management
 * Used by : RoleController
 *
 * Responsibilities:
 * - Create and restore roles
 * - Enforce role name uniqueness
 * - Retrieve roles with filters and pagination
 * - Update role configuration
 * - Soft delete roles
 *
 * Notes:
 * - Role names are normalized for consistency
 * - Soft-deleted roles can be restored
 * - RoleId is immutable once created
 */

import {
  Injectable,
  ConflictException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';

import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';

import { ROLE } from './role.constants';
import { Role, RoleSchema } from 'src/core/database/mongo/schema/role.schema';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { Status } from 'src/shared/enums/app.enums';
import { normalizeRoleName } from './role.uitls';
import * as XLSX from 'xlsx';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

@Injectable()
export class RoleService extends MongoRepository<Role> {
  constructor(mongo: MongoService) {
    super(mongo.getModel<Role>(Role.name, RoleSchema));
  }

  private buildRoleFilter(query: RoleQueryDto) {
    const { status, searchText } = query;
    const filter: any = {};

    if (status) {
      filter.status = status;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { roleId: regex },
        { name: regex },
        { displayName: regex },
        { description: regex },
      ];
    }

    return filter;
  }

  private getRoleSort(query: RoleQueryDto): Record<string, 1 | -1> {
    const sortMap: Record<string, string> = {
      primary: 'displayName',
      name: 'displayName',
      roleId: 'roleId',
      permissions: 'permissions',
    };
    const sortField = query.sortBy ? sortMap[query.sortBy] : undefined;

    if (!sortField) return { createdAt: -1 };

    return { [sortField]: query.sortOrder === 'desc' ? -1 : 1 };
  }

  private getExportColumns(columns?: string) {
    const definitions = [
      { key: 'primary', title: 'Role' },
      { key: 'roleId', title: 'Role ID' },
      { key: 'description', title: 'Description' },
      { key: 'permissions', title: 'Permissions' },
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
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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
      const cleanValue = String(value ?? '').replace(/\s+/g, ' ').trim();
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
    objects[fontObjectId] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

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
          commands.push('0.96 0.98 1 rg', rect(margin, y, tableWidth, rowHeight, 'f'));
        }

        commands.push('0.85 0.89 0.94 RG', rect(margin, y, tableWidth, rowHeight));
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

    objects[2] =
      `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

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
   * Create Role
   * -----------
   * Purpose : Create a new role or restore a soft-deleted role
   *
   * Flow:
   * - Normalize role name
   * - Check for existing role (including soft-deleted)
   * - Restore soft-deleted role if found
   * - Otherwise create a new role
   *
   * Notes:
   * - Role name uniqueness is enforced
   * - Restored roles are reactivated with updated values
   */
  async create(dto: CreateRoleDto & Partial<Role>) {
    const normalizedName = normalizeRoleName(dto.name);

    // Check if role already exists (including soft-deleted)
    const existing = (await this.findOne(
      { name: normalizedName },
      { withDeleted: true },
    )) as any;

    if (existing) {
      // Active role → conflict
      if (!existing.isDeleted) {
        throw new ConflictException(ROLE.DUPLICATE);
      }

      // Soft-deleted role → restore & update
      const restored = await this.updateOne(
        { roleId: existing.roleId },
        {
          displayName: dto.name.trim(),
          name: normalizedName,
          description: dto.description,
          permissions: dto.permissions,
          status: dto.status ?? Status.ACTIVE,
          isSystemAdmin: dto.isSystemAdmin ?? false,
          isDeleted: false,
        },
      );

      return {
        statusCode: HttpStatus.OK,
        message: ROLE.CREATED,
        data: restored,
      };
    }

    // Fresh role creation
    const role = await this.save({
      roleId: normalizedName,
      name: normalizedName,
      displayName: dto.name.trim(),
      description: dto.description,
      permissions: dto.permissions,
      status: dto.status ?? Status.ACTIVE,
      isSystemAdmin: dto.isSystemAdmin ?? false,
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: ROLE.CREATED,
      data: role,
    };
  }

  /**
   * Get Roles (List)
   * ----------------
   * Purpose : Retrieve roles using filters and pagination
   *
   * Supports:
   * - Status filtering
   * - Free-text search
 * - Pagination & sorting
   */
  async findAll(query: RoleQueryDto) {
    const {
      page = 1,
      limit = 20,
    } = query;

    const result = await this.paginate(this.buildRoleFilter(query), {
      page,
      limit,
      sort: this.getRoleSort(query),
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: ROLE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async exportRoles(
    query: RoleQueryDto & { fileType?: 'excel' | 'pdf'; columns?: string },
  ) {
    const columns = this.getExportColumns(query.columns);
    const roles = await this.findLean(this.buildRoleFilter(query), {
      sort: this.getRoleSort(query),
    });
    const exportRows = roles.map((role: any) => {
      const values: Record<string, string> = {
        primary: role.displayName || role.name || '',
        roleId: role.roleId || '',
        description: role.description || '',
        permissions: Array.isArray(role.permissions)
          ? role.permissions.join(', ')
          : '',
        status: role.status || '',
      };

      return columns.map((column) => values[column.key] ?? '');
    });
    const headerRow = columns.map((column) => column.title);

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildPdfBuffer('Role Listing', [headerRow, ...exportRows]),
        fileName: 'role-listing.pdf',
        mimeType: 'application/pdf',
      };
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Roles');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'role-listing.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Get Role by ID
   * --------------
   * Purpose : Retrieve role details by roleId
   *
   * Throws:
   * - NotFoundException if role does not exist
   */
  async findByRoleId(roleId: string) {
    const role = await this.findOne({ roleId }, { lean: true });

    if (!role) {
      throw new NotFoundException(ROLE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: ROLE.FETCHED,
      data: role,
    };
  }

  /**
   * Update Role
   * -----------
   * Purpose : Update role properties (roleId remains immutable)
   *
   * Notes:
   * - Role name is normalized if updated
   * - Duplicate role names are prevented
   */
  async update(roleId: string, dto: UpdateRoleDto) {
    const update: any = { ...dto };

    if (dto.name) {
      update.name = normalizeRoleName(dto.name);
      update.displayName = dto.name.trim();
    }

    try {
      const role = await this.upsert({ roleId }, update, { upsert: false });

      if (!role) {
        throw new NotFoundException(ROLE.NOT_FOUND);
      }

      return {
        statusCode: HttpStatus.OK,
        message: ROLE.UPDATED,
        data: role,
      };
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(ROLE.DUPLICATE);
      }
      throw err;
    }
  }

  /**
   * Delete Role (Soft Delete)
   * -------------------------
   * Purpose : Soft delete a role
   *
   * Notes:
   * - Role data is retained for audit purposes
   */
  async delete(roleId: string) {
    const role = await this.softDelete({ roleId });

    if (!role) {
      throw new NotFoundException(ROLE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: ROLE.DELETED,
      data: role,
    };
  }
}
