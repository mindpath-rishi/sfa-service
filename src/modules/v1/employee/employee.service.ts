/**
 * Employee Service
 * ----------------
 * Purpose : Handles business logic for employee lifecycle management
 * Used by : EmployeeController
 *
 * Responsibilities:
 * - Create employee profiles and linked auth users
 * - Restore soft-deleted employees
 * - Fetch employee lists with filters and pagination
 * - Retrieve single employee profiles
 * - Update employee information
 * - Soft-delete employees and linked users
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Employee and User records are tightly coupled
 * - Soft deletes are used to preserve audit history
 */

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

import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { UserStatus } from 'src/modules/v1/user/user.enum';

import { UserService } from 'src/modules/v1/user/user.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee.query.dto';
import { BulkUploadEmployeesDto } from './dto/bulk-upload-employees.dto';
import { EMPLOYEE } from './employee.constants';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { InjectModel } from '@nestjs/mongoose';
import { Sale } from 'src/core/database/mongo/schema/sale.schema';
import { Payment } from 'src/core/database/mongo/schema/payment.schema';
import { Model } from 'mongoose';
import { ShopVisit } from 'src/core/database/mongo/schema/shop-visit.schema';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';
import { SaleStatus } from 'src/shared/enums/sale.enums';
import { ActivityStatus } from 'src/shared/enums/activity.enums';
import { Activity } from 'src/core/database/mongo/schema/activity.schema';
import { RequestContextStore } from 'src/core/context/request-context';
import { LeaveStatus } from 'src/shared/enums/leave.enums';
import { Leave } from 'src/core/database/mongo/schema/leave.schema';
import { Target } from 'src/core/database/mongo/schema/target.schema';
import { Customer } from 'src/core/database/mongo/schema/customer.schema';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { RouteCustomerMappingStatus } from 'src/shared/enums/route-customer-mapping.enums';
import { RouteCustomerMapping } from 'src/core/database/mongo/schema/route-customer-mapping.schema';
import { Route } from 'src/core/database/mongo/schema/route.schema';
import { VanStatus } from 'src/shared/enums/van.enums';
import { Van } from 'src/core/database/mongo/schema/van.schema';
import { NonSaleStatus } from 'src/shared/enums/non-sale.enums';
import { NonSale } from 'src/core/database/mongo/schema/non-sale.schema';
import { SaleItem } from 'src/core/database/mongo/schema/sale-item.schema';
import { WorkSession } from 'src/core/database/mongo/schema/work-session.schema';
import { RouteSession } from 'src/core/database/mongo/schema/route-session.schema';
import { VanDailyStock } from 'src/core/database/mongo/schema/van-daily-stock.schema';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';
import { Role } from 'src/core/database/mongo/schema/role.schema';
import { Designation } from 'src/core/database/mongo/schema/designation.schema';
import * as XLSX from 'xlsx';
import { User } from 'src/core/database/mongo/schema/user.schema';
import { FocusedPackTarget } from 'src/core/database/mongo/schema/focused-pack-target.schema';
import { LiveLocationService } from '../live-location/live-location.service';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';

const parseCalendarDate = (value?: string) => {
  if (!value) return new Date();

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
};

const formatCalendarDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
};

@Injectable()
export class EmployeeService extends MongoRepository<Employee> {
  constructor(
    mongo: MongoService,
    private readonly userService: UserService,
    @InjectModel(Sale.name)
    private readonly saleModal: Model<Sale>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<Payment>,
    @InjectModel(ShopVisit.name)
    private readonly shopVisitModel: Model<ShopVisit>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<Activity>,
    @InjectModel(Leave.name)
    private readonly leaveModel: Model<Leave>,
    @InjectModel(Target.name)
    private readonly targetModel: Model<Target>,
    @InjectModel(FocusedPackTarget.name)
    private readonly focusedPackTargetModel: Model<FocusedPackTarget>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<Customer>,
    @InjectModel(RouteCustomerMapping.name)
    private readonly routeCustomerMappingModel: Model<RouteCustomerMapping>,
    @InjectModel(Route.name)
    private readonly routeModel: Model<Route>,
    @InjectModel(Van.name)
    private readonly vanModel: Model<Van>,
    @InjectModel(NonSale.name)
    private readonly nonSaleModel: Model<NonSale>,
    @InjectModel(SaleItem.name)
    private readonly saleItemModel: Model<SaleItem>,
    @InjectModel(WorkSession.name)
    private readonly workSessionModel: Model<WorkSession>,
    private readonly liveLocationService: LiveLocationService,
    @InjectModel(RouteSession.name)
    private readonly routeSessionModel: Model<RouteSession>,
    @InjectModel(VanDailyStock.name)
    private readonly vanDailyStockModel: Model<VanDailyStock>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<Role>,
    @InjectModel(Designation.name)
    private readonly designationModel: Model<Designation>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {
    super(mongo.getModel(Employee.name, EmployeeSchema));
  }

  private async validateAssignedVansForRole(
    roleId?: string,
    assignedVanIds?: string[],
  ) {
    if (!roleId || assignedVanIds === undefined) return;

    const role = await this.roleModel.findOne({ roleId }).lean();
    if (!role) return;

    const maxAssociatedVans = role.maxAssociatedVans ?? 0;
    if (maxAssociatedVans === -1) return;

    if (assignedVanIds.length > maxAssociatedVans) {
      throw new BadRequestException(
        `Role allows only ${maxAssociatedVans} associated van(s).`,
      );
    }
  }

  private async normalizeOfflineAccess(roleId: string, requested: boolean) {
    if (!requested) return false;
    const role = await this.roleModel.findOne({ roleId }).lean();
    const roleName = String(role?.name ?? '')
      .trim()
      .toUpperCase();
    if (!['SALESMAN', 'SALES', 'SALES_EXECUTIVE'].includes(roleName)) {
      throw new BadRequestException(
        'Offline access can only be granted to a salesman role.',
      );
    }
    return true;
  }

  private async buildHierarchyPath(reportingEmployeeId?: string) {
    if (!reportingEmployeeId) return [];

    const reportingEmployee = await this.findOne(
      { employeeId: reportingEmployeeId },
      { lean: true },
    );

    if (!reportingEmployee) {
      throw new BadRequestException('Reporting employee not found.');
    }

    return [
      ...(reportingEmployee.hierarchyPath || []),
      reportingEmployee.employeeId,
    ];
  }

  private async attachLoginIds<T extends { employeeId?: string }>(
    employees: T[],
  ) {
    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter((employeeId): employeeId is string => Boolean(employeeId));

    if (!employeeIds.length) return employees;

    const users = await this.userModel
      .find({ profileId: { $in: employeeIds } })
      .select('profileId loginId')
      .lean();
    const loginIdByProfileId = new Map(
      users.map((user) => [user.profileId, user.loginId]),
    );

    return employees.map((employee) => ({
      ...employee,
      loginId: employee.employeeId
        ? loginIdByProfileId.get(employee.employeeId)
        : undefined,
    }));
  }

  private async attachAssignedVanIds<T extends { employeeId?: string }>(
    employees: T[],
  ) {
    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter((employeeId): employeeId is string => Boolean(employeeId));

    if (!employeeIds.length) return employees;

    const vans = await this.vanModel
      .find({ associatedUsers: { $in: employeeIds } })
      .select('vanId associatedUsers')
      .lean();
    const vanIdsByEmployeeId = new Map<string, string[]>();

    vans.forEach((van) => {
      (van.associatedUsers || []).forEach((employeeId) => {
        if (!employeeIds.includes(employeeId)) return;
        const vanIds = vanIdsByEmployeeId.get(employeeId) || [];
        vanIds.push(van.vanId);
        vanIdsByEmployeeId.set(employeeId, vanIds);
      });
    });

    return employees.map((employee) => ({
      ...employee,
      assignedVanIds: employee.employeeId
        ? vanIdsByEmployeeId.get(employee.employeeId) || []
        : [],
    }));
  }

  private async resolveVanIds(values?: string[]) {
    if (!values) return values;
    if (!values.length) return [];

    const resolved: string[] = [];

    for (const value of values) {
      const van = await this.vanModel
        .findOne({
          $or: [
            { vanId: value },
            { name: this.exactRegex(value) },
            { vanNumber: this.exactRegex(value) },
          ],
        })
        .lean();

      if (!van) {
        throw new BadRequestException(`Van not found: ${value}`);
      }

      resolved.push(van.vanId);
    }

    return [...new Set(resolved)];
  }

  private async syncEmployeeVanAssignments(
    employeeId: string,
    assignedVanIds?: string[],
    session?: any,
  ) {
    if (assignedVanIds === undefined) return;

    await this.vanModel.updateMany(
      { associatedUsers: employeeId },
      { $pull: { associatedUsers: employeeId } },
      { session },
    );

    if (!assignedVanIds.length) return;

    await this.vanModel.updateMany(
      { vanId: { $in: assignedVanIds } },
      { $addToSet: { associatedUsers: employeeId } },
      { session },
    );
  }

  /**
   * Create Employee
   * ---------------
   * Purpose : Create a new employee profile and linked authentication user
   *
   * Flow:
   * - Check for existing employee (including soft-deleted)
   * - Restore soft-deleted employee if found
   * - Generate unique employeeId
   * - Create employee profile
   * - Create linked auth user
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active employees
   */
  async create(payload: CreateEmployeeDto) {
    const initialStatus = payload.status ?? UserStatus.ACTIVE;
    const assignedVanIds = await this.resolveVanIds(payload.assignedVanIds);
    await this.validateAssignedVansForRole(payload.roleId, assignedVanIds);
    const offlineAccessAllowed = await this.normalizeOfflineAccess(
      payload.roleId,
      payload.offlineAccessAllowed === true,
    );
    const hierarchyPath = await this.buildHierarchyPath(
      payload.reportingEmployeeId,
    );

    return this.withTransaction(async (session) => {
      // Check existing employee (including soft-deleted)
      const duplicateConditions = [
        { mobile: payload.mobile },
        ...(payload.email ? [{ email: payload.email }] : []),
      ];
      const existingEmployee = await this.findOne(
        {
          $or: duplicateConditions,
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active employees
      if (existingEmployee && !existingEmployee.isDeleted) {
        throw new ConflictException(EMPLOYEE.DUPLICATE);
      }

      // Restore soft-deleted employee and linked user
      if (existingEmployee?.isDeleted) {
        await this.updateById(
          existingEmployee._id.toString(),
          {
            name: payload.name,
            roleId: payload.roleId,
            designationId: payload.designationId,
            reportingEmployeeId: payload.reportingEmployeeId,
            hierarchyPath,
            permissionOverrides: payload.permissionOverrides
              ? {
                  allow: payload.permissionOverrides.allow || [],
                  deny: payload.permissionOverrides.deny || [],
                }
              : undefined,
            offlineAccessAllowed,
            status: initialStatus,
            isDeleted: false,
          },
          { session },
        );
        await this.syncEmployeeVanAssignments(
          existingEmployee.employeeId,
          assignedVanIds,
          session,
        );

        await this.userService.restoreUser(
          {
            profileId: existingEmployee.employeeId,
            mobile: payload.mobile,
            email: payload.email,
            password: payload.password,
            isDeleted: false,
            status: initialStatus,
            loginId: payload.loginId,
          },
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: EMPLOYEE.CREATED,
          data: { employeeId: existingEmployee.employeeId, assignedVanIds },
        };
      }

      // Generate unique business employeeId
      const MAX_TRIES = 10;
      let employeeId = '';

      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        employeeId = IdGenerator.generate('EID', 8);
        if (!(await this.exists({ employeeId }, session))) break;

        if (attempt === MAX_TRIES) {
          throw new ConflictException(
            'Unable to generate unique employeeId. Try again.',
          );
        }
      }

      // Create employee profile
      const employee = await this.save(
        {
          employeeId,
          mobile: payload.mobile,
          name: payload.name,
          email: payload.email,
          roleId: payload.roleId,
          designationId: payload.designationId,
          reportingEmployeeId: payload.reportingEmployeeId,
          hierarchyPath,
          permissionOverrides: payload.permissionOverrides
            ? {
                allow: payload.permissionOverrides.allow || [],
                deny: payload.permissionOverrides.deny || [],
              }
            : undefined,
          offlineAccessAllowed,
          status: initialStatus,
        },
        { session },
      );

      // Create linked authentication user
      await this.userService.createUser(
        {
          profileId: employeeId,
          mobile: payload.mobile,
          email: payload.email,
          password: payload.password,
          loginId: payload.loginId,
          status: initialStatus,
        },
        session,
      );
      await this.syncEmployeeVanAssignments(
        employeeId,
        assignedVanIds,
        session,
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: EMPLOYEE.CREATED,
        data: {
          ...(employee.toObject?.() ?? employee),
          assignedVanIds: assignedVanIds || [],
        },
      };
    });
  }

  async bulkUpload(dto: BulkUploadEmployeesDto) {
    const results: Array<{
      row: number;
      status: 'CREATED' | 'FAILED';
      employeeId?: string;
      message?: string;
    }> = [];
    let created = 0;
    let failed = 0;

    for (const [index, item] of dto.items.entries()) {
      try {
        const resolvedItem = await this.resolveBulkUploadReferences(item);
        const response = await this.create(resolvedItem);
        const employeeId =
          typeof response.data === 'object' && response.data
            ? (response.data as { employeeId?: string }).employeeId
            : undefined;

        created += 1;
        results.push({
          row: index + 1,
          status: 'CREATED',
          employeeId,
        });
      } catch (error) {
        failed += 1;
        results.push({
          row: index + 1,
          status: 'FAILED',
          message: this.getBulkUploadErrorMessage(error),
        });
      }
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Employees bulk upload processed',
      data: {
        total: dto.items.length,
        created,
        failed,
        results,
      },
    };
  }

  private escapeExactRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private exactRegex(value: string) {
    return new RegExp(`^${this.escapeExactRegex(value.trim())}$`, 'i');
  }

  private async resolveRoleId(value: string): Promise<string>;
  private async resolveRoleId(value?: string): Promise<string | undefined>;
  private async resolveRoleId(value?: string) {
    if (!value) return value;

    const role = await this.roleModel
      .findOne({
        $or: [
          { roleId: value },
          { name: this.exactRegex(value) },
          { displayName: this.exactRegex(value) },
        ],
      })
      .lean();

    if (!role) {
      throw new BadRequestException(`Role not found: ${value}`);
    }

    return role.roleId;
  }

  private async resolveDesignationId(value?: string) {
    if (!value) return value;

    const designation = await this.designationModel
      .findOne({
        $or: [{ designationId: value }, { name: this.exactRegex(value) }],
      })
      .lean();

    if (!designation) {
      throw new BadRequestException(`Designation not found: ${value}`);
    }

    return designation.designationId;
  }

  private async resolveReportingEmployeeId(value?: string) {
    if (!value) return value;

    const employee = await this.findOne(
      {
        $or: [{ employeeId: value }, { name: this.exactRegex(value) }],
      },
      { lean: true },
    );

    if (!employee) {
      throw new BadRequestException(`Report To employee not found: ${value}`);
    }

    return employee.employeeId;
  }

  private async resolveBulkUploadReferences(item: CreateEmployeeDto) {
    return {
      ...item,
      roleId: await this.resolveRoleId(item.roleId),
      designationId: await this.resolveDesignationId(item.designationId),
      assignedVanIds: await this.resolveVanIds(item.assignedVanIds),
      reportingEmployeeId: await this.resolveReportingEmployeeId(
        item.reportingEmployeeId,
      ),
    };
  }

  private getBulkUploadErrorMessage(error: unknown) {
    if (error instanceof HttpException) {
      const response = error.getResponse();

      if (typeof response === 'string') return response;
      if (typeof response === 'object' && response && 'message' in response) {
        const message = (response as { message?: string | string[] }).message;
        return Array.isArray(message) ? message.join(', ') : message;
      }
    }

    return error instanceof Error ? error.message : 'Unable to create employee';
  }

  private buildEmployeeFilter(query: EmployeeQueryDto) {
    const { status, roleId, designationId, reportingEmployeeId, searchText } =
      query;
    const filter: Record<string, any> = {};

    if (status) filter.status = status;
    if (roleId) filter.roleId = roleId;
    if (designationId) filter.designationId = designationId;
    if (reportingEmployeeId) filter.reportingEmployeeId = reportingEmployeeId;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');

      filter.$or = [
        { employeeId: regex },
        { name: regex },
        { mobile: regex },
        { email: regex },
        { designationId: regex },
      ];
    }

    return filter;
  }

  private getExportColumns(columns?: string) {
    const definitions = [
      { key: 'primary', title: 'Name' },
      { key: 'loginId', title: 'Login ID' },
      { key: 'secondary', title: 'Role' },
      { key: 'owner', title: 'Reports To' },
      { key: 'designation', title: 'Designation' },
      { key: 'assignedVans', title: 'Assigned Vans' },
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

  private async getEmployeeListingMaps(employees: any[]) {
    const reportingEmployeeIds = [
      ...new Set(
        employees
          .map((employee) => employee.reportingEmployeeId)
          .filter(Boolean),
      ),
    ];
    const [roles, designations, vans, reportingEmployees] = await Promise.all([
      this.roleModel.find({}).lean(),
      this.designationModel.find({}).lean(),
      this.vanModel.find({}).lean(),
      reportingEmployeeIds.length
        ? this.findLean({ employeeId: { $in: reportingEmployeeIds } } as any)
        : [],
    ]);

    return {
      employeeNameById: new Map([
        ...employees.map(
          (employee) =>
            [employee.employeeId, employee.name] as [string, string],
        ),
        ...reportingEmployees.map(
          (employee: any) =>
            [employee.employeeId, employee.name] as [string, string],
        ),
      ]),
      roleNameById: new Map(
        roles.map((role) => [
          role.roleId,
          role.displayName || role.name || role.roleId,
        ]),
      ),
      designationNameById: new Map(
        designations.map((designation) => [
          designation.designationId,
          designation.name || designation.designationId,
        ]),
      ),
      vanNameById: new Map(
        vans.map((van) => [van.vanId, van.name || van.vanNumber || van.vanId]),
      ),
    };
  }

  private getEmployeeListingValue(employee: any, maps: any, key: string) {
    const values: Record<string, string> = {
      primary: employee.name || '',
      loginId: employee.loginId || '',
      secondary:
        (employee.roleId && maps.roleNameById.get(employee.roleId)) ||
        employee.roleId ||
        '',
      owner:
        (employee.reportingEmployeeId &&
          maps.employeeNameById.get(employee.reportingEmployeeId)) ||
        employee.reportingEmployeeId ||
        '',
      designation:
        (employee.designationId &&
          (maps.designationNameById.get(employee.designationId) ||
            employee.designationId)) ||
        '',
      assignedVans: Array.isArray(employee.assignedVanIds)
        ? employee.assignedVanIds
            .map((vanId: string) => maps.vanNameById.get(vanId) || vanId)
            .join(', ')
        : '',
      status: employee.status || '',
    };

    return values[key] ?? '';
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

  async exportEmployees(
    query: EmployeeQueryDto & { fileType?: 'excel' | 'pdf'; columns?: string },
  ) {
    const columns = this.getExportColumns(query.columns);
    const employees = await this.attachAssignedVanIds(
      await this.attachLoginIds(
        await this.findLean(this.buildEmployeeFilter(query), {
          sort: { createdAt: -1 },
        }),
      ),
    );
    const [roles, designations, vans] = await Promise.all([
      this.roleModel.find({}).lean(),
      this.designationModel.find({}).lean(),
      this.vanModel.find({}).lean(),
    ]);
    const employeeNameById = new Map(
      employees.map((employee: any) => [employee.employeeId, employee.name]),
    );
    const roleNameById = new Map(
      roles.map((role) => [
        role.roleId,
        role.displayName || role.name || role.roleId,
      ]),
    );
    const designationNameById = new Map(
      designations.map((designation) => [
        designation.designationId,
        designation.name || designation.designationId,
      ]),
    );
    const vanNameById = new Map(
      vans.map((van) => [van.vanId, van.name || van.vanNumber || van.vanId]),
    );
    const exportRows = employees.map((employee: any) => {
      const values: Record<string, string> = {
        primary: employee.name || '',
        loginId: employee.loginId || '',
        secondary:
          (employee.roleId && roleNameById.get(employee.roleId)) ||
          employee.roleId ||
          '',
        owner:
          (employee.reportingEmployeeId &&
            employeeNameById.get(employee.reportingEmployeeId)) ||
          employee.reportingEmployeeId ||
          '',
        designation:
          (employee.designationId &&
            (designationNameById.get(employee.designationId) ||
              employee.designationId)) ||
          '',
        assignedVans: Array.isArray(employee.assignedVanIds)
          ? employee.assignedVanIds
              .map((vanId: string) => vanNameById.get(vanId) || vanId)
              .join(', ')
          : '',
        status: employee.status || '',
      };

      return columns.map((column) => values[column.key] ?? '');
    });
    const headerRow = columns.map((column) => column.title);

    if (query.fileType === 'pdf') {
      return {
        buffer: this.buildPdfBuffer('Employee Listing', [
          headerRow,
          ...exportRows,
        ]),
        fileName: 'employee-listing.pdf',
        mimeType: 'application/pdf',
      };
    }

    const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...exportRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');

    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      fileName: 'employee-listing.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * Get Employees (List)
   * -------------------
   * Purpose : Retrieve employees with filtering and pagination
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Pagination & sorting
   */
  async findAll(query: EmployeeQueryDto) {
    const {
      status,
      roleId,
      designationId,
      reportingEmployeeId,
      searchText,
      sortBy,
      sortOrder,
      page = 1,
      limit = 20,
    } = query;

    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }

    if (roleId) {
      filter.roleId = roleId;
    }

    if (designationId) {
      filter.designationId = designationId;
    }

    if (reportingEmployeeId) {
      filter.reportingEmployeeId = reportingEmployeeId;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');

      filter.$or = [
        { employeeId: regex },
        { name: regex },
        { mobile: regex },
        { email: regex },
        { designationId: regex },
      ];
    }

    if (sortBy && ['loginId', 'secondary', 'assignedVans'].includes(sortBy)) {
      const allItems = await this.attachAssignedVanIds(
        await this.attachLoginIds(
          await this.findLean(filter, { sort: { createdAt: -1 } }),
        ),
      );
      const maps = await this.getEmployeeListingMaps(allItems);
      const direction = sortOrder === 'desc' ? -1 : 1;
      const sortedItems = allItems.sort(
        (first: any, second: any) =>
          this.getEmployeeListingValue(first, maps, sortBy).localeCompare(
            this.getEmployeeListingValue(second, maps, sortBy),
            undefined,
            { numeric: true, sensitivity: 'base' },
          ) * direction,
      );
      const safePage = Math.max(1, page);
      const safeLimit = Math.max(1, limit);
      const start = (safePage - 1) * safeLimit;

      return {
        statusCode: HttpStatus.OK,
        message: EMPLOYEE.FETCHED,
        data: sortedItems.slice(start, start + safeLimit),
        meta: {
          total: sortedItems.length,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(sortedItems.length / safeLimit),
        },
      };
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.FETCHED,
      data: await this.attachAssignedVanIds(
        await this.attachLoginIds(
          result.items.map((item: any) => item.toObject?.() ?? item),
        ),
      ),
      meta: result.meta,
    };
  }

  /**
   * Get Employee by ID
   * ------------------
   * Purpose : Retrieve a single employee profile
   *
   * Throws:
   * - NotFoundException if employee does not exist
   */
  async findByEmployeeId(employeeId: string) {
    const employee = await this.findOne({ employeeId }, { lean: true });

    if (!employee) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.FETCHED,
      data: (
        await this.attachAssignedVanIds(
          await this.attachLoginIds([
            (employee as any).toObject?.() ?? employee,
          ]),
        )
      )[0],
    };
  }

  /**
   * Update Employee
   * ---------------
   * Purpose : Update editable employee profile fields
   *
   * Notes:
   * - Identity fields remain unchanged
   */
  async update(employeeId: string, dto: UpdateEmployeeDto) {
    const existing = await this.findOne({ employeeId }, { lean: true });
    if (!existing) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }
    const { assignedVanIds, ...employeeDto } = dto;
    employeeDto.offlineAccessAllowed = await this.normalizeOfflineAccess(
      employeeDto.roleId ?? existing.roleId,
      employeeDto.offlineAccessAllowed ??
        existing.offlineAccessAllowed ??
        false,
    );
    const resolvedAssignedVanIds = await this.resolveVanIds(assignedVanIds);
    await this.validateAssignedVansForRole(
      employeeDto.roleId ?? existing.roleId,
      resolvedAssignedVanIds,
    );

    const nextReportingEmployeeId =
      employeeDto.reportingEmployeeId !== undefined
        ? employeeDto.reportingEmployeeId
        : existing.reportingEmployeeId;
    const hierarchyPath = await this.buildHierarchyPath(
      nextReportingEmployeeId,
    );

    const employee = await this.withTransaction(async (session) => {
      const updated = await this.updateOne(
        { employeeId },
        {
          ...employeeDto,
          hierarchyPath,
        },
        { session },
      );

      if (!updated) {
        throw new NotFoundException(EMPLOYEE.NOT_FOUND);
      }

      await this.syncEmployeeVanAssignments(
        employeeId,
        resolvedAssignedVanIds,
        session,
      );

      if (employeeDto.status && employeeDto.status !== existing.status) {
        await this.userService.updateUserStatus(
          employeeId,
          employeeDto.status,
          session,
        );
      }

      return this.findOne({ employeeId }, { session, lean: true });
    });

    if (!employee) throw new NotFoundException(EMPLOYEE.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.UPDATED,
      data: (
        await this.attachAssignedVanIds([
          (employee as any).toObject?.() ?? employee,
        ])
      )[0],
    };
  }

  /**
   * Delete Employee (Soft Delete)
   * -----------------------------
   * Purpose : Deactivate employee and linked authentication user
   *
   * Flow:
   * - Soft-delete employee record
   * - Soft-delete linked auth user
   *
   * Notes:
   * - Operation is transactional
   * - Records remain for audit purposes
   */
  async delete(employeeId: string) {
    const deletedEmployee = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { employeeId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(EMPLOYEE.NOT_FOUND);
      }

      await this.softDelete({ employeeId }, { session });
      await this.userService.delete(employeeId, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.DELETED,
      data: deletedEmployee,
    };
  }

  // async getManagerStats(query: { date?: string }) {
  //   const managerId = RequestContextStore.getStore()?.userId;
  //   console.log(managerId, '==========================333================');

  //   const startOfDay = query?.date ? new Date(query.date) : new Date();

  //   startOfDay.setHours(0, 0, 0, 0);

  //   const endOfDay = new Date(startOfDay);
  //   endOfDay.setHours(23, 59, 59, 999);

  //   console.log(
  //     managerId,
  //     startOfDay,
  //     endOfDay,
  //     '==========================350=============',
  //   );

  //   /* =====================================================
  //    * TEAM MEMBERS
  //    * ===================================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   const totalUsers = employeeIds.length;

  //   if (!totalUsers) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager stats fetched successfully',
  //       data: {
  //         userSummary: {
  //           retailing: 0,
  //           officeWork: 0,
  //           leave: 0,
  //           absent: 0,
  //           total: 0,
  //         },
  //         callSummary: {
  //           productivity: 0,
  //           covered: 0,
  //           pc: 0,
  //           tc: 0,
  //           sc: 0,
  //           qtyCases: 0,
  //         },
  //       },
  //     };
  //   }

  //   const [
  //     retailingUsers,
  //     officeUsers,
  //     leaveUsers,
  //     sales,
  //     visitedCount,
  //     productiveCustomers,
  //   ] = await Promise.all([
  //     /* ========================================
  //      * RETAILING USERS
  //      * ======================================== */
  //     this.activityModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: ActivityStatus.ACTIVE,
  //       name: 'Retailing',
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * OFFICE WORK USERS
  //      * ======================================== */
  //     this.activityModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: ActivityStatus.ACTIVE,
  //       name: 'Office Work',
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * LEAVE USERS
  //      * ======================================== */
  //     this.leaveModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: LeaveStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * SALES SUMMARY
  //      * ======================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: { $in: employeeIds },
  //           date: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: SaleStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           pc: {
  //             $sum: '$totalPieces',
  //           },

  //           tc: {
  //             $sum: '$totalCases',
  //           },

  //           sc: {
  //             $sum: '$totalValue',
  //           },

  //           qtyCases: {
  //             $sum: '$totalCases',
  //           },
  //         },
  //       },
  //     ]),

  //     /* ========================================
  //      * TOTAL VISITS
  //      * ======================================== */
  //     this.shopVisitModel.countDocuments({
  //       employeeId: { $in: employeeIds },
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //     }),

  //     /* ========================================
  //      * PRODUCTIVE CALLS
  //      * ======================================== */
  //     this.saleModal.distinct('customerId', {
  //       employeeId: { $in: employeeIds },
  //       date: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: SaleStatus.COMPLETED,
  //     }),
  //   ]);

  //   const retailing = retailingUsers.length;
  //   const officeWork = officeUsers.length;
  //   const leave = leaveUsers.length;

  //   const absent = Math.max(totalUsers - retailing - officeWork - leave, 0);

  //   const covered = productiveCustomers.length;

  //   const productivity =
  //     visitedCount > 0
  //       ? Number(((covered / visitedCount) * 100).toFixed(0))
  //       : 0;

  //   const salesSummary = sales[0] || {
  //     pc: 0,
  //     tc: 0,
  //     sc: 0,
  //     qtyCases: 0,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager stats fetched successfully',
  //     data: {
  //       userSummary: {
  //         retailing,
  //         officeWork,
  //         leave,
  //         absent,
  //         total: totalUsers,
  //       },

  //       callSummary: {
  //         productivity,
  //         covered,
  //         pc: salesSummary.pc,
  //         tc: salesSummary.tc,
  //         sc: salesSummary.sc,
  //         qtyCases: Number(
  //           salesSummary.qtyCases.toFixed?.(1) ?? salesSummary.qtyCases,
  //         ),
  //       },
  //     },
  //   };
  // }

  // async getManagerStats(query: {
  //   date?: string;
  //   startDate?: string;
  //   endDate?: string;
  // }) {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   const selectedDate = query?.date
  //     ? parseCalendarDate(query.date)
  //     : new Date();
  //   const startOfDay = query?.startDate
  //     ? parseCalendarDate(query.startDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  //   startOfDay.setHours(0, 0, 0, 0);

  //   const endOfDay = query?.endDate
  //     ? parseCalendarDate(query.endDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date();
  //   endOfDay.setHours(23, 59, 59, 999);

  //   /* =====================================================
  //    * TEAM MEMBERS
  //    * ===================================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   const totalUsers = employeeIds.length;

  //   if (!totalUsers) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager stats fetched successfully',
  //       data: {
  //         userSummary: {
  //           retailing: 0,
  //           officeWork: 0,
  //           leave: 0,
  //           absent: 0,
  //           total: 0,
  //         },
  //         callSummary: {
  //           productivity: 0,
  //           covered: 0,
  //           pc: 0,
  //           tc: 0,
  //           sc: 0,
  //           qtyCases: 0,
  //           qtyTonnage: 0,
  //           qtyValue: 0,
  //         },
  //       },
  //     };
  //   }

  //   const vans = await this.vanModel.find(
  //     {
  //       associatedUsers: {
  //         $in: employeeIds,
  //       },
  //       status: VanStatus.ACTIVE,
  //     },
  //     {
  //       associatedRoutes: 1,
  //     },
  //   );

  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || [])
  //           .filter((route) => {
  //             const fromDate = route.fromDate ? new Date(route.fromDate) : null;
  //             const toDate = route.toDate ? new Date(route.toDate) : null;

  //             return (
  //               route.routeId &&
  //               (!fromDate || fromDate <= endOfDay) &&
  //               (!toDate || toDate >= startOfDay)
  //             );
  //           })
  //           .map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   const assignedCustomerIds = routeIds.length
  //     ? await this.routeCustomerMappingModel.distinct('customerId', {
  //         routeId: {
  //           $in: routeIds,
  //         },
  //         status: RouteCustomerMappingStatus.ACTIVE,
  //         effectiveFrom: {
  //           $lte: endOfDay,
  //         },
  //         $or: [
  //           { effectiveTo: null },
  //           { effectiveTo: { $exists: false } },
  //           { effectiveTo: { $gte: startOfDay } },
  //         ],
  //       })
  //     : [];

  //   const totalAssignedOutlets = assignedCustomerIds.length;

  //   const [
  //     retailingUsers,
  //     officeUsers,
  //     leaveUsers,
  //     sales,
  //     tc,
  //     visitedOutletIds,
  //     productiveCalls,
  //   ] = await Promise.all([
  //     /* ========================================
  //      * RETAILING USERS
  //      * ======================================== */
  //     this.activityModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: {
  //         $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
  //       },
  //       name: 'Retailing',
  //       startTime: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * OFFICE WORK USERS
  //      * ======================================== */
  //     this.activityModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: {
  //         $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
  //       },
  //       name: { $in: ['Official Work', 'Office Work', 'Meetings'] },
  //       startTime: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * LEAVE USERS
  //      * ======================================== */
  //     this.leaveModel.distinct('userId', {
  //       userId: { $in: employeeIds },
  //       status: LeaveStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /* ========================================
  //      * SALES SUMMARY
  //      * ======================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: { $in: employeeIds },
  //           date: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: SaleStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           // Sales Value
  //           sc: {
  //             $sum: '$totalValue',
  //           },

  //           totalOrders: {
  //             $sum: 1,
  //           },

  //           // Qty Cases
  //           qtyCases: {
  //             $sum: '$netCases',
  //           },

  //           // Qty Tonnage
  //           qtyTonnage: {
  //             $sum: '$totalWeight',
  //           },
  //         },
  //       },
  //     ]),

  //     /* ========================================
  //      * TOTAL CALLS (TC)
  //      * ======================================== */
  //     this.shopVisitModel.countDocuments({
  //       employeeId: { $in: employeeIds },
  //       checkInTime: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //     }),

  //     /* ========================================
  //      * VISITED OUTLETS (UTC)
  //      * ======================================== */
  //     this.shopVisitModel.distinct('outletId', {
  //       employeeId: { $in: employeeIds },
  //       checkInTime: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //     }),

  //     /* ========================================
  //      * PRODUCTIVE CALLS (PC)
  //      * ======================================== */
  //     this.saleModal.countDocuments({
  //       employeeId: { $in: employeeIds },
  //       date: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //       status: SaleStatus.COMPLETED,
  //     }),
  //   ]);

  //   /* =====================================================
  //    * USER SUMMARY
  //    * ===================================================== */

  //   const retailing = retailingUsers.length;
  //   const officeWork = officeUsers.length;
  //   const leave = leaveUsers.length;

  //   const activeUsers = new Set([...retailingUsers, ...officeUsers]);

  //   const absent = Math.max(totalUsers - activeUsers.size - leave, 0);

  //   /* =====================================================
  //    * CALL SUMMARY
  //    * ===================================================== */

  //   // Productive Calls
  //   const pc = productiveCalls;

  //   // Covered % = distinct visited outlets / distinct total outlets.
  //   const covered =
  //     totalAssignedOutlets > 0
  //       ? Number(
  //           ((visitedOutletIds.length / totalAssignedOutlets) * 100).toFixed(0),
  //         )
  //       : 0;

  //   // Productivity %
  //   const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(0)) : 0;

  //   const salesSummary = sales[0] || {
  //     sc: 0,
  //     totalOrders: 0,
  //     qtyCases: 0,
  //     qtyTonnage: 0,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager stats fetched successfully',
  //     data: {
  //       userSummary: {
  //         retailing,
  //         officeWork,
  //         leave,
  //         absent,
  //         total: totalUsers,
  //       },

  //       callSummary: {
  //         productivity,
  //         covered,

  //         // Productive Calls
  //         pc,

  //         // Total Calls
  //         tc,

  //         // Sales Coverage %
  //         sc: covered,
  //         qtyValue: salesSummary.sc,

  //         // Total Cases Sold
  //         qtyCases: Number(
  //           salesSummary.qtyCases?.toFixed?.(1) ?? salesSummary.qtyCases ?? 0,
  //         ),

  //         // Total Tonnage Sold
  //         qtyTonnage: Number(
  //           salesSummary.qtyTonnage?.toFixed?.(2) ??
  //             salesSummary.qtyTonnage ??
  //             0,
  //         ),
  //       },
  //     },
  //   };
  // }

  // async getManagerStats(query: {
  //   date?: string;
  //   startDate?: string;
  //   endDate?: string;
  // }) {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   if (!managerId) {
  //     throw new NotFoundException(EMPLOYEE.NOT_FOUND);
  //   }

  //   const selectedDate = query?.date
  //     ? parseCalendarDate(query.date)
  //     : new Date();

  //   const startOfDay = query?.startDate
  //     ? parseCalendarDate(query.startDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  //   startOfDay.setHours(0, 0, 0, 0);

  //   const endOfDay = query?.endDate
  //     ? parseCalendarDate(query.endDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date();

  //   endOfDay.setHours(23, 59, 59, 999);

  //   /**
  //    * =====================================================
  //    * TEAM MEMBERS
  //    * =====================================================
  //    */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees
  //     .map((employee) => employee.employeeId)
  //     .filter(Boolean);

  //   const totalUsers = employeeIds.length;

  //   const emptyResponse = {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager stats fetched successfully',
  //     data: {
  //       userSummary: {
  //         retailing: 0,
  //         officeWork: 0,
  //         leave: 0,
  //         absent: 0,
  //         total: 0,
  //       },
  //       callSummary: {
  //         productivity: 0,
  //         covered: 0,
  //         pc: 0,
  //         tc: 0,
  //         sc: 0,
  //         qtyCases: 0,
  //         qtyTonnage: 0,
  //         qtyValue: 0,
  //       },
  //     },
  //   };

  //   if (!totalUsers) {
  //     return emptyResponse;
  //   }

  //   /**
  //    * =====================================================
  //    * ROUTES AND ASSIGNED OUTLETS
  //    * =====================================================
  //    */
  //   const vans = await this.vanModel
  //     .find(
  //       {
  //         associatedUsers: {
  //           $in: employeeIds,
  //         },
  //         status: VanStatus.ACTIVE,
  //       },
  //       {
  //         associatedRoutes: 1,
  //       },
  //     )
  //     .lean();

  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || [])
  //           .filter((route) => {
  //             const fromDate = route.fromDate ? new Date(route.fromDate) : null;
  //             const toDate = route.toDate ? new Date(route.toDate) : null;

  //             return (
  //               route.routeId &&
  //               (!fromDate || fromDate <= endOfDay) &&
  //               (!toDate || toDate >= startOfDay)
  //             );
  //           })
  //           .map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   const assignedCustomerIds = routeIds.length
  //     ? await this.routeCustomerMappingModel.distinct('customerId', {
  //         routeId: {
  //           $in: routeIds,
  //         },
  //         status: RouteCustomerMappingStatus.ACTIVE,
  //         effectiveFrom: {
  //           $lte: endOfDay,
  //         },
  //         $or: [
  //           { effectiveTo: null },
  //           { effectiveTo: { $exists: false } },
  //           { effectiveTo: { $gte: startOfDay } },
  //         ],
  //       })
  //     : [];

  //   const totalAssignedOutlets = assignedCustomerIds.length;

  //   /**
  //    * =====================================================
  //    * AGGREGATIONS
  //    * =====================================================
  //    */
  //   const [
  //     activityUsersSummary,
  //     leaveUsers,
  //     salesSummaryResult,
  //     visitSummaryResult,
  //   ] = await Promise.all([
  //     /**
  //      * Retailing + Office Work users in one query
  //      */
  //     this.activityModel.aggregate([
  //       {
  //         $match: {
  //           userId: {
  //             $in: employeeIds,
  //           },
  //           status: {
  //             $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
  //           },
  //           startTime: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           retailingUsers: {
  //             $addToSet: {
  //               $cond: [
  //                 {
  //                   $eq: ['$name', 'Retailing'],
  //                 },
  //                 '$userId',
  //                 '$$REMOVE',
  //               ],
  //             },
  //           },
  //           officeUsers: {
  //             $addToSet: {
  //               $cond: [
  //                 {
  //                   $in: [
  //                     '$name',
  //                     ['Official Work', 'Office Work', 'Meetings'],
  //                   ],
  //                 },
  //                 '$userId',
  //                 '$$REMOVE',
  //               ],
  //             },
  //           },
  //         },
  //       },
  //     ]),

  //     /**
  //      * Leave users
  //      */
  //     this.leaveModel.distinct('userId', {
  //       userId: {
  //         $in: employeeIds,
  //       },
  //       status: LeaveStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /**
  //      * Sales summary
  //      *
  //      * IMPORTANT:
  //      * Sale schema has employees array:
  //      * employees.employeeId
  //      *
  //      * Do not use employeeId directly here.
  //      */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           'employees.employeeId': {
  //             $in: employeeIds,
  //           },
  //           date: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: SaleStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           // Productive Calls
  //           pc: {
  //             $sum: 1,
  //           },

  //           // Sales Value
  //           qtyValue: {
  //             $sum: {
  //               $ifNull: ['$totalValue', 0],
  //             },
  //           },

  //           // Qty Cases
  //           qtyCases: {
  //             $sum: {
  //               $ifNull: ['$netCases', 0],
  //             },
  //           },

  //           // Qty Tonnage
  //           // totalWeight is KG, so convert KG to tonnage
  //           qtyTonnage: {
  //             $sum: {
  //               $divide: [
  //                 {
  //                   $ifNull: ['$totalWeight', 0],
  //                 },
  //                 1000,
  //               ],
  //             },
  //           },
  //         },
  //       },
  //     ]),

  //     /**
  //      * TC + UTC in one query
  //      */
  //     this.shopVisitModel.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           checkInTime: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: ShopVisitStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           tc: {
  //             $sum: 1,
  //           },
  //           visitedOutletIds: {
  //             $addToSet: '$outletId',
  //           },
  //         },
  //       },
  //     ]),
  //   ]);

  //   /**
  //    * =====================================================
  //    * USER SUMMARY
  //    * =====================================================
  //    */
  //   const activitySummary = activityUsersSummary[0] || {
  //     retailingUsers: [],
  //     officeUsers: [],
  //   };

  //   const retailingUserSet = new Set<string>(
  //     activitySummary.retailingUsers || [],
  //   );
  //   const officeUserSet = new Set<string>(activitySummary.officeUsers || []);
  //   const leaveUserSet = new Set<string>(leaveUsers || []);

  //   /**
  //    * Priority:
  //    * 1. Retailing
  //    * 2. Office Work
  //    * 3. Leave
  //    * 4. Absent
  //    *
  //    * This prevents same user from being counted twice.
  //    */
  //   const retailing = retailingUserSet.size;

  //   const officeWork = [...officeUserSet].filter(
  //     (userId) => !retailingUserSet.has(userId),
  //   ).length;

  //   const leave = [...leaveUserSet].filter(
  //     (userId) => !retailingUserSet.has(userId) && !officeUserSet.has(userId),
  //   ).length;

  //   const activeOrLeaveUsers = new Set<string>([
  //     ...retailingUserSet,
  //     ...officeUserSet,
  //     ...leaveUserSet,
  //   ]);

  //   const absent = Math.max(totalUsers - activeOrLeaveUsers.size, 0);

  //   /**
  //    * =====================================================
  //    * CALL SUMMARY
  //    * =====================================================
  //    */
  //   const salesSummary = salesSummaryResult[0] || {
  //     pc: 0,
  //     qtyValue: 0,
  //     qtyCases: 0,
  //     qtyTonnage: 0,
  //   };

  //   const visitSummary = visitSummaryResult[0] || {
  //     tc: 0,
  //     visitedOutletIds: [],
  //   };

  //   const pc = Number(salesSummary.pc || 0);
  //   const tc = Number(visitSummary.tc || 0);
  //   const visitedOutletCount = visitSummary.visitedOutletIds?.length || 0;

  //   const covered =
  //     totalAssignedOutlets > 0
  //       ? Number(((visitedOutletCount / totalAssignedOutlets) * 100).toFixed(0))
  //       : 0;

  //   const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(0)) : 0;

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager stats fetched successfully',
  //     data: {
  //       userSummary: {
  //         retailing,
  //         officeWork,
  //         leave,
  //         absent,
  //         total: totalUsers,
  //       },

  //       callSummary: {
  //         productivity,
  //         covered,

  //         // Productive Calls
  //         pc,

  //         // Total Calls
  //         tc,

  //         // Sales Coverage %
  //         sc: covered,

  //         // Sales Value
  //         qtyValue: Number((salesSummary.qtyValue || 0).toFixed(2)),

  //         // Total Cases Sold
  //         qtyCases: Number((salesSummary.qtyCases || 0).toFixed(1)),

  //         // Total Tonnage Sold
  //         // Already converted from KG to tonnage in aggregation
  //         qtyTonnage: Number((salesSummary.qtyTonnage || 0).toFixed(3)),
  //       },
  //     },
  //   };
  // }

  // async getManagerStats(query: {
  //   date?: string;
  //   startDate?: string;
  //   endDate?: string;
  // }) {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   if (!managerId) {
  //     throw new NotFoundException(EMPLOYEE.NOT_FOUND);
  //   }

  //   const selectedDate = query?.date
  //     ? parseCalendarDate(query.date)
  //     : new Date();

  //   const startOfDay = query?.startDate
  //     ? parseCalendarDate(query.startDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

  //   startOfDay.setHours(0, 0, 0, 0);

  //   const endOfDay = query?.endDate
  //     ? parseCalendarDate(query.endDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date();

  //   endOfDay.setHours(23, 59, 59, 999);

  //   /**
  //    * =====================================================
  //    * TEAM MEMBERS
  //    * =====================================================
  //    */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees
  //     .map((employee) => employee.employeeId)
  //     .filter(Boolean);

  //   const totalUsers = employeeIds.length;

  //   if (!totalUsers) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager stats fetched successfully',
  //       data: {
  //         userSummary: {
  //           retailing: 0,
  //           officeWork: 0,
  //           leave: 0,
  //           absent: 0,
  //           total: 0,
  //         },
  //         callSummary: {
  //           productivity: 0,
  //           covered: 0,
  //           pc: 0,
  //           tc: 0,
  //           sc: 0,
  //           qtyCases: 0,
  //           qtyTonnage: 0,
  //           qtyValue: 0,
  //         },
  //       },
  //     };
  //   }

  //   /**
  //    * =====================================================
  //    * ASSOCIATED VANS → ROUTES → DISTINCT ASSIGNED OUTLETS
  //    * =====================================================
  //    *
  //    * SC formula:
  //    * SC = distinct count of outlets assigned to all active routes/beats
  //    *      of vans associated with manager's team employees.
  //    */
  //   const vans = await this.vanModel
  //     .find(
  //       {
  //         associatedUsers: {
  //           $in: employeeIds,
  //         },
  //         status: VanStatus.ACTIVE,
  //       },
  //       {
  //         vanId: 1,
  //         associatedUsers: 1,
  //         associatedRoutes: 1,
  //         _id: 0,
  //       },
  //     )
  //     .lean();

  //   /**
  //    * Get all routeIds assigned to associated vans.
  //    * Only include routes active in selected date range.
  //    */
  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || [])
  //           .filter((route) => {
  //             const fromDate = route.fromDate ? new Date(route.fromDate) : null;
  //             const toDate = route.toDate ? new Date(route.toDate) : null;

  //             return (
  //               route.routeId &&
  //               (!fromDate || fromDate <= endOfDay) &&
  //               (!toDate || toDate >= startOfDay)
  //             );
  //           })
  //           .map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   /**
  //    * Get distinct outlets/customers assigned to those routes.
  //    */
  //   const assignedCustomerIds = routeIds.length
  //     ? await this.routeCustomerMappingModel.distinct('customerId', {
  //         routeId: {
  //           $in: routeIds,
  //         },
  //         status: RouteCustomerMappingStatus.ACTIVE,
  //         effectiveFrom: {
  //           $lte: endOfDay,
  //         },
  //         $or: [
  //           {
  //             effectiveTo: null,
  //           },
  //           {
  //             effectiveTo: {
  //               $exists: false,
  //             },
  //           },
  //           {
  //             effectiveTo: {
  //               $gte: startOfDay,
  //             },
  //           },
  //         ],
  //       })
  //     : [];

  //   /**
  //    * SC = distinct outlets in assigned routes/beats.
  //    */
  //   const sc = assignedCustomerIds.length;

  //   /**
  //    * =====================================================
  //    * AGGREGATIONS
  //    * =====================================================
  //    */
  //   const [
  //     activityUsersSummary,
  //     leaveUsers,
  //     salesSummaryResult,
  //     visitSummaryResult,
  //   ] = await Promise.all([
  //     /**
  //      * =====================================================
  //      * RETAILING + OFFICE WORK USERS
  //      * =====================================================
  //      */
  //     this.activityModel.aggregate([
  //       {
  //         $match: {
  //           userId: {
  //             $in: employeeIds,
  //           },
  //           status: {
  //             $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
  //           },
  //           startTime: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           retailingUsers: {
  //             $addToSet: {
  //               $cond: [
  //                 {
  //                   $eq: ['$name', 'Retailing'],
  //                 },
  //                 '$userId',
  //                 '$$REMOVE',
  //               ],
  //             },
  //           },

  //           officeUsers: {
  //             $addToSet: {
  //               $cond: [
  //                 {
  //                   $in: [
  //                     '$name',
  //                     ['Official Work', 'Office Work', 'Meetings'],
  //                   ],
  //                 },
  //                 '$userId',
  //                 '$$REMOVE',
  //               ],
  //             },
  //           },
  //         },
  //       },
  //     ]),

  //     /**
  //      * =====================================================
  //      * LEAVE USERS
  //      * =====================================================
  //      */
  //     this.leaveModel.distinct('userId', {
  //       userId: {
  //         $in: employeeIds,
  //       },
  //       status: LeaveStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startOfDay,
  //         $lte: endOfDay,
  //       },
  //     }),

  //     /**
  //      * =====================================================
  //      * SALES SUMMARY
  //      * =====================================================
  //      *
  //      * IMPORTANT:
  //      * Sale schema has employees array.
  //      * So use employees.employeeId, not employeeId.
  //      */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           'employees.employeeId': {
  //             $in: employeeIds,
  //           },
  //           date: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: SaleStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           /**
  //            * PC = Productive Calls
  //            */
  //           pc: {
  //             $sum: 1,
  //           },

  //           /**
  //            * Sales Value
  //            */
  //           qtyValue: {
  //             $sum: {
  //               $ifNull: ['$totalValue', 0],
  //             },
  //           },

  //           /**
  //            * Total Cases Sold
  //            */
  //           qtyCases: {
  //             $sum: {
  //               $ifNull: ['$netCases', 0],
  //             },
  //           },

  //           /**
  //            * Total Tonnage Sold
  //            *
  //            * totalWeight is stored in KG.
  //            * Convert KG to tonnage before calculation.
  //            */
  //           qtyTonnage: {
  //             $sum: {
  //               $divide: [
  //                 {
  //                   $ifNull: ['$totalWeight', 0],
  //                 },
  //                 1000,
  //               ],
  //             },
  //           },
  //         },
  //       },
  //     ]),

  //     /**
  //      * =====================================================
  //      * TC + VISITED OUTLETS
  //      * =====================================================
  //      *
  //      * TC = Total Calls
  //      * visitedOutletIds = distinct visited outlets
  //      */
  //     this.shopVisitModel.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           checkInTime: {
  //             $gte: startOfDay,
  //             $lte: endOfDay,
  //           },
  //           status: ShopVisitStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           tc: {
  //             $sum: 1,
  //           },

  //           visitedOutletIds: {
  //             $addToSet: '$outletId',
  //           },
  //         },
  //       },
  //     ]),
  //   ]);

  //   /**
  //    * =====================================================
  //    * USER SUMMARY
  //    * =====================================================
  //    */
  //   const activitySummary = activityUsersSummary[0] || {
  //     retailingUsers: [],
  //     officeUsers: [],
  //   };

  //   const retailingUserSet = new Set<string>(
  //     activitySummary.retailingUsers || [],
  //   );

  //   const officeUserSet = new Set<string>(activitySummary.officeUsers || []);

  //   const leaveUserSet = new Set<string>(leaveUsers || []);

  //   /**
  //    * Priority:
  //    * 1. Retailing
  //    * 2. Office Work
  //    * 3. Leave
  //    * 4. Absent
  //    *
  //    * This prevents same employee from being counted twice.
  //    */
  //   const retailing = retailingUserSet.size;

  //   const officeWork = [...officeUserSet].filter(
  //     (userId) => !retailingUserSet.has(userId),
  //   ).length;

  //   const leave = [...leaveUserSet].filter(
  //     (userId) => !retailingUserSet.has(userId) && !officeUserSet.has(userId),
  //   ).length;

  //   const activeOrLeaveUsers = new Set<string>([
  //     ...retailingUserSet,
  //     ...officeUserSet,
  //     ...leaveUserSet,
  //   ]);

  //   const absent = Math.max(totalUsers - activeOrLeaveUsers.size, 0);

  //   /**
  //    * =====================================================
  //    * CALL SUMMARY
  //    * =====================================================
  //    */
  //   const salesSummary = salesSummaryResult[0] || {
  //     pc: 0,
  //     qtyValue: 0,
  //     qtyCases: 0,
  //     qtyTonnage: 0,
  //   };

  //   const visitSummary = visitSummaryResult[0] || {
  //     tc: 0,
  //     visitedOutletIds: [],
  //   };

  //   /**
  //    * PC = Productive Calls
  //    */
  //   const pc = Number(salesSummary.pc || 0);

  //   /**
  //    * TC = Total Calls
  //    */
  //   const tc = Number(visitSummary.tc || 0);

  //   /**
  //    * Distinct visited outlets.
  //    */
  //   const visitedOutletCount = visitSummary.visitedOutletIds?.length || 0;

  //   /**
  //    * Covered % = distinct visited outlets / SC * 100
  //    */
  //   const covered =
  //     sc > 0 ? Number(((visitedOutletCount / sc) * 100).toFixed(0)) : 0;

  //   /**
  //    * Productivity % = PC / TC * 100
  //    */
  //   const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(0)) : 0;

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager stats fetched successfully',
  //     data: {
  //       userSummary: {
  //         retailing,
  //         officeWork,
  //         leave,
  //         absent,
  //         total: totalUsers,
  //       },

  //       callSummary: {
  //         /**
  //          * Productivity % = PC / TC * 100
  //          */
  //         productivity,

  //         /**
  //          * Covered % = distinct visited outlets / SC * 100
  //          */
  //         covered,

  //         /**
  //          * PC = Productive Calls
  //          */
  //         pc,

  //         /**
  //          * TC = Total Calls
  //          */
  //         tc,

  //         /**
  //          * SC = distinct outlets assigned to routes/beats
  //          * of vans associated with manager's team.
  //          */
  //         sc,

  //         /**
  //          * Sales Value
  //          */
  //         qtyValue: Number((salesSummary.qtyValue || 0).toFixed(2)),

  //         /**
  //          * Total Cases Sold
  //          */
  //         qtyCases: Number((salesSummary.qtyCases || 0).toFixed(1)),

  //         /**
  //          * Total Tonnage Sold
  //          *
  //          * Already converted from KG to tonnage in aggregation.
  //          */
  //         qtyTonnage: Number((salesSummary.qtyTonnage || 0).toFixed(3)),
  //       },
  //     },
  //   };
  // }

  async getManagerStats(query: {
    date?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const managerId = RequestContextStore.getStore()?.userId;

    if (!managerId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const selectedDate = query?.date
      ? parseCalendarDate(query.date)
      : new Date();

    const startOfDay = query?.startDate
      ? parseCalendarDate(query.startDate)
      : query?.date
        ? parseCalendarDate(query.date)
        : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);

    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = query?.endDate
      ? parseCalendarDate(query.endDate)
      : query?.date
        ? parseCalendarDate(query.date)
        : new Date();

    endOfDay.setHours(23, 59, 59, 999);

    const emptyData = {
      userSummary: {
        retailing: 0,
        officeWork: 0,
        leave: 0,
        absent: 0,
        total: 0,
      },
      callSummary: {
        productivity: 0,
        covered: 0,
        pc: 0,
        tc: 0,
        sc: 0,
        qtyCases: 0,
        qtyTonnage: 0,
        qtyValue: 0,
      },
    };

    /**
     * =====================================================
     * TEAM MEMBERS
     * =====================================================
     */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter(Boolean);

    const totalUsers = employeeIds.length;

    if (!totalUsers) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Manager stats fetched successfully',
        data: emptyData,
      };
    }

    /**
     * =====================================================
     * ASSOCIATED VANS → ROUTES → DISTINCT ASSIGNED OUTLETS
     * =====================================================
     */
    const vans = await this.vanModel
      .find(
        {
          associatedUsers: {
            $in: employeeIds,
          },
          status: VanStatus.ACTIVE,
        },
        {
          vanId: 1,
          associatedUsers: 1,
          associatedRoutes: 1,
          _id: 0,
        },
      )
      .lean();

    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || [])
            .filter((route) => {
              const fromDate = route.fromDate ? new Date(route.fromDate) : null;
              const toDate = route.toDate ? new Date(route.toDate) : null;

              return (
                route.routeId &&
                (!fromDate || fromDate <= endOfDay) &&
                (!toDate || toDate >= startOfDay)
              );
            })
            .map((route) => route.routeId)
            .filter(Boolean),
        ),
      ),
    ];

    const assignedCustomerIds = routeIds.length
      ? await this.routeCustomerMappingModel.distinct('customerId', {
          routeId: {
            $in: routeIds,
          },
          status: RouteCustomerMappingStatus.ACTIVE,
          effectiveFrom: {
            $lte: endOfDay,
          },
          $or: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                $exists: false,
              },
            },
            {
              effectiveTo: {
                $gte: startOfDay,
              },
            },
          ],
        })
      : [];

    /**
     * SC = distinct outlets assigned to routes/beats
     */
    const sc = assignedCustomerIds.length;

    /**
     * =====================================================
     * AGGREGATIONS
     * =====================================================
     */
    const [
      activityUsersSummary,
      leaveUsers,
      salesSummaryResult,
      visitSummaryResult,
    ] = await Promise.all([
      /**
       * Retailing + Office Work users
       *
       * Important:
       * Do not use $$REMOVE inside $addToSet.
       * Use null and filter null later.
       */
      this.activityModel.aggregate([
        {
          $match: {
            userId: {
              $in: employeeIds,
            },
            status: {
              $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
            },
            startTime: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
        },
        {
          $group: {
            _id: null,

            retailingUsers: {
              $addToSet: {
                $cond: [
                  {
                    $eq: ['$name', 'Retailing'],
                  },
                  '$userId',
                  null,
                ],
              },
            },

            officeUsers: {
              $addToSet: {
                $cond: [
                  {
                    $in: [
                      '$name',
                      ['Official Work', 'Office Work', 'Meetings'],
                    ],
                  },
                  '$userId',
                  null,
                ],
              },
            },
          },
        },
      ]),

      /**
       * Leave users
       */
      this.leaveModel.distinct('userId', {
        userId: {
          $in: employeeIds,
        },
        status: LeaveStatus.COMPLETED,
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      }),

      /**
       * Sales summary
       *
       * Sale schema has employees array.
       * Use employees.employeeId, not employeeId.
       */
      this.saleModal.aggregate([
        {
          $match: {
            'employees.employeeId': {
              $in: employeeIds,
            },
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: SaleStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,

            pc: {
              $sum: 1,
            },

            qtyValue: {
              $sum: {
                $ifNull: ['$totalValue', 0],
              },
            },

            qtyCases: {
              $sum: {
                $ifNull: ['$netCases', 0],
              },
            },

            /**
             * totalWeight is KG, convert to tonnage.
             */
            qtyTonnage: {
              $sum: {
                $divide: [
                  {
                    $ifNull: ['$totalWeight', 0],
                  },
                  1000,
                ],
              },
            },
          },
        },
      ]),

      /**
       * TC + distinct visited outlets
       */
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId: {
              $in: employeeIds,
            },
            checkInTime: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: ShopVisitStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,

            tc: {
              $sum: 1,
            },

            visitedOutletIds: {
              $addToSet: '$outletId',
            },
          },
        },
      ]),
    ]);

    /**
     * =====================================================
     * USER SUMMARY
     * =====================================================
     */
    const activitySummary = activityUsersSummary[0] || {
      retailingUsers: [],
      officeUsers: [],
    };

    const retailingUsers = (activitySummary.retailingUsers || []).filter(
      Boolean,
    );
    const officeUsers = (activitySummary.officeUsers || []).filter(Boolean);

    const retailingUserSet = new Set<string>(retailingUsers);
    const officeUserSet = new Set<string>(officeUsers);
    const leaveUserSet = new Set<string>((leaveUsers || []).filter(Boolean));

    /**
     * Priority:
     * 1. Retailing
     * 2. Office Work
     * 3. Leave
     * 4. Absent
     */
    const retailing = retailingUserSet.size;

    const officeWork = [...officeUserSet].filter(
      (userId) => !retailingUserSet.has(userId),
    ).length;

    const leave = [...leaveUserSet].filter(
      (userId) => !retailingUserSet.has(userId) && !officeUserSet.has(userId),
    ).length;

    const activeOrLeaveUsers = new Set<string>([
      ...retailingUserSet,
      ...officeUserSet,
      ...leaveUserSet,
    ]);

    const absent = Math.max(totalUsers - activeOrLeaveUsers.size, 0);

    /**
     * =====================================================
     * CALL SUMMARY
     * =====================================================
     */
    const salesSummary = salesSummaryResult[0] || {
      pc: 0,
      qtyValue: 0,
      qtyCases: 0,
      qtyTonnage: 0,
    };

    const visitSummary = visitSummaryResult[0] || {
      tc: 0,
      visitedOutletIds: [],
    };

    const pc = Number(salesSummary.pc || 0);
    const tc = Number(visitSummary.tc || 0);

    const visitedOutletIds = (visitSummary.visitedOutletIds || []).filter(
      Boolean,
    );
    const visitedOutletCount = visitedOutletIds.length;

    /**
     * Covered % = distinct visited outlets / SC * 100
     */
    const covered =
      sc > 0 ? Number(((visitedOutletCount / sc) * 100).toFixed(0)) : 0;

    /**
     * Productivity % = PC / TC * 100
     */
    const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(0)) : 0;

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager stats fetched successfully',
      data: {
        userSummary: {
          retailing,
          officeWork,
          leave,
          absent,
          total: totalUsers,
        },

        callSummary: {
          productivity,
          covered,
          pc,
          tc,

          /**
           * SC = distinct outlets assigned to routes/beats
           * of vans associated with manager's team.
           */
          sc,

          qtyValue: Number((salesSummary.qtyValue || 0).toFixed(2)),
          qtyCases: Number((salesSummary.qtyCases || 0).toFixed(1)),
          qtyTonnage: Number((salesSummary.qtyTonnage || 0).toFixed(3)),
        },
      },
    };
  }

  // async getEmployeeStats(employeeId: string) {
  //   // 📅 Get start & end of today
  //   const startOfDay = new Date();
  //   startOfDay.setHours(0, 0, 0, 0);

  //   const endOfDay = new Date();
  //   endOfDay.setHours(23, 59, 59, 999);

  //   const visitDateFilter = {
  //     checkInTime: {
  //       $gte: startOfDay,
  //       $lte: endOfDay,
  //     },
  //   };

  //   const saleDateFilter = {
  //     date: {
  //       $gte: startOfDay,
  //       $lte: endOfDay,
  //     },
  //   };

  //   const [visitData, salesData, collectionData] = await Promise.all([
  //     // 🏪 Shop Visits (Today)
  //     this.shopVisitModel.aggregate([
  //       {
  //         $match: {
  //           employeeId,
  //           ...visitDateFilter,
  //           status: ShopVisitStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalVisits: { $sum: 1 },
  //         },
  //       },
  //     ]),

  //     // 🧾 Sales Orders (Today)
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId,
  //           ...saleDateFilter,
  //           status: SaleStatus.COMPLETED,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalOrders: { $sum: 1 },
  //           totalOrderValue: { $sum: '$totalValue' },
  //           totalCases: { $sum: '$netCases' },
  //           totalWeight: { $sum: '$totalWeight' },
  //         },
  //       },
  //     ]),

  //     // 💰 Payment Collections (Today)
  //     this.paymentModel.aggregate([
  //       {
  //         $match: {
  //           employeeId,
  //           createdAt: { $gte: startOfDay, $lte: endOfDay },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalCollections: { $sum: 1 },
  //           totalCollectionValue: { $sum: '$amount' },
  //         },
  //       },
  //     ]),
  //   ]);

  //   return {
  //     statusCode: 200,
  //     message: 'Today employee stats fetched successfully',
  //     data: {
  //       visits: visitData[0]?.totalVisits || 0,
  //       tc: visitData[0]?.totalVisits || 0,
  //       pc: salesData[0]?.totalOrders || 0,

  //       orders: {
  //         count: salesData[0]?.totalOrders || 0,
  //         value: salesData[0]?.totalOrderValue || 0,
  //         cases: salesData[0]?.totalCases || 0,
  //         weight: salesData[0]?.totalWeight || 0,
  //       },

  //       collections: {
  //         count: collectionData[0]?.totalCollections || 0,
  //         value: collectionData[0]?.totalCollectionValue || 0,
  //       },
  //     },
  //   };
  // }

  async getEmployeeStats(employeeId: string) {
    // 📅 Get start & end of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const visitDateFilter = {
      checkInTime: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    const saleDateFilter = {
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    const [visitData, salesData, collectionData] = await Promise.all([
      // 🏪 Shop Visits Today
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId,
            ...visitDateFilter,
            status: ShopVisitStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: 1 },
          },
        },
      ]),

      // 🧾 Sales Orders Today
      this.saleModal.aggregate([
        {
          $match: {
            'employees.employeeId': employeeId,
            ...saleDateFilter,
            status: SaleStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalOrderValue: { $sum: { $ifNull: ['$totalValue', 0] } },
            totalCases: { $sum: { $ifNull: ['$netCases', 0] } },
            totalWeight: { $sum: { $ifNull: ['$totalWeight', 0] } },
            totalQty: { $sum: { $ifNull: ['$totalQty', 0] } },
            totalPieces: { $sum: { $ifNull: ['$totalPieces', 0] } },
            paidAmount: { $sum: { $ifNull: ['$paidAmount', 0] } },
            pendingAmount: { $sum: { $ifNull: ['$pendingAmount', 0] } },
          },
        },
      ]),

      // 💰 Payment Collections Today
      this.paymentModel.aggregate([
        {
          $match: {
            employeeId,
            createdAt: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalCollections: { $sum: 1 },
            totalCollectionValue: { $sum: { $ifNull: ['$amount', 0] } },
          },
        },
      ]),
    ]);

    const visits = visitData[0]?.totalVisits || 0;
    const totalOrders = salesData[0]?.totalOrders || 0;

    return {
      statusCode: 200,
      message: 'Today employee stats fetched successfully',
      data: {
        visits,

        // TC = Total Calls / Total completed visits
        tc: visits,

        // PC = Productive Calls / Visits where order created
        pc: totalOrders,

        orders: {
          count: totalOrders,
          value: salesData[0]?.totalOrderValue || 0,
          cases: salesData[0]?.totalCases || 0,
          weight: salesData[0]?.totalWeight || 0,
          qty: salesData[0]?.totalQty || 0,
          pieces: salesData[0]?.totalPieces || 0,
          paidAmount: salesData[0]?.paidAmount || 0,
          pendingAmount: salesData[0]?.pendingAmount || 0,
        },

        collections: {
          count: collectionData[0]?.totalCollections || 0,
          value: collectionData[0]?.totalCollectionValue || 0,
        },
      },
    };
  }

  // async getSalesmanPocketAndTarget(
  //   date?: string,
  //   metric: 'cases' | 'tonnage' | 'value' = 'cases',
  //   startDateParam?: string,
  //   endDateParam?: string,
  // ) {
  //   const employeeId = RequestContextStore.getStore()?.userId;

  //   if (!employeeId) {
  //     throw new NotFoundException(EMPLOYEE.NOT_FOUND);
  //   }

  //   const now = endDateParam
  //     ? parseCalendarDate(endDateParam)
  //     : date
  //       ? parseCalendarDate(date)
  //       : new Date();
  //   const hasDateRange = Boolean(startDateParam || endDateParam);

  //   const startDate = startDateParam
  //     ? parseCalendarDate(startDateParam)
  //     : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  //   startDate.setHours(0, 0, 0, 0);

  //   const endDate = hasDateRange
  //     ? parseCalendarDate(endDateParam || startDateParam!)
  //     : now;
  //   endDate.setHours(23, 59, 59, 999);
  //   const todayEnd = new Date();
  //   todayEnd.setHours(23, 59, 59, 999);
  //   if (endDate > todayEnd) {
  //     endDate.setTime(todayEnd.getTime());
  //   }

  //   const monthEndDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth() + 1,
  //     0,
  //     23,
  //     59,
  //     59,
  //     999,
  //   );

  //   const lmtdDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth() - 1,
  //     Math.min(
  //       now.getDate(),
  //       new Date(now.getFullYear(), now.getMonth(), 0).getDate(),
  //     ),
  //     now.getHours(),
  //     now.getMinutes(),
  //     now.getSeconds(),
  //     now.getMilliseconds(),
  //   );

  //   const lmtdStartDate = new Date(
  //     lmtdDate.getFullYear(),
  //     lmtdDate.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const normalizedMetric = ['cases', 'tonnage', 'value'].includes(metric)
  //     ? metric
  //     : 'cases';

  //   const [
  //     targets,
  //     salesSummary,
  //     lmtdTargets,
  //     lmtdSalesSummary,
  //     totalVisits,
  //     uniqueVisitedOutlets,
  //     retailingDays,
  //     vanStockSummary,
  //   ] = await Promise.all([
  //     this.targetModel.aggregate([
  //       {
  //         $match: {
  //           userId: employeeId,
  //           startDate: { $lte: endDate },
  //           endDate: { $gte: startDate },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           targetCases: { $sum: '$targetCases' },
  //           targetTonnage: { $sum: '$targetTonnage' },
  //           targetValue: { $sum: '$targetValue' },
  //         },
  //       },
  //     ]),

  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           'employees.employeeId': employeeId,
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalOrders: { $sum: 1 },
  //           totalCases: { $sum: '$netCases' },
  //           totalTonnage: { $sum: '$totalWeight' },
  //           totalValue: { $sum: '$totalValue' },
  //           saleIds: { $addToSet: '$saleId' },
  //           uniqueBilledOutlets: { $addToSet: '$customerId' },
  //         },
  //       },
  //     ]),

  //     this.targetModel.aggregate([
  //       {
  //         $match: {
  //           userId: employeeId,
  //           startDate: { $lte: lmtdDate },
  //           endDate: { $gte: lmtdStartDate },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           targetCases: { $sum: '$targetCases' },
  //           targetTonnage: { $sum: '$targetTonnage' },
  //           targetValue: { $sum: '$targetValue' },
  //         },
  //       },
  //     ]),

  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           'employees.employeeId': employeeId,
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: lmtdStartDate,
  //             $lte: lmtdDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           totalCases: { $sum: '$netCases' },
  //           totalTonnage: { $sum: '$totalWeight' },
  //           totalValue: { $sum: '$totalValue' },
  //         },
  //       },
  //     ]),

  //     this.shopVisitModel.countDocuments({
  //       employeeId,
  //       status: ShopVisitStatus.COMPLETED,
  //       checkInTime: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     this.shopVisitModel.distinct('outletId', {
  //       employeeId,
  //       status: ShopVisitStatus.COMPLETED,
  //       checkInTime: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     this.activityModel.aggregate([
  //       {
  //         $match: {
  //           userId: employeeId,
  //           name: 'Retailing',
  //           status: {
  //             $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
  //           },
  //           startTime: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$startTime',
  //               timezone: REPORT_TIMEZONE,
  //             },
  //           },
  //         },
  //       },
  //       {
  //         $count: 'days',
  //       },
  //     ]),

  //     this.vanDailyStockModel.aggregate([
  //       {
  //         $match: {
  //           employeeId,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $addFields: {
  //           unitQty: {
  //             $cond: [{ $gt: ['$unitQtyInCase', 0] }, '$unitQtyInCase', 1],
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           openingCases: { $sum: { $divide: ['$openingQty', '$unitQty'] } },
  //           topupCases: { $sum: { $divide: ['$inQty', '$unitQty'] } },
  //           salesCases: { $sum: { $divide: ['$outQty', '$unitQty'] } },
  //         },
  //       },
  //     ]),
  //   ]);

  //   const targetSummary = targets[0] || {
  //     targetCases: 0,
  //     targetTonnage: 0,
  //     targetValue: 0,
  //   };

  //   const sales = salesSummary[0] || {
  //     totalOrders: 0,
  //     totalCases: 0,
  //     totalTonnage: 0,
  //     totalValue: 0,
  //     saleIds: [],
  //     uniqueBilledOutlets: [],
  //   };
  //   const stock = vanStockSummary[0] || {
  //     openingCases: 0,
  //     topupCases: 0,
  //     salesCases: 0,
  //   };
  //   const openingStockCases = Number(stock.openingCases || 0);
  //   const topupStockCases = Number(stock.topupCases || 0);
  //   const totalStockCases = openingStockCases + topupStockCases;
  //   const stockSalesCases = Number(stock.salesCases || 0);
  //   const utilizationPercentage =
  //     totalStockCases > 0
  //       ? Number(((stockSalesCases / totalStockCases) * 100).toFixed(2))
  //       : 0;

  //   const lmtdTargetSummary = lmtdTargets[0] || {
  //     targetCases: 0,
  //     targetTonnage: 0,
  //     targetValue: 0,
  //   };

  //   const lmtdSales = lmtdSalesSummary[0] || {
  //     totalCases: 0,
  //     totalTonnage: 0,
  //     totalValue: 0,
  //   };

  //   const totalLinesSold = sales.saleIds.length
  //     ? await this.saleItemModel.countDocuments({
  //         saleId: {
  //           $in: sales.saleIds,
  //         },
  //       })
  //     : 0;
  //   const openActivityEnd =
  //     endDate.getTime() > Date.now() ? new Date() : endDate;

  //   const [
  //     activityDaySummary,
  //     visitDaySummary,
  //     salesDaySummary,
  //     leaveDaySummary,
  //     workSessionDaySummary,
  //   ] = await Promise.all([
  //     this.activityModel.aggregate([
  //       {
  //         $match: {
  //           userId: employeeId,
  //           status: {
  //             $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
  //           },
  //           startTime: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$startTime',
  //               timezone: REPORT_TIMEZONE,
  //             },
  //           },
  //           retailing: {
  //             $sum: {
  //               $cond: [{ $eq: ['$name', 'Retailing'] }, 1, 0],
  //             },
  //           },
  //           officialWork: {
  //             $sum: {
  //               $cond: [{ $ne: ['$name', 'Retailing'] }, 1, 0],
  //             },
  //           },
  //           totalActivities: { $sum: 1 },
  //           retailingDurationMs: {
  //             $sum: {
  //               $cond: [
  //                 { $eq: ['$name', 'Retailing'] },
  //                 {
  //                   $subtract: [
  //                     { $ifNull: ['$endTime', openActivityEnd] },
  //                     '$startTime',
  //                   ],
  //                 },
  //                 0,
  //               ],
  //             },
  //           },
  //           totalDurationMs: {
  //             $sum: {
  //               $subtract: [
  //                 { $ifNull: ['$endTime', openActivityEnd] },
  //                 '$startTime',
  //               ],
  //             },
  //           },
  //         },
  //       },
  //     ]),
  //     this.shopVisitModel.aggregate([
  //       {
  //         $match: {
  //           employeeId,
  //           status: ShopVisitStatus.COMPLETED,
  //           checkInTime: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$checkInTime',
  //               timezone: REPORT_TIMEZONE,
  //             },
  //           },
  //           tc: { $sum: 1 },
  //           firstCallTime: { $min: '$checkInTime' },
  //         },
  //       },
  //     ]),
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           'employees.employeeId': employeeId,
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$date',
  //               timezone: REPORT_TIMEZONE,
  //             },
  //           },
  //           pc: { $sum: 1 },
  //           upc: { $addToSet: '$customerId' },
  //           cases: { $sum: '$netCases' },
  //           netValue: { $sum: '$totalValue' },
  //           firstPcTime: { $min: '$date' },
  //         },
  //       },
  //     ]),
  //     this.leaveModel.aggregate([
  //       {
  //         $match: {
  //           userId: employeeId,
  //           status: LeaveStatus.COMPLETED,
  //           createdAt: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$createdAt',
  //               timezone: REPORT_TIMEZONE,
  //             },
  //           },
  //           leave: { $sum: 1 },
  //         },
  //       },
  //     ]),
  //     this.workSessionModel.aggregate([
  //       {
  //         $addFields: {
  //           normalizedDayStartTime: {
  //             $convert: {
  //               input: '$dayStartTime',
  //               to: 'date',
  //               onError: '$createdAt',
  //               onNull: '$createdAt',
  //             },
  //           },
  //         },
  //       },
  //       {
  //         $match: {
  //           userId: employeeId,
  //           normalizedDayStartTime: { $gte: startDate, $lte: endDate },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$normalizedDayStartTime',
  //               timezone: REPORT_TIMEZONE,
  //             },
  //           },
  //           dayStarted: { $sum: 1 },
  //           dayCompleted: {
  //             $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
  //           },
  //           latestStatus: { $last: '$status' },
  //         },
  //       },
  //     ]),
  //   ]);

  //   const formatTime = (value?: Date | string | null) => {
  //     if (!value) return null;
  //     const parsedDate = new Date(value);
  //     if (Number.isNaN(parsedDate.getTime())) return null;

  //     return parsedDate.toLocaleTimeString('en-IN', {
  //       hour: '2-digit',
  //       minute: '2-digit',
  //       hour12: true,
  //     });
  //   };

  //   const formatAverageTime = (
  //     values: Array<Date | string | null | undefined>,
  //   ) => {
  //     const minutes = values
  //       .map((value) => {
  //         if (!value) return null;

  //         const parsedDate = new Date(value);
  //         if (Number.isNaN(parsedDate.getTime())) return null;

  //         return parsedDate.getHours() * 60 + parsedDate.getMinutes();
  //       })
  //       .filter((value): value is number => value !== null);

  //     if (!minutes.length) return null;

  //     const averageMinutes = Math.round(
  //       minutes.reduce((sum, value) => sum + value, 0) / minutes.length,
  //     );
  //     const averageDate = new Date();
  //     averageDate.setHours(
  //       Math.floor(averageMinutes / 60),
  //       averageMinutes % 60,
  //       0,
  //       0,
  //     );

  //     return formatTime(averageDate);
  //   };

  //   const formatDurationMinutes = (value: number) => {
  //     if (!Number.isFinite(value) || value < 1) return '< 1 min';

  //     const hours = Math.floor(value / 60);
  //     const minutes = value % 60;

  //     if (!hours) return `${minutes} min${minutes === 1 ? '' : 's'}`;
  //     if (!minutes) return `${hours} hr${hours === 1 ? '' : 's'}`;

  //     return `${hours} hr${hours === 1 ? '' : 's'} ${minutes} min${
  //       minutes === 1 ? '' : 's'
  //     }`;
  //   };

  //   const formatAverageDuration = (
  //     values: Array<number | null | undefined>,
  //   ) => {
  //     const minutes = values
  //       .map((value) => Math.max(Math.round(Number(value || 0) / 60000), 0))
  //       .filter((value) => value > 0);

  //     if (!minutes.length) return null;

  //     const averageMinutes = Math.round(
  //       minutes.reduce((sum, value) => sum + value, 0) / minutes.length,
  //     );

  //     return formatDurationMinutes(averageMinutes);
  //   };

  //   const formatDayLabel = (value: Date) =>
  //     value.toLocaleDateString('en-IN', {
  //       weekday: 'short',
  //       day: '2-digit',
  //       month: 'short',
  //       year: 'numeric',
  //     });

  //   const toMap = (rows: any[]) =>
  //     rows.reduce((map, row) => {
  //       map.set(row._id, row);
  //       return map;
  //     }, new Map<string, any>());

  //   const activityDayMap = toMap(activityDaySummary);
  //   const visitDayMap = toMap(visitDaySummary);
  //   const salesDayMap = toMap(salesDaySummary);
  //   const leaveDayMap = toMap(leaveDaySummary);
  //   const workSessionDayMap = toMap(workSessionDaySummary);
  //   const avgFirstCallTime = formatAverageTime(
  //     visitDaySummary.map((item) => item.firstCallTime),
  //   );
  //   const avgFirstPcTime = formatAverageTime(
  //     salesDaySummary.map((item) => item.firstPcTime),
  //   );
  //   const avgRetailingTime = formatAverageDuration(
  //     activityDaySummary.map((item) => item.retailingDurationMs),
  //   );
  //   const avgTotalTime = formatAverageDuration(
  //     activityDaySummary.map((item) => item.totalDurationMs),
  //   );
  //   const dayWiseSummary: any[] = [];
  //   const dayCursor = new Date(startDate);

  //   while (dayCursor <= endDate) {
  //     const dayKey = formatCalendarDate(dayCursor);
  //     const activity = activityDayMap.get(dayKey) || {};
  //     const visits = visitDayMap.get(dayKey) || {};
  //     const daySales = salesDayMap.get(dayKey) || {};
  //     const leave = leaveDayMap.get(dayKey) || {};
  //     const workSession = workSessionDayMap.get(dayKey) || {};
  //     const retailing = Number(activity.retailing || 0);
  //     const officialWork = Number(activity.officialWork || 0);
  //     const leaveCount = Number(leave.leave || 0);
  //     const totalActivities = Number(activity.totalActivities || 0);
  //     const tcCount = Number(visits.tc || 0);
  //     const pcCount = Number(daySales.pc || 0);
  //     const dayStarted = Number(workSession.dayStarted || 0) > 0;
  //     const hasWorkRecord =
  //       dayStarted || totalActivities > 0 || tcCount > 0 || pcCount > 0;
  //     const absent = leaveCount > 0 || hasWorkRecord ? 0 : 1;
  //     const dayStatus =
  //       leaveCount > 0
  //         ? 'Leave'
  //         : retailing > 0 || tcCount > 0 || pcCount > 0
  //           ? 'Retailing'
  //           : officialWork > 0
  //             ? 'Official Work'
  //             : dayStarted
  //               ? 'Official Work'
  //               : 'Absent';

  //     dayWiseSummary.push({
  //       date: dayKey,
  //       label: formatDayLabel(dayCursor),
  //       dayStatus,
  //       workSessionStatus: workSession.latestStatus ?? null,
  //       dayStarted,
  //       dayCompleted: Number(workSession.dayCompleted || 0) > 0,
  //       retailing,
  //       officialWork,
  //       leave: leaveCount,
  //       absent,
  //       totalActivities,
  //       retailingDuration: formatDurationMinutes(
  //         Math.max(
  //           Math.round(Number(activity.retailingDurationMs || 0) / 60000),
  //           0,
  //         ),
  //       ),
  //       totalDuration: formatDurationMinutes(
  //         Math.max(
  //           Math.round(Number(activity.totalDurationMs || 0) / 60000),
  //           0,
  //         ),
  //       ),
  //       tc: tcCount,
  //       pc: pcCount,
  //       upc: daySales.upc?.length || 0,
  //       netValue: Number((daySales.netValue || 0).toFixed(2)),
  //       cases: Number((daySales.cases || 0).toFixed(2)),
  //       firstCallTime: formatTime(visits.firstCallTime),
  //       firstPcTime: formatTime(daySales.firstPcTime),
  //     });

  //     dayCursor.setDate(dayCursor.getDate() + 1);
  //   }

  //   const pc = Number(sales.totalOrders || 0);
  //   const tc = Number(totalVisits || 0);
  //   const upc = sales.uniqueBilledOutlets?.length || 0;
  //   const utc = uniqueVisitedOutlets.length;
  //   const retailingDayCount = retailingDays?.[0]?.days || 0;
  //   const targetCases = Number(targetSummary.targetCases || 0);
  //   const achievedCases = Number(sales.totalCases || 0);
  //   const targetTonnage = Number(targetSummary.targetTonnage || 0);
  //   const achievedTonnage = Number(sales.totalTonnage || 0);
  //   const targetValue = Number(targetSummary.targetValue || 0);
  //   const achievedValue = Number(sales.totalValue || 0);
  //   const remainingCases = Math.max(targetCases - achievedCases, 0);
  //   const remainingTonnage = Math.max(targetTonnage - achievedTonnage, 0);
  //   const remainingValue = Math.max(targetValue - achievedValue, 0);
  //   const selectedTarget =
  //     normalizedMetric === 'tonnage'
  //       ? targetTonnage
  //       : normalizedMetric === 'value'
  //         ? targetValue
  //         : targetCases;
  //   const selectedAchieved =
  //     normalizedMetric === 'tonnage'
  //       ? achievedTonnage
  //       : normalizedMetric === 'value'
  //         ? achievedValue
  //         : achievedCases;
  //   const selectedRemaining = Math.max(selectedTarget - selectedAchieved, 0);
  //   const lmtdTarget =
  //     normalizedMetric === 'tonnage'
  //       ? Number(lmtdTargetSummary.targetTonnage || 0)
  //       : normalizedMetric === 'value'
  //         ? Number(lmtdTargetSummary.targetValue || 0)
  //         : Number(lmtdTargetSummary.targetCases || 0);
  //   const lmtdAchieved =
  //     normalizedMetric === 'tonnage'
  //       ? Number(lmtdSales.totalTonnage || 0)
  //       : normalizedMetric === 'value'
  //         ? Number(lmtdSales.totalValue || 0)
  //         : Number(lmtdSales.totalCases || 0);
  //   const elapsedDays =
  //     Math.floor(
  //       (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  //     ) + 1;
  //   const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);
  //   const achievementPercentage =
  //     targetCases > 0
  //       ? Number(((achievedCases / targetCases) * 100).toFixed(2))
  //       : 0;
  //   const selectedAchievementPercentage =
  //     selectedTarget > 0
  //       ? Number(((selectedAchieved / selectedTarget) * 100).toFixed(2))
  //       : 0;
  //   const lmtdAchievementPercentage =
  //     lmtdTarget > 0
  //       ? Number(((lmtdAchieved / lmtdTarget) * 100).toFixed(2))
  //       : 0;
  //   const improvement = Number(
  //     (selectedAchievementPercentage - lmtdAchievementPercentage).toFixed(2),
  //   );

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Salesman pocket and target fetched successfully',
  //     data: {
  //       startDate,
  //       endDate,
  //       retailingDays: retailingDayCount,
  //       avgRetailingTime,
  //       avgTotalTime,

  //       target: {
  //         metric: normalizedMetric,
  //         selected: {
  //           target: Number(selectedTarget.toFixed(2)),
  //           achieved: Number(selectedAchieved.toFixed(2)),
  //           remaining: Number(selectedRemaining.toFixed(2)),
  //           achievementPercentage: selectedAchievementPercentage,
  //           mtd: selectedAchievementPercentage,
  //           lmtd: lmtdAchievementPercentage,
  //           improvement,
  //           crr:
  //             elapsedDays > 0
  //               ? Number((selectedAchieved / elapsedDays).toFixed(2))
  //               : 0,
  //           rrr:
  //             remainingDays > 0
  //               ? Number((selectedRemaining / remainingDays).toFixed(2))
  //               : 0,
  //         },
  //         targetCases,
  //         achievedCases,
  //         remainingCases,
  //         targetTonnage,
  //         achievedTonnage,
  //         remainingTonnage,
  //         targetValue,
  //         achievedValue,
  //         remainingValue,
  //         achievementPercentage,
  //         crr:
  //           elapsedDays > 0
  //             ? Number((achievedCases / elapsedDays).toFixed(2))
  //             : 0,
  //         rrr:
  //           remainingDays > 0
  //             ? Number((remainingCases / remainingDays).toFixed(2))
  //             : 0,
  //       },

  //       pocket: {
  //         tc,
  //         avgTc:
  //           retailingDayCount > 0
  //             ? Number((tc / retailingDayCount).toFixed(2))
  //             : 0,
  //         pc,
  //         avgPc:
  //           retailingDayCount > 0
  //             ? Number((pc / retailingDayCount).toFixed(2))
  //             : 0,
  //         upc,
  //         utc,
  //         totalLinesSold,
  //         lpc: pc > 0 ? Number((totalLinesSold / pc).toFixed(2)) : 0,
  //         avgFirstCallTime,
  //         avgFirstPcTime,
  //       },
  //       vanUtilization: {
  //         openingStockCases: Number(openingStockCases.toFixed(2)),
  //         topupStockCases: Number(topupStockCases.toFixed(2)),
  //         totalStockCases: Number(totalStockCases.toFixed(2)),
  //         salesCases: Number(stockSalesCases.toFixed(2)),
  //         utilizationPercentage,
  //       },
  //       dayWiseSummary,
  //     },
  //   };
  // }

  async getSalesmanPocketAndTarget(
    date?: string,
    metric: 'cases' | 'tonnage' | 'value' = 'cases',
    startDateParam?: string,
    endDateParam?: string,
  ) {
    const employeeId = RequestContextStore.getStore()?.userId;

    if (!employeeId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = endDateParam
      ? parseCalendarDate(endDateParam)
      : date
        ? parseCalendarDate(date)
        : new Date();

    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? parseCalendarDate(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange
      ? parseCalendarDate(endDateParam || startDateParam!)
      : now;

    endDate.setHours(23, 59, 59, 999);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    if (endDate > todayEnd) {
      endDate.setTime(todayEnd.getTime());
    }

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const lmtdDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      Math.min(
        now.getDate(),
        new Date(now.getFullYear(), now.getMonth(), 0).getDate(),
      ),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
      now.getMilliseconds(),
    );

    const lmtdStartDate = new Date(
      lmtdDate.getFullYear(),
      lmtdDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const normalizedMetric = ['cases', 'tonnage', 'value'].includes(metric)
      ? metric
      : 'cases';

    const openActivityEnd =
      endDate.getTime() > Date.now() ? new Date() : endDate;

    /**
     * KG to tonnage expression.
     * totalWeight is stored in KG.
     */
    const kgToTonnageExpression = (field: string) => ({
      $divide: [{ $ifNull: [field, 0] }, 1000],
    });

    const [
      targets,
      salesAggregate,
      lmtdTargets,
      lmtdSalesSummary,
      totalVisits,
      uniqueVisitedOutlets,
      retailingDays,
      vanStockSummary,
      totalLinesSoldAggregate,
      activityDaySummary,
      visitDaySummary,
      leaveDaySummary,
      workSessionDaySummary,
    ] = await Promise.all([
      /**
       * ================= CURRENT TARGET =================
       */
      this.targetModel.aggregate([
        {
          $match: {
            userId: employeeId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        },
        {
          $group: {
            _id: null,
            targetCases: { $sum: '$targetCases' },
            targetTonnage: { $sum: '$targetTonnage' },
            targetValue: { $sum: '$targetValue' },
          },
        },
      ]),

      /**
       * ================= CURRENT SALES SUMMARY + DAY SUMMARY =================
       *
       * Optimized:
       * Earlier you were querying sales twice:
       * 1. salesSummary
       * 2. salesDaySummary
       *
       * Now both come from one aggregation using $facet.
       */
      this.saleModal.aggregate([
        {
          $match: {
            'employees.employeeId': employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $facet: {
            summary: [
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  totalCases: { $sum: '$netCases' },

                  /**
                   * Convert KG to tonnage before summing.
                   */
                  totalTonnage: {
                    $sum: kgToTonnageExpression('$totalWeight'),
                  },

                  totalValue: { $sum: '$totalValue' },
                  saleIds: { $addToSet: '$saleId' },
                  uniqueBilledOutlets: { $addToSet: '$customerId' },
                },
              },
            ],

            dayWise: [
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%d',
                      date: '$date',
                      timezone: REPORT_TIMEZONE,
                    },
                  },
                  pc: { $sum: 1 },
                  upc: { $addToSet: '$customerId' },
                  cases: { $sum: '$netCases' },

                  /**
                   * Day-wise tonnage after KG conversion.
                   */
                  tonnage: {
                    $sum: kgToTonnageExpression('$totalWeight'),
                  },

                  netValue: { $sum: '$totalValue' },
                  firstPcTime: { $min: '$date' },
                },
              },
            ],
          },
        },
      ]),

      /**
       * ================= LMTD TARGET =================
       */
      this.targetModel.aggregate([
        {
          $match: {
            userId: employeeId,
            startDate: { $lte: lmtdDate },
            endDate: { $gte: lmtdStartDate },
          },
        },
        {
          $group: {
            _id: null,
            targetCases: { $sum: '$targetCases' },
            targetTonnage: { $sum: '$targetTonnage' },
            targetValue: { $sum: '$targetValue' },
          },
        },
      ]),

      /**
       * ================= LMTD SALES =================
       */
      this.saleModal.aggregate([
        {
          $match: {
            'employees.employeeId': employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: lmtdStartDate,
              $lte: lmtdDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalCases: { $sum: '$netCases' },

            /**
             * Convert KG to tonnage before summing.
             */
            totalTonnage: {
              $sum: kgToTonnageExpression('$totalWeight'),
            },

            totalValue: { $sum: '$totalValue' },
          },
        },
      ]),

      /**
       * ================= TOTAL VISITS =================
       */
      this.shopVisitModel.countDocuments({
        employeeId,
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /**
       * ================= UNIQUE VISITED OUTLETS =================
       */
      this.shopVisitModel.distinct('outletId', {
        employeeId,
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),

      /**
       * ================= RETAILING DAYS =================
       */
      this.activityModel.aggregate([
        {
          $match: {
            userId: employeeId,
            name: 'Retailing',
            status: {
              $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
            },
            startTime: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$startTime',
                timezone: REPORT_TIMEZONE,
              },
            },
          },
        },
        {
          $count: 'days',
        },
      ]),

      /**
       * ================= VAN STOCK SUMMARY =================
       */
      this.vanDailyStockModel.aggregate([
        {
          $match: {
            employeeId,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $addFields: {
            unitQty: {
              $cond: [{ $gt: ['$unitQtyInCase', 0] }, '$unitQtyInCase', 1],
            },
          },
        },
        {
          $group: {
            _id: null,
            openingCases: { $sum: { $divide: ['$openingQty', '$unitQty'] } },
            topupCases: { $sum: { $divide: ['$inQty', '$unitQty'] } },
            salesCases: { $sum: { $divide: ['$outQty', '$unitQty'] } },
          },
        },
      ]),

      /**
       * ================= TOTAL LINES SOLD =================
       *
       * Optimized:
       * Instead of first collecting saleIds and then querying after Promise.all,
       * we calculate count directly using sales + sale_items lookup.
       */
      this.saleModal.aggregate([
        {
          $match: {
            'employees.employeeId': employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $lookup: {
            from: 'sale_items',
            let: {
              saleId: '$saleId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$saleId', '$$saleId'],
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                },
              },
            ],
            as: 'items',
          },
        },
        {
          $project: {
            itemCount: {
              $size: '$items',
            },
          },
        },
        {
          $group: {
            _id: null,
            totalLinesSold: {
              $sum: '$itemCount',
            },
          },
        },
      ]),

      /**
       * ================= ACTIVITY DAY SUMMARY =================
       */
      this.activityModel.aggregate([
        {
          $match: {
            userId: employeeId,
            status: {
              $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
            },
            startTime: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$startTime',
                timezone: REPORT_TIMEZONE,
              },
            },
            retailing: {
              $sum: {
                $cond: [{ $eq: ['$name', 'Retailing'] }, 1, 0],
              },
            },
            officialWork: {
              $sum: {
                $cond: [{ $ne: ['$name', 'Retailing'] }, 1, 0],
              },
            },
            totalActivities: { $sum: 1 },
            retailingDurationMs: {
              $sum: {
                $cond: [
                  { $eq: ['$name', 'Retailing'] },
                  {
                    $subtract: [
                      { $ifNull: ['$endTime', openActivityEnd] },
                      '$startTime',
                    ],
                  },
                  0,
                ],
              },
            },
            totalDurationMs: {
              $sum: {
                $subtract: [
                  { $ifNull: ['$endTime', openActivityEnd] },
                  '$startTime',
                ],
              },
            },
          },
        },
      ]),

      /**
       * ================= VISIT DAY SUMMARY =================
       */
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId,
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$checkInTime',
                timezone: REPORT_TIMEZONE,
              },
            },
            tc: { $sum: 1 },
            firstCallTime: { $min: '$checkInTime' },
          },
        },
      ]),

      /**
       * ================= LEAVE DAY SUMMARY =================
       */
      this.leaveModel.aggregate([
        {
          $match: {
            userId: employeeId,
            status: LeaveStatus.COMPLETED,
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: REPORT_TIMEZONE,
              },
            },
            leave: { $sum: 1 },
          },
        },
      ]),

      /**
       * ================= WORK SESSION DAY SUMMARY =================
       */
      this.workSessionModel.aggregate([
        {
          $addFields: {
            normalizedDayStartTime: {
              $convert: {
                input: '$dayStartTime',
                to: 'date',
                onError: '$createdAt',
                onNull: '$createdAt',
              },
            },
          },
        },
        {
          $match: {
            userId: employeeId,
            normalizedDayStartTime: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$normalizedDayStartTime',
                timezone: REPORT_TIMEZONE,
              },
            },
            dayStarted: { $sum: 1 },
            dayCompleted: {
              $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
            },
            latestStatus: { $last: '$status' },
          },
        },
      ]),
    ]);

    const targetSummary = targets[0] || {
      targetCases: 0,
      targetTonnage: 0,
      targetValue: 0,
    };

    const salesFacet = salesAggregate?.[0] || {};
    const sales = salesFacet.summary?.[0] || {
      totalOrders: 0,
      totalCases: 0,
      totalTonnage: 0,
      totalValue: 0,
      saleIds: [],
      uniqueBilledOutlets: [],
    };

    const salesDaySummary = salesFacet.dayWise || [];

    const stock = vanStockSummary[0] || {
      openingCases: 0,
      topupCases: 0,
      salesCases: 0,
    };

    const openingStockCases = Number(stock.openingCases || 0);
    const topupStockCases = Number(stock.topupCases || 0);
    const totalStockCases = openingStockCases + topupStockCases;
    const stockSalesCases = Number(stock.salesCases || 0);

    const utilizationPercentage =
      totalStockCases > 0
        ? Number(((stockSalesCases / totalStockCases) * 100).toFixed(2))
        : 0;

    const lmtdTargetSummary = lmtdTargets[0] || {
      targetCases: 0,
      targetTonnage: 0,
      targetValue: 0,
    };

    const lmtdSales = lmtdSalesSummary[0] || {
      totalCases: 0,
      totalTonnage: 0,
      totalValue: 0,
    };

    const totalLinesSold = totalLinesSoldAggregate?.[0]?.totalLinesSold || 0;

    const formatTime = (value?: Date | string | null) => {
      if (!value) return null;

      const parsedDate = new Date(value);
      if (Number.isNaN(parsedDate.getTime())) return null;

      return parsedDate.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    };

    const formatAverageTime = (
      values: Array<Date | string | null | undefined>,
    ) => {
      const minutes = values
        .map((value) => {
          if (!value) return null;

          const parsedDate = new Date(value);
          if (Number.isNaN(parsedDate.getTime())) return null;

          return parsedDate.getHours() * 60 + parsedDate.getMinutes();
        })
        .filter((value): value is number => value !== null);

      if (!minutes.length) return null;

      const averageMinutes = Math.round(
        minutes.reduce((sum, value) => sum + value, 0) / minutes.length,
      );

      const averageDate = new Date();
      averageDate.setHours(
        Math.floor(averageMinutes / 60),
        averageMinutes % 60,
        0,
        0,
      );

      return formatTime(averageDate);
    };

    const formatDurationMinutes = (value: number) => {
      if (!Number.isFinite(value) || value < 1) return '< 1 min';

      const hours = Math.floor(value / 60);
      const minutes = value % 60;

      if (!hours) return `${minutes} min${minutes === 1 ? '' : 's'}`;
      if (!minutes) return `${hours} hr${hours === 1 ? '' : 's'}`;

      return `${hours} hr${hours === 1 ? '' : 's'} ${minutes} min${
        minutes === 1 ? '' : 's'
      }`;
    };

    const formatAverageDuration = (
      values: Array<number | null | undefined>,
    ) => {
      const minutes = values
        .map((value) => Math.max(Math.round(Number(value || 0) / 60000), 0))
        .filter((value) => value > 0);

      if (!minutes.length) return null;

      const averageMinutes = Math.round(
        minutes.reduce((sum, value) => sum + value, 0) / minutes.length,
      );

      return formatDurationMinutes(averageMinutes);
    };

    const formatDayLabel = (value: Date) =>
      value.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

    const toMap = (rows: any[]) =>
      rows.reduce((map, row) => {
        map.set(row._id, row);
        return map;
      }, new Map<string, any>());

    const activityDayMap = toMap(activityDaySummary);
    const visitDayMap = toMap(visitDaySummary);
    const salesDayMap = toMap(salesDaySummary);
    const leaveDayMap = toMap(leaveDaySummary);
    const workSessionDayMap = toMap(workSessionDaySummary);

    const avgFirstCallTime = formatAverageTime(
      visitDaySummary.map((item) => item.firstCallTime),
    );

    const avgFirstPcTime = formatAverageTime(
      salesDaySummary.map((item) => item.firstPcTime),
    );

    const avgRetailingTime = formatAverageDuration(
      activityDaySummary.map((item) => item.retailingDurationMs),
    );

    const avgTotalTime = formatAverageDuration(
      activityDaySummary.map((item) => item.totalDurationMs),
    );

    const dayWiseSummary: any[] = [];
    const dayCursor = new Date(startDate);

    while (dayCursor <= endDate) {
      const dayKey = formatCalendarDate(dayCursor);

      const activity = activityDayMap.get(dayKey) || {};
      const visits = visitDayMap.get(dayKey) || {};
      const daySales = salesDayMap.get(dayKey) || {};
      const leave = leaveDayMap.get(dayKey) || {};
      const workSession = workSessionDayMap.get(dayKey) || {};

      const retailing = Number(activity.retailing || 0);
      const officialWork = Number(activity.officialWork || 0);
      const leaveCount = Number(leave.leave || 0);
      const totalActivities = Number(activity.totalActivities || 0);
      const tcCount = Number(visits.tc || 0);
      const pcCount = Number(daySales.pc || 0);
      const dayStarted = Number(workSession.dayStarted || 0) > 0;

      const hasWorkRecord =
        dayStarted || totalActivities > 0 || tcCount > 0 || pcCount > 0;

      const absent = leaveCount > 0 || hasWorkRecord ? 0 : 1;

      const dayStatus =
        leaveCount > 0
          ? 'Leave'
          : retailing > 0 || tcCount > 0 || pcCount > 0
            ? 'Retailing'
            : officialWork > 0
              ? 'Official Work'
              : dayStarted
                ? 'Official Work'
                : 'Absent';

      dayWiseSummary.push({
        date: dayKey,
        label: formatDayLabel(dayCursor),
        dayStatus,
        workSessionStatus: workSession.latestStatus ?? null,
        dayStarted,
        dayCompleted: Number(workSession.dayCompleted || 0) > 0,
        retailing,
        officialWork,
        leave: leaveCount,
        absent,
        totalActivities,
        retailingDuration: formatDurationMinutes(
          Math.max(
            Math.round(Number(activity.retailingDurationMs || 0) / 60000),
            0,
          ),
        ),
        totalDuration: formatDurationMinutes(
          Math.max(
            Math.round(Number(activity.totalDurationMs || 0) / 60000),
            0,
          ),
        ),
        tc: tcCount,
        pc: pcCount,
        upc: daySales.upc?.length || 0,
        netValue: Number((daySales.netValue || 0).toFixed(2)),
        cases: Number((daySales.cases || 0).toFixed(2)),

        /**
         * Already converted from KG to tonnage inside aggregation.
         */
        tonnage: Number((daySales.tonnage || 0).toFixed(3)),

        firstCallTime: formatTime(visits.firstCallTime),
        firstPcTime: formatTime(daySales.firstPcTime),
      });

      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    const pc = Number(sales.totalOrders || 0);
    const tc = Number(totalVisits || 0);
    const upc = sales.uniqueBilledOutlets?.length || 0;
    const utc = uniqueVisitedOutlets.length;
    const retailingDayCount = retailingDays?.[0]?.days || 0;

    const targetCases = Number(targetSummary.targetCases || 0);
    const achievedCases = Number(sales.totalCases || 0);
    const remainingCases = Math.max(targetCases - achievedCases, 0);

    /**
     * Tonnage values are now correct because achievedTonnage is already KG / 1000.
     */
    const targetTonnage = Number(targetSummary.targetTonnage || 0);
    const achievedTonnage = Number(sales.totalTonnage || 0);
    const remainingTonnage = Math.max(targetTonnage - achievedTonnage, 0);

    const targetValue = Number(targetSummary.targetValue || 0);
    const achievedValue = Number(sales.totalValue || 0);
    const remainingValue = Math.max(targetValue - achievedValue, 0);

    const selectedTarget =
      normalizedMetric === 'tonnage'
        ? targetTonnage
        : normalizedMetric === 'value'
          ? targetValue
          : targetCases;

    const selectedAchieved =
      normalizedMetric === 'tonnage'
        ? achievedTonnage
        : normalizedMetric === 'value'
          ? achievedValue
          : achievedCases;

    const selectedRemaining = Math.max(selectedTarget - selectedAchieved, 0);

    const lmtdTarget =
      normalizedMetric === 'tonnage'
        ? Number(lmtdTargetSummary.targetTonnage || 0)
        : normalizedMetric === 'value'
          ? Number(lmtdTargetSummary.targetValue || 0)
          : Number(lmtdTargetSummary.targetCases || 0);

    /**
     * LMTD tonnage is also already KG / 1000.
     */
    const lmtdAchieved =
      normalizedMetric === 'tonnage'
        ? Number(lmtdSales.totalTonnage || 0)
        : normalizedMetric === 'value'
          ? Number(lmtdSales.totalValue || 0)
          : Number(lmtdSales.totalCases || 0);

    const elapsedDays =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);

    const achievementPercentage =
      targetCases > 0
        ? Number(((achievedCases / targetCases) * 100).toFixed(2))
        : 0;

    const selectedAchievementPercentage =
      selectedTarget > 0
        ? Number(((selectedAchieved / selectedTarget) * 100).toFixed(2))
        : 0;

    const lmtdAchievementPercentage =
      lmtdTarget > 0
        ? Number(((lmtdAchieved / lmtdTarget) * 100).toFixed(2))
        : 0;

    const improvement = Number(
      (selectedAchievementPercentage - lmtdAchievementPercentage).toFixed(2),
    );

    const selectedDecimalPlaces = normalizedMetric === 'tonnage' ? 3 : 2;

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman pocket and target fetched successfully',
      data: {
        startDate,
        endDate,
        retailingDays: retailingDayCount,
        avgRetailingTime,
        avgTotalTime,

        target: {
          metric: normalizedMetric,

          selected: {
            target: Number(selectedTarget.toFixed(selectedDecimalPlaces)),
            achieved: Number(selectedAchieved.toFixed(selectedDecimalPlaces)),
            remaining: Number(selectedRemaining.toFixed(selectedDecimalPlaces)),
            achievementPercentage: selectedAchievementPercentage,
            mtd: selectedAchievementPercentage,
            lmtd: lmtdAchievementPercentage,
            improvement,

            crr:
              elapsedDays > 0
                ? Number(
                    (selectedAchieved / elapsedDays).toFixed(
                      selectedDecimalPlaces,
                    ),
                  )
                : 0,

            rrr:
              remainingDays > 0
                ? Number(
                    (selectedRemaining / remainingDays).toFixed(
                      selectedDecimalPlaces,
                    ),
                  )
                : 0,
          },

          targetCases: Number(targetCases.toFixed(2)),
          achievedCases: Number(achievedCases.toFixed(2)),
          remainingCases: Number(remainingCases.toFixed(2)),

          targetTonnage: Number(targetTonnage.toFixed(3)),
          achievedTonnage: Number(achievedTonnage.toFixed(3)),
          remainingTonnage: Number(remainingTonnage.toFixed(3)),

          targetValue: Number(targetValue.toFixed(2)),
          achievedValue: Number(achievedValue.toFixed(2)),
          remainingValue: Number(remainingValue.toFixed(2)),

          achievementPercentage,

          crr:
            elapsedDays > 0
              ? Number((achievedCases / elapsedDays).toFixed(2))
              : 0,

          rrr:
            remainingDays > 0
              ? Number((remainingCases / remainingDays).toFixed(2))
              : 0,
        },

        pocket: {
          tc,
          avgTc:
            retailingDayCount > 0
              ? Number((tc / retailingDayCount).toFixed(2))
              : 0,
          pc,
          avgPc:
            retailingDayCount > 0
              ? Number((pc / retailingDayCount).toFixed(2))
              : 0,
          upc,
          utc,
          totalLinesSold,
          lpc: pc > 0 ? Number((totalLinesSold / pc).toFixed(2)) : 0,
          avgFirstCallTime,
          avgFirstPcTime,
        },

        vanUtilization: {
          openingStockCases: Number(openingStockCases.toFixed(2)),
          topupStockCases: Number(topupStockCases.toFixed(2)),
          totalStockCases: Number(totalStockCases.toFixed(2)),
          salesCases: Number(stockSalesCases.toFixed(2)),
          utilizationPercentage,
        },

        dayWiseSummary,
      },
    };
  }

  async getSalesmanDayWiseSummary(
    date?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const pocketSummary = await this.getSalesmanPocketAndTarget(
      date,
      'cases',
      startDate,
      endDate,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman day wise summary fetched successfully',
      data: pocketSummary.data?.dayWiseSummary || [],
    };
  }

  async getSalesmanProductSales(
    date?: string,
    startDateParam?: string,
    endDateParam?: string,
    groupBy:
      | 'PRIMARYCATEGORY'
      | 'SECONDARYCATEGORY'
      | 'SKU' = 'PRIMARYCATEGORY',
  ) {
    const employeeId = RequestContextStore.getStore()?.userId;

    if (!employeeId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = endDateParam
      ? parseCalendarDate(endDateParam)
      : date
        ? parseCalendarDate(date)
        : new Date();
    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? parseCalendarDate(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange
      ? parseCalendarDate(endDateParam || startDateParam!)
      : now;
    endDate.setHours(23, 59, 59, 999);

    const normalizedGroupBy = [
      'PRIMARYCATEGORY',
      'SECONDARYCATEGORY',
      'SKU',
    ].includes(groupBy)
      ? groupBy
      : 'PRIMARYCATEGORY';

    const [salesSummary, tc] = await Promise.all([
      this.saleModal.aggregate([
        {
          $match: {
            employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalValue: { $sum: '$totalValue' },
            totalCases: { $sum: '$netCases' },
            saleIds: { $addToSet: '$saleId' },
          },
        },
      ]),
      this.shopVisitModel.countDocuments({
        employeeId,
        status: ShopVisitStatus.COMPLETED,
        checkInTime: {
          $gte: startDate,
          $lte: endDate,
        },
      }),
    ]);

    const sales = salesSummary[0] || {
      totalOrders: 0,
      totalValue: 0,
      totalCases: 0,
      saleIds: [],
    };
    const saleIds = sales.saleIds || [];

    const groupIdExpression =
      normalizedGroupBy === 'SKU'
        ? { $ifNull: ['$product.productId', '$productId'] }
        : normalizedGroupBy === 'SECONDARYCATEGORY'
          ? {
              $ifNull: [
                '$product.unitType',
                { $ifNull: ['$product.parentCategoryId', 'UNKNOWN'] },
              ],
            }
          : { $ifNull: ['$product.parentCategoryId', 'UNKNOWN'] };

    const groupNameExpression =
      normalizedGroupBy === 'SKU'
        ? { $ifNull: ['$product.name', '$productName'] }
        : normalizedGroupBy === 'SECONDARYCATEGORY'
          ? {
              $ifNull: [
                '$product.unitType',
                { $ifNull: ['$category.name', 'Unknown'] },
              ],
            }
          : { $ifNull: ['$category.name', 'Unknown'] };

    const [itemSummary, productSales] = saleIds.length
      ? await Promise.all([
          this.saleItemModel.aggregate([
            {
              $match: {
                saleId: { $in: saleIds },
              },
            },
            {
              $group: {
                _id: null,
                totalValue: { $sum: '$totalValue' },
                totalPieces: { $sum: '$quantity' },
                totalCases: {
                  $sum: {
                    $add: [
                      { $ifNull: ['$caseQty', 0] },
                      {
                        $cond: [
                          { $gt: ['$unitQtyInCase', 0] },
                          {
                            $divide: [
                              { $ifNull: ['$pieceQty', 0] },
                              '$unitQtyInCase',
                            ],
                          },
                          0,
                        ],
                      },
                    ],
                  },
                },
                skuIds: { $addToSet: '$productId' },
                lineCount: { $sum: 1 },
              },
            },
          ]),
          this.saleItemModel.aggregate([
            {
              $match: {
                saleId: { $in: saleIds },
              },
            },
            {
              $lookup: {
                from: 'product_master',
                localField: 'productId',
                foreignField: 'productId',
                as: 'product',
              },
            },
            {
              $unwind: {
                path: '$product',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'productcategories',
                localField: 'product.parentCategoryId',
                foreignField: 'categoryId',
                as: 'category',
              },
            },
            {
              $unwind: {
                path: '$category',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $group: {
                _id: groupIdExpression,
                name: { $first: groupNameExpression },
                value: { $sum: '$totalValue' },
                pcs: { $sum: '$quantity' },
                cases: {
                  $sum: {
                    $add: [
                      { $ifNull: ['$caseQty', 0] },
                      {
                        $cond: [
                          { $gt: ['$unitQtyInCase', 0] },
                          {
                            $divide: [
                              { $ifNull: ['$pieceQty', 0] },
                              '$unitQtyInCase',
                            ],
                          },
                          0,
                        ],
                      },
                    ],
                  },
                },
              },
            },
            {
              $sort: {
                value: -1,
              },
            },
          ]),
        ])
      : [[], []];

    const itemTotals = itemSummary[0] || {
      totalValue: 0,
      totalPieces: 0,
      totalCases: 0,
      skuIds: [],
      lineCount: 0,
    };
    const pc = Number(sales.totalOrders || 0);
    const totalValue = Number(itemTotals.totalValue || sales.totalValue || 0);
    const totalCases = Number(itemTotals.totalCases || sales.totalCases || 0);

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman product sales fetched successfully',
      data: {
        overview: {
          sc: itemTotals.skuIds?.length || 0,
          tc: Number(tc || 0),
          pc,
          netValue: Number(totalValue.toFixed(2)),
          cases: Number(totalCases.toFixed(2)),
          lpc:
            pc > 0
              ? Number((Number(itemTotals.lineCount || 0) / pc).toFixed(2))
              : 0,
        },
        categories: productSales.map((item) => ({
          id: item._id,
          name: item.name || 'Unknown',
          value: Number((item.value || 0).toFixed(2)),
          pcs: Number((item.pcs || 0).toFixed(2)),
          cases: Number((item.cases || 0).toFixed(2)),
          growth:
            totalValue > 0
              ? Number(
                  ((Number(item.value || 0) / totalValue) * 100).toFixed(2),
                )
              : 0,
        })),
      },
    };
  }

  async getSalesmanDispatchOrders(
    date?: string,
    startDateParam?: string,
    endDateParam?: string,
  ) {
    const employeeId = RequestContextStore.getStore()?.userId;

    if (!employeeId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = endDateParam
      ? parseCalendarDate(endDateParam)
      : date
        ? parseCalendarDate(date)
        : new Date();
    const hasDateRange = Boolean(startDateParam || endDateParam);

    const startDate = startDateParam
      ? parseCalendarDate(startDateParam)
      : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);

    const endDate = hasDateRange
      ? parseCalendarDate(endDateParam || startDateParam!)
      : now;
    endDate.setHours(23, 59, 59, 999);

    const orders = await this.saleModal
      .find({
        employeeId,
        status: SaleStatus.COMPLETED,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
      })
      .sort({ date: -1 })
      .lean();

    return {
      statusCode: HttpStatus.OK,
      message: 'Salesman dispatch orders fetched successfully',
      data: orders.map((order: any) => ({
        orderId: order.saleId,
        orderNo: order.saleId,
        outletName: order.customerName,
        outlet: order.customerName,
        invoiceNo: order.saleId,
        status: 'Pending Dispatch',
        orderDate: order.date,
        dispatchDate: null,
        vehicleNo: order.vanName,
        cases: Number(order.netCases || order.totalCases || 0),
        pieces: Number(order.totalPieces || order.totalQty || 0),
        netValue: Number(order.totalValue || 0),
      })),
    };
  }

  async shareSalesmanReport(
    type: 'MST' | 'MSR' | 'DSR',
    params?: {
      date?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const reportType = type === 'MSR' ? 'MST' : type;
    const summary = await this.getSalesmanPocketAndTarget(
      params?.date,
      'cases',
      params?.startDate,
      params?.endDate,
    );
    const data = summary.data;
    const startDate = data?.startDate ? new Date(data.startDate) : new Date();
    const endDate = data?.endDate ? new Date(data.endDate) : startDate;
    const rangeLabel =
      formatCalendarDate(startDate) === formatCalendarDate(endDate)
        ? formatCalendarDate(startDate)
        : `${formatCalendarDate(startDate)} to ${formatCalendarDate(endDate)}`;
    const pocket = data?.pocket || {};
    const target = data?.target || {};
    const selectedTarget = target?.selected || {};

    const shareText = [
      `${reportType} Report`,
      `Period: ${rangeLabel}`,
      `TC: ${Number(pocket.tc || 0)}`,
      `PC: ${Number(pocket.pc || 0)}`,
      `UPC: ${Number(pocket.upc || 0)}`,
      `UTC: ${Number(pocket.utc || 0)}`,
      `LPC: ${Number(pocket.lpc || 0)}`,
      `Cases: ${Number(target.achievedCases || selectedTarget.achieved || 0)}`,
      `Target: ${Number(target.targetCases || selectedTarget.target || 0)}`,
      `Achievement: ${Number(
        target.achievementPercentage ||
          selectedTarget.achievementPercentage ||
          0,
      )}%`,
    ].join('\n');

    return {
      statusCode: HttpStatus.OK,
      message: `${reportType} sharing content prepared successfully`,
      data: {
        type: reportType,
        message: shareText,
        shareText,
        text: shareText,
      },
    };
  }

  // async getPrimaryCategoryTargetSummary(date?: string) {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   /* ==========================================
  //    * MTD DATE RANGE
  //    * ========================================== */
  //   const now = date ? parseCalendarDate(date) : new Date();

  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const endDate = now;

  //   /* ==========================================
  //    * TEAM MEMBERS
  //    * ========================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Target summary fetched successfully',
  //       data: {
  //         startDate,
  //         endDate,
  //         targetCases: 0,
  //         achievedCases: 0,
  //         remainingCases: 0,
  //         achievementPercentage: 0,
  //         display: {
  //           percentage: '0%',
  //           achievedCases: '0 Cases',
  //           remainingMessage: 'No target assigned for current month',
  //         },
  //       },
  //     };
  //   }

  //   /* ==========================================
  //    * TARGETS + ACHIEVEMENT
  //    * ========================================== */
  //   const [targets, sales] = await Promise.all([
  //     this.targetModel.aggregate([
  //       {
  //         $match: {
  //           userId: {
  //             $in: employeeIds,
  //           },
  //           startDate: {
  //             $lte: endDate,
  //           },
  //           endDate: {
  //             $gte: startDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           targetCases: {
  //             $sum: '$targetCases',
  //           },

  //           targetTonnage: {
  //             $sum: '$targetTonnage',
  //           },

  //           targetValue: {
  //             $sum: '$targetValue',
  //           },
  //         },
  //       },
  //     ]),

  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           achievedCases: {
  //             $sum: '$netCases',
  //           },

  //           achievedTonnage: {
  //             $sum: '$totalWeight',
  //           },

  //           achievedValue: {
  //             $sum: '$totalValue',
  //           },
  //         },
  //       },
  //     ]),
  //   ]);

  //   const targetSummary = targets[0] || {
  //     targetCases: 0,
  //     targetTonnage: 0,
  //     targetValue: 0,
  //   };

  //   const achievementSummary = sales[0] || {
  //     achievedCases: 0,
  //     achievedTonnage: 0,
  //     achievedValue: 0,
  //   };

  //   const targetCases = targetSummary.targetCases;
  //   const achievedCases = achievementSummary.achievedCases;

  //   const remainingCases = Math.max(targetCases - achievedCases, 0);

  //   const achievementPercentage =
  //     targetCases > 0
  //       ? Number(((achievedCases / targetCases) * 100).toFixed(2))
  //       : 0;

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Target summary fetched successfully',
  //     data: {
  //       startDate,
  //       endDate,

  //       targetCases,
  //       achievedCases,
  //       remainingCases,

  //       targetTonnage: targetSummary.targetTonnage,
  //       achievedTonnage: achievementSummary.achievedTonnage,

  //       targetValue: targetSummary.targetValue,
  //       achievedValue: achievementSummary.achievedValue,

  //       achievementPercentage,

  //       display: {
  //         percentage: `${achievementPercentage}%`,
  //         achievedCases: `${Math.round(achievedCases).toLocaleString()} Cases`,
  //         remainingMessage: `Only ${remainingCases.toLocaleString()} more Cases to achieve your target`,
  //       },
  //     },
  //   };
  // }

  async getPrimaryCategoryTargetSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    if (!managerId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    /**
     * ==========================================
     * MTD DATE RANGE
     * ==========================================
     */
    const now = date ? parseCalendarDate(date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const emptyData = {
      startDate,
      endDate,

      targetCases: 0,
      achievedCases: 0,
      remainingCases: 0,

      targetTonnage: 0,
      achievedTonnage: 0,
      remainingTonnage: 0,

      targetValue: 0,
      achievedValue: 0,
      remainingValue: 0,

      uboTarget: 0,
      uboAchievement: 0,
      uboRemaining: 0,

      achievementPercentage: 0,
      tonnageAchievementPercentage: 0,
      valueAchievementPercentage: 0,
      uboAchievementPercentage: 0,

      display: {
        percentage: '0%',
        achievedCases: '0 Cases',
        uboAchievement: '0 Outlets',
        remainingMessage: 'No target assigned for current month',
        uboRemainingMessage: 'No UBO target assigned for current month',
      },
    };

    /**
     * ==========================================
     * TEAM MEMBERS
     * ==========================================
     */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter(Boolean);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Target summary fetched successfully',
        data: emptyData,
      };
    }

    /**
     * ==========================================
     * TARGETS + ACHIEVEMENT
     * ==========================================
     */
    const [targets, sales] = await Promise.all([
      this.targetModel.aggregate([
        {
          $match: {
            userId: {
              $in: employeeIds,
            },
            startDate: {
              $lte: endDate,
            },
            endDate: {
              $gte: startDate,
            },
          },
        },
        {
          $group: {
            _id: null,

            targetCases: {
              $sum: {
                $ifNull: ['$targetCases', 0],
              },
            },

            targetTonnage: {
              $sum: {
                $ifNull: ['$targetTonnage', 0],
              },
            },

            targetValue: {
              $sum: {
                $ifNull: ['$targetValue', 0],
              },
            },

            /**
             * Unique Billed Outlet Target
             */
            uboTarget: {
              $sum: {
                $ifNull: ['$uboTarget', 0],
              },
            },
          },
        },
      ]),

      this.saleModal.aggregate([
        {
          $match: {
            /**
             * Sale schema has employees array.
             */
            'employees.employeeId': {
              $in: employeeIds,
            },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: null,

            achievedCases: {
              $sum: {
                $ifNull: ['$netCases', 0],
              },
            },

            /**
             * totalWeight is KG.
             * Convert KG to tonnage.
             */
            achievedTonnage: {
              $sum: {
                $divide: [
                  {
                    $ifNull: ['$totalWeight', 0],
                  },
                  1000,
                ],
              },
            },

            achievedValue: {
              $sum: {
                $ifNull: ['$totalValue', 0],
              },
            },

            /**
             * UBO Achievement = distinct billed outlets.
             */
            uniqueBilledOutlets: {
              $addToSet: '$customerId',
            },
          },
        },
        {
          $project: {
            _id: 0,
            achievedCases: 1,
            achievedTonnage: 1,
            achievedValue: 1,
            uboAchievement: {
              $size: '$uniqueBilledOutlets',
            },
          },
        },
      ]),
    ]);

    const targetSummary = targets[0] || {
      targetCases: 0,
      targetTonnage: 0,
      targetValue: 0,
      uboTarget: 0,
    };

    const achievementSummary = sales[0] || {
      achievedCases: 0,
      achievedTonnage: 0,
      achievedValue: 0,
      uboAchievement: 0,
    };

    /**
     * ==========================================
     * CASES
     * ==========================================
     */
    const targetCases = Number(targetSummary.targetCases || 0);
    const achievedCases = Number(achievementSummary.achievedCases || 0);
    const remainingCases = Math.max(targetCases - achievedCases, 0);

    /**
     * ==========================================
     * TONNAGE
     * ==========================================
     */
    const targetTonnage = Number(targetSummary.targetTonnage || 0);
    const achievedTonnage = Number(achievementSummary.achievedTonnage || 0);
    const remainingTonnage = Math.max(targetTonnage - achievedTonnage, 0);

    /**
     * ==========================================
     * VALUE
     * ==========================================
     */
    const targetValue = Number(targetSummary.targetValue || 0);
    const achievedValue = Number(achievementSummary.achievedValue || 0);
    const remainingValue = Math.max(targetValue - achievedValue, 0);

    /**
     * ==========================================
     * UNIQUE BILLED OUTLETS
     * ==========================================
     */
    const uboTarget = Number(targetSummary.uboTarget || 0);
    const uboAchievement = Number(achievementSummary.uboAchievement || 0);
    const uboRemaining = Math.max(uboTarget - uboAchievement, 0);

    /**
     * ==========================================
     * PERCENTAGES
     * ==========================================
     */
    const achievementPercentage =
      targetCases > 0
        ? Number(((achievedCases / targetCases) * 100).toFixed(2))
        : 0;

    const tonnageAchievementPercentage =
      targetTonnage > 0
        ? Number(((achievedTonnage / targetTonnage) * 100).toFixed(2))
        : 0;

    const valueAchievementPercentage =
      targetValue > 0
        ? Number(((achievedValue / targetValue) * 100).toFixed(2))
        : 0;

    const uboAchievementPercentage =
      uboTarget > 0
        ? Number(((uboAchievement / uboTarget) * 100).toFixed(2))
        : 0;

    return {
      statusCode: HttpStatus.OK,
      message: 'Target summary fetched successfully',
      data: {
        startDate,
        endDate,

        targetCases: Number(targetCases.toFixed(2)),
        achievedCases: Number(achievedCases.toFixed(2)),
        remainingCases: Number(remainingCases.toFixed(2)),

        targetTonnage: Number(targetTonnage.toFixed(3)),
        achievedTonnage: Number(achievedTonnage.toFixed(3)),
        remainingTonnage: Number(remainingTonnage.toFixed(3)),

        targetValue: Number(targetValue.toFixed(2)),
        achievedValue: Number(achievedValue.toFixed(2)),
        remainingValue: Number(remainingValue.toFixed(2)),

        /**
         * UBO = Unique Billed Outlets
         */
        uboTarget: Number(uboTarget.toFixed(0)),
        uboAchievement: Number(uboAchievement.toFixed(0)),
        uboRemaining: Number(uboRemaining.toFixed(0)),

        achievementPercentage,
        tonnageAchievementPercentage,
        valueAchievementPercentage,
        uboAchievementPercentage,

        display: {
          percentage: `${achievementPercentage}%`,
          achievedCases: `${Math.round(achievedCases).toLocaleString()} Cases`,

          uboPercentage: `${uboAchievementPercentage}%`,
          uboAchievement: `${uboAchievement.toLocaleString()} Outlets`,

          remainingMessage:
            targetCases > 0
              ? `Only ${Math.round(remainingCases).toLocaleString()} more Cases to achieve your target`
              : 'No target assigned for current month',

          uboRemainingMessage:
            uboTarget > 0
              ? `Only ${uboRemaining.toLocaleString()} more billed outlets to achieve your UBO target`
              : 'No UBO target assigned for current month',
        },
      },
    };
  }

  async getUserWiseTargetSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    if (!managerId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = date ? parseCalendarDate(date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    /**
     * ==========================================
     * TEAM MEMBERS
     * ==========================================
     */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter(Boolean);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'User target summary fetched successfully',
        data: [],
      };
    }

    /**
     * ==========================================
     * TARGETS + ACHIEVEMENTS
     * ==========================================
     */
    const [targets, achievements] = await Promise.all([
      /**
       * Normal user target from target collection
       */
      this.targetModel.aggregate([
        {
          $match: {
            userId: {
              $in: employeeIds,
            },
            startDate: {
              $lte: endDate,
            },
            endDate: {
              $gte: startDate,
            },
          },
        },
        {
          $group: {
            _id: '$userId',

            targetCases: {
              $sum: {
                $ifNull: ['$targetCases', 0],
              },
            },

            targetTonnage: {
              $sum: {
                $ifNull: ['$targetTonnage', 0],
              },
            },

            targetValue: {
              $sum: {
                $ifNull: ['$targetValue', 0],
              },
            },
          },
        },
      ]),

      /**
       * Achievement from completed sales
       *
       * Sale schema has employees array.
       * So use employees.employeeId and group by employees.employeeId.
       */
      this.saleModal.aggregate([
        {
          $match: {
            'employees.employeeId': {
              $in: employeeIds,
            },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $unwind: '$employees',
        },
        {
          $match: {
            'employees.employeeId': {
              $in: employeeIds,
            },
          },
        },
        {
          $group: {
            _id: '$employees.employeeId',

            achievementCases: {
              $sum: {
                $ifNull: ['$netCases', 0],
              },
            },

            /**
             * totalWeight is KG.
             * Convert KG to tonnage.
             */
            achievementTonnage: {
              $sum: {
                $divide: [
                  {
                    $ifNull: ['$totalWeight', 0],
                  },
                  1000,
                ],
              },
            },

            achievementValue: {
              $sum: {
                $ifNull: ['$totalValue', 0],
              },
            },

            orders: {
              $sum: 1,
            },

            uniqueOutlets: {
              $addToSet: '$customerId',
            },
          },
        },
      ]),
    ]);

    const targetMap = new Map<string, any>(
      targets.map((item) => [item._id, item]),
    );

    const achievementMap = new Map<string, any>(
      achievements.map((item) => [item._id, item]),
    );

    const totalDaysInMonth = monthEndDate.getDate();

    const elapsedDays =
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;

    const remainingDays = Math.max(totalDaysInMonth - elapsedDays, 1);

    const round = (value: number, digits = 2) => Number(value.toFixed(digits));

    const result = employees.map((employee) => {
      const employeeId = employee.employeeId;

      const target = targetMap.get(employeeId) || {};
      const achievement = achievementMap.get(employeeId) || {};

      /**
       * ==========================================
       * TARGET
       * ==========================================
       */
      const targetCases = Number(target.targetCases || 0);
      const targetTonnage = Number(target.targetTonnage || 0);
      const targetValue = Number(target.targetValue || 0);

      /**
       * ==========================================
       * ACHIEVEMENT
       * ==========================================
       */
      const achievementCases = Number(achievement.achievementCases || 0);
      const achievementTonnage = Number(achievement.achievementTonnage || 0);
      const achievementValue = Number(achievement.achievementValue || 0);

      /**
       * ==========================================
       * REMAINING
       * ==========================================
       */
      const remainingCases = Math.max(targetCases - achievementCases, 0);
      const remainingTonnage = Math.max(targetTonnage - achievementTonnage, 0);
      const remainingValue = Math.max(targetValue - achievementValue, 0);

      /**
       * ==========================================
       * PERCENTAGES
       * ==========================================
       */
      const achievementPercentage =
        targetCases > 0 ? round((achievementCases / targetCases) * 100) : 0;

      const tonnageAchievementPercentage =
        targetTonnage > 0
          ? round((achievementTonnage / targetTonnage) * 100)
          : 0;

      const valueAchievementPercentage =
        targetValue > 0 ? round((achievementValue / targetValue) * 100) : 0;

      /**
       * ==========================================
       * CRR / RRR
       * ==========================================
       *
       * Default CRR/RRR is based on cases.
       */
      const crrCases = elapsedDays > 0 ? achievementCases / elapsedDays : 0;
      const rrrCases = remainingDays > 0 ? remainingCases / remainingDays : 0;

      const crrTonnage = elapsedDays > 0 ? achievementTonnage / elapsedDays : 0;
      const rrrTonnage =
        remainingDays > 0 ? remainingTonnage / remainingDays : 0;

      const crrValue = elapsedDays > 0 ? achievementValue / elapsedDays : 0;
      const rrrValue = remainingDays > 0 ? remainingValue / remainingDays : 0;

      return {
        employeeId,
        employeeName: employee.name,

        /**
         * Cases
         */
        targetCases: round(targetCases),
        achievementCases: round(achievementCases),
        remainingCases: round(remainingCases),

        /**
         * Tonnage
         */
        targetTonnage: round(targetTonnage, 3),
        achievementTonnage: round(achievementTonnage, 3),
        remainingTonnage: round(remainingTonnage, 3),

        /**
         * Value
         */
        targetValue: round(targetValue),
        achievementValue: round(achievementValue),
        remainingValue: round(remainingValue),

        /**
         * Percentages
         */
        achievementPercentage,
        tonnageAchievementPercentage,
        valueAchievementPercentage,

        /**
         * Default CRR / RRR based on cases
         */
        crr: round(crrCases),
        rrr: round(rrrCases),

        crrCases: round(crrCases),
        rrrCases: round(rrrCases),

        crrTonnage: round(crrTonnage, 3),
        rrrTonnage: round(rrrTonnage, 3),

        crrValue: round(crrValue),
        rrrValue: round(rrrValue),

        orders: Number(achievement.orders || 0),
        uniqueOutlets: achievement.uniqueOutlets?.length || 0,

        hasTarget: targetCases > 0 || targetTonnage > 0 || targetValue > 0,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'User target summary fetched successfully',
      data: result.sort((a, b) => b.achievementCases - a.achievementCases),
    };
  }

  // async getUserPrimaryCategoryTarget(query: {
  //   employeeId: string;
  //   date?: string;
  // }) {
  //   if (!query.employeeId) {
  //     throw new BadRequestException('Employee ID is required');
  //   }

  //   const now = query?.date ? parseCalendarDate(query.date) : new Date();

  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const endDate = new Date(now);
  //   endDate.setHours(23, 59, 59, 999);

  //   const [targets, achievements] = await Promise.all([
  //     /**
  //      * ==========================================
  //      * TARGETS BY PRIMARY CATEGORY
  //      * ==========================================
  //      */
  //     this.targetModel.aggregate([
  //       {
  //         $match: {
  //           userId: query.employeeId,
  //           startDate: { $lte: endDate },
  //           endDate: { $gte: startDate },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: '$categoryId',

  //           category: {
  //             $first: '$category',
  //           },

  //           targetCases: {
  //             $sum: {
  //               $ifNull: ['$targetCases', 0],
  //             },
  //           },

  //           targetTonnage: {
  //             $sum: {
  //               $ifNull: ['$targetTonnage', 0],
  //             },
  //           },

  //           targetValue: {
  //             $sum: {
  //               $ifNull: ['$targetValue', 0],
  //             },
  //           },
  //         },
  //       },
  //     ]),

  //     /**
  //      * ==========================================
  //      * ACHIEVEMENTS BY PRIMARY CATEGORY
  //      * ==========================================
  //      *
  //      * Fixes:
  //      * 1. Sale schema has employees array, so use employees.employeeId.
  //      * 2. sale_items already has parentCategoryId, so no need for product_master lookup.
  //      * 3. totalNetWeight is KG, so convert KG to tonnage.
  //      */
  //     this.saleModal
  //       .aggregate([
  //         {
  //           $match: {
  //             'employees.employeeId': query.employeeId,
  //             status: SaleStatus.COMPLETED,
  //             date: {
  //               $gte: startDate,
  //               $lte: endDate,
  //             },
  //           },
  //         },
  //         {
  //           $lookup: {
  //             from: 'sale_items',
  //             let: {
  //               saleId: '$saleId',
  //             },
  //             pipeline: [
  //               {
  //                 $match: {
  //                   $expr: {
  //                     $eq: ['$saleId', '$$saleId'],
  //                   },
  //                 },
  //               },
  //               {
  //                 $project: {
  //                   _id: 0,
  //                   parentCategoryId: 1,
  //                   caseQty: 1,
  //                   pieceQty: 1,
  //                   unitQtyInCase: 1,
  //                   totalNetWeight: 1,
  //                   totalValue: 1,
  //                 },
  //               },
  //             ],
  //             as: 'items',
  //           },
  //         },
  //         {
  //           $unwind: '$items',
  //         },
  //         {
  //           $lookup: {
  //             from: 'productcategories',
  //             localField: 'items.parentCategoryId',
  //             foreignField: 'categoryId',
  //             as: 'category',
  //           },
  //         },
  //         {
  //           $unwind: {
  //             path: '$category',
  //             preserveNullAndEmptyArrays: true,
  //           },
  //         },
  //         {
  //           $group: {
  //             _id: {
  //               $ifNull: ['$items.parentCategoryId', 'UNKNOWN'],
  //             },

  //             category: {
  //               $first: {
  //                 $ifNull: ['$category.name', 'Unknown'],
  //               },
  //             },

  //             achievementCases: {
  //               $sum: {
  //                 $add: [
  //                   {
  //                     $ifNull: ['$items.caseQty', 0],
  //                   },
  //                   {
  //                     $cond: [
  //                       {
  //                         $gt: ['$items.unitQtyInCase', 0],
  //                       },
  //                       {
  //                         $divide: [
  //                           {
  //                             $ifNull: ['$items.pieceQty', 0],
  //                           },
  //                           '$items.unitQtyInCase',
  //                         ],
  //                       },
  //                       0,
  //                     ],
  //                   },
  //                 ],
  //               },
  //             },

  //             /**
  //              * totalNetWeight is KG.
  //              * Convert KG to tonnage.
  //              */
  //             achievementTonnage: {
  //               $sum: {
  //                 $divide: [
  //                   {
  //                     $ifNull: ['$items.totalNetWeight', 0],
  //                   },
  //                   1000,
  //                 ],
  //               },
  //             },

  //             achievementValue: {
  //               $sum: {
  //                 $ifNull: ['$items.totalValue', 0],
  //               },
  //             },
  //           },
  //         },
  //       ])
  //       .allowDiskUse(true),
  //   ]);

  //   const categoryMap = new Map<string, any>();

  //   /**
  //    * ==========================================
  //    * MAP TARGETS
  //    * ==========================================
  //    */
  //   for (const target of targets) {
  //     categoryMap.set(target._id, {
  //       categoryId: target._id,
  //       category: target.category || 'Unknown',

  //       targetCases: Number(target.targetCases || 0),
  //       targetTonnage: Number(target.targetTonnage || 0),
  //       targetValue: Number(target.targetValue || 0),

  //       achievementCases: 0,
  //       achievementTonnage: 0,
  //       achievementValue: 0,
  //     });
  //   }

  //   /**
  //    * ==========================================
  //    * MAP ACHIEVEMENTS
  //    * ==========================================
  //    */
  //   for (const achievement of achievements) {
  //     const current = categoryMap.get(achievement._id) || {
  //       categoryId: achievement._id,
  //       category: achievement.category || 'Unknown',

  //       targetCases: 0,
  //       targetTonnage: 0,
  //       targetValue: 0,

  //       achievementCases: 0,
  //       achievementTonnage: 0,
  //       achievementValue: 0,
  //     };

  //     current.achievementCases = Number(achievement.achievementCases || 0);

  //     /**
  //      * Already converted from KG to tonnage in aggregation.
  //      */
  //     current.achievementTonnage = Number(achievement.achievementTonnage || 0);

  //     current.achievementValue = Number(achievement.achievementValue || 0);

  //     categoryMap.set(achievement._id, current);
  //   }

  //   /**
  //    * ==========================================
  //    * FINAL DATA
  //    * ==========================================
  //    */
  //   const data = Array.from(categoryMap.values()).map((item) => {
  //     const remainingCases = Math.max(
  //       item.targetCases - item.achievementCases,
  //       0,
  //     );

  //     const remainingTonnage = Math.max(
  //       item.targetTonnage - item.achievementTonnage,
  //       0,
  //     );

  //     const remainingValue = Math.max(
  //       item.targetValue - item.achievementValue,
  //       0,
  //     );

  //     const achievementPercentage =
  //       item.targetCases > 0
  //         ? Number(
  //             ((item.achievementCases / item.targetCases) * 100).toFixed(2),
  //           )
  //         : 0;

  //     const tonnageAchievementPercentage =
  //       item.targetTonnage > 0
  //         ? Number(
  //             ((item.achievementTonnage / item.targetTonnage) * 100).toFixed(2),
  //           )
  //         : 0;

  //     const valueAchievementPercentage =
  //       item.targetValue > 0
  //         ? Number(
  //             ((item.achievementValue / item.targetValue) * 100).toFixed(2),
  //           )
  //         : 0;

  //     return {
  //       categoryId: item.categoryId,
  //       category: item.category,

  //       targetCases: Number(item.targetCases.toFixed(2)),
  //       achievementCases: Number(item.achievementCases.toFixed(2)),
  //       remainingCases: Number(remainingCases.toFixed(2)),

  //       targetTonnage: Number(item.targetTonnage.toFixed(3)),
  //       achievementTonnage: Number(item.achievementTonnage.toFixed(3)),
  //       remainingTonnage: Number(remainingTonnage.toFixed(3)),

  //       targetValue: Number(item.targetValue.toFixed(2)),
  //       achievementValue: Number(item.achievementValue.toFixed(2)),
  //       remainingValue: Number(remainingValue.toFixed(2)),

  //       achievementPercentage,
  //       tonnageAchievementPercentage,
  //       valueAchievementPercentage,

  //       hasTarget:
  //         item.targetCases > 0 ||
  //         item.targetTonnage > 0 ||
  //         item.targetValue > 0,
  //     };
  //   });

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'User primary category targets fetched successfully',
  //     data: data.sort((a, b) => b.achievementCases - a.achievementCases),
  //   };
  // }

  // async getSpecialTargetSummary(
  //   targetType: 'UBO' | 'FOCUSED_PACK',
  //   date?: string,
  // ) {
  //   const managerId = RequestContextStore.getStore()?.userId;
  //   const now = date ? parseCalendarDate(date) : new Date();
  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );
  //   const endDate = now;
  //   const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });
  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: `${targetType} target summary fetched successfully`,
  //       data: [],
  //     };
  //   }

  //   const achievementPipeline: any[] = [
  //     {
  //       $match: {
  //         status: SaleStatus.COMPLETED,
  //         date: { $gte: startDate, $lte: endDate },
  //         'employees.employeeId': { $in: employeeIds },
  //       },
  //     },
  //     { $unwind: '$employees' },
  //     { $match: { 'employees.employeeId': { $in: employeeIds } } },
  //     {
  //       $lookup: {
  //         from: 'sale_items',
  //         localField: 'saleId',
  //         foreignField: 'saleId',
  //         as: 'items',
  //       },
  //     },
  //     { $unwind: '$items' },
  //     {
  //       $lookup: {
  //         from: 'product_master',
  //         localField: 'items.productId',
  //         foreignField: 'productId',
  //         as: 'product',
  //       },
  //     },
  //     { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
  //   ];

  //   if (targetType === 'FOCUSED_PACK') {
  //     achievementPipeline.push({ $match: { 'product.isFocusedPack': 'Y' } });
  //   }

  //   achievementPipeline.push({
  //     $group: {
  //       _id: {
  //         employeeId: '$employees.employeeId',
  //         dimensionId:
  //           targetType === 'FOCUSED_PACK'
  //             ? '$product.productId'
  //             : { $ifNull: ['$product.parentCategoryId', '$items.categoryId'] },
  //       },
  //       achievementCases: { $sum: { $ifNull: ['$items.netCases', 0] } },
  //       achievementTonnage: { $sum: { $ifNull: ['$items.totalNetWeight', 0] } },
  //       achievementValue: { $sum: { $ifNull: ['$items.totalValue', 0] } },
  //     },
  //   });

  //   const specialTargetModel =
  //     targetType === 'FOCUSED_PACK'
  //       ? this.focusedPackTargetModel
  //       : this.targetModel;
  //   const dimensionField =
  //     targetType === 'FOCUSED_PACK' ? '$productId' : '$categoryId';
  //   const targetCasesField =
  //     targetType === 'FOCUSED_PACK' ? '$targetCases' : '$uboTarget';
  //   const specialTargetMatch = {
  //     userId: { $in: employeeIds },
  //     startDate: { $lte: endDate },
  //     endDate: { $gte: startDate },
  //     ...(targetType === 'UBO' ? { uboTarget: { $gt: 0 } } : {}),
  //   };

  //   const [targets, achievements] = await Promise.all([
  //     specialTargetModel.aggregate([
  //       {
  //         $match: specialTargetMatch,
  //       },
  //       {
  //         $group: {
  //           _id: { userId: '$userId', dimensionId: dimensionField },
  //           targetCases: { $sum: targetCasesField },
  //           targetTonnage: {
  //             $sum: targetType === 'FOCUSED_PACK' ? '$targetTonnage' : 0,
  //           },
  //           targetValue: {
  //             $sum: targetType === 'FOCUSED_PACK' ? '$targetValue' : 0,
  //           },
  //         },
  //       },
  //     ]),
  //     this.saleModal.aggregate(achievementPipeline),
  //   ]);

  //   const targetsByUser = new Map<string, any>();
  //   for (const target of targets) {
  //     const current = targetsByUser.get(target._id.userId) || {
  //       categories: new Set<string>(),
  //       targetCases: 0,
  //       targetTonnage: 0,
  //       targetValue: 0,
  //     };
  //     current.categories.add(target._id.dimensionId);
  //     current.targetCases += Number(target.targetCases || 0);
  //     current.targetTonnage += Number(target.targetTonnage || 0);
  //     current.targetValue += Number(target.targetValue || 0);
  //     targetsByUser.set(target._id.userId, current);
  //   }

  //   const achievementsByUser = new Map<string, any>();
  //   for (const achievement of achievements) {
  //     const target = targetsByUser.get(achievement._id.employeeId);
  //     if (!target?.categories.has(achievement._id.dimensionId)) continue;
  //     const current = achievementsByUser.get(achievement._id.employeeId) || {
  //       achievementCases: 0,
  //       achievementTonnage: 0,
  //       achievementValue: 0,
  //     };
  //     current.achievementCases += Number(achievement.achievementCases || 0);
  //     current.achievementTonnage += Number(achievement.achievementTonnage || 0);
  //     current.achievementValue += Number(achievement.achievementValue || 0);
  //     achievementsByUser.set(achievement._id.employeeId, current);
  //   }

  //   const elapsedDays = Math.max(
  //     Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
  //     1,
  //   );
  //   const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);
  //   const round = (value: number) => Number(value.toFixed(2));

  //   const data = employees.map((employee) => {
  //     const target = targetsByUser.get(employee.employeeId) || {};
  //     const achievement = achievementsByUser.get(employee.employeeId) || {};
  //     const targetCases = Number(target.targetCases || 0);
  //     const targetTonnage = Number(target.targetTonnage || 0);
  //     const targetValue = Number(target.targetValue || 0);
  //     const achievementCases = Number(achievement.achievementCases || 0);
  //     const achievementTonnage = Number(achievement.achievementTonnage || 0);
  //     const achievementValue = Number(achievement.achievementValue || 0);
  //     const remainingCases = Math.max(targetCases - achievementCases, 0);

  //     return {
  //       employeeId: employee.employeeId,
  //       employeeName: employee.name,
  //       targetCases: round(targetCases),
  //       achievementCases: round(achievementCases),
  //       remainingCases: round(remainingCases),
  //       targetTonnage: round(targetTonnage),
  //       achievementTonnage: round(achievementTonnage),
  //       remainingTonnage: round(
  //         Math.max(targetTonnage - achievementTonnage, 0),
  //       ),
  //       targetValue: round(targetValue),
  //       achievementValue: round(achievementValue),
  //       remainingValue: round(Math.max(targetValue - achievementValue, 0)),
  //       achievementPercentage:
  //         targetCases > 0 ? round((achievementCases / targetCases) * 100) : 0,
  //       rrr: round(remainingCases / remainingDays),
  //       crr: round(achievementCases / elapsedDays),
  //       hasTarget: targetCases > 0 || targetTonnage > 0 || targetValue > 0,
  //     };
  //   });

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: `${targetType} target summary fetched successfully`,
  //     data: data.sort((a, b) => b.achievementCases - a.achievementCases),
  //   };
  // }

  async getUserPrimaryCategoryTarget(query: {
    employeeId: string;
    date?: string;
  }) {
    if (!query.employeeId) {
      throw new BadRequestException('Employee ID is required');
    }

    const now = query?.date ? parseCalendarDate(query.date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const [targets, achievements] = await Promise.all([
      /**
       * ==========================================
       * TARGETS BY PARENT CATEGORY
       * ==========================================
       */
      this.targetModel.aggregate([
        {
          $match: {
            userId: query.employeeId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
          },
        },
        {
          $group: {
            /**
             * IMPORTANT:
             * Parent category wise grouping
             */
            _id: '$parentCategoryId',

            category: {
              $first: '$parentCategory',
            },

            targetCases: {
              $sum: {
                $ifNull: ['$targetCases', 0],
              },
            },

            targetTonnage: {
              $sum: {
                $ifNull: ['$targetTonnage', 0],
              },
            },

            targetValue: {
              $sum: {
                $ifNull: ['$targetValue', 0],
              },
            },
          },
        },
      ]),

      /**
       * ==========================================
       * ACHIEVEMENTS BY PARENT CATEGORY
       * ==========================================
       */
      this.saleModal
        .aggregate([
          {
            $match: {
              'employees.employeeId': query.employeeId,
              status: SaleStatus.COMPLETED,
              date: {
                $gte: startDate,
                $lte: endDate,
              },
            },
          },
          {
            $lookup: {
              from: 'sale_items',
              let: {
                saleId: '$saleId',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$saleId', '$$saleId'],
                    },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    parentCategoryId: 1,
                    caseQty: 1,
                    pieceQty: 1,
                    unitQtyInCase: 1,
                    totalNetWeight: 1,
                    totalValue: 1,
                  },
                },
              ],
              as: 'items',
            },
          },
          {
            $unwind: '$items',
          },
          {
            $lookup: {
              from: 'productcategories',
              localField: 'items.parentCategoryId',
              foreignField: 'categoryId',
              as: 'category',
            },
          },
          {
            $unwind: {
              path: '$category',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $group: {
              /**
               * IMPORTANT:
               * Parent category wise achievement
               */
              _id: {
                $ifNull: ['$items.parentCategoryId', 'UNKNOWN'],
              },

              category: {
                $first: {
                  $ifNull: ['$category.name', 'Unknown'],
                },
              },

              achievementCases: {
                $sum: {
                  $add: [
                    {
                      $ifNull: ['$items.caseQty', 0],
                    },
                    {
                      $cond: [
                        {
                          $gt: ['$items.unitQtyInCase', 0],
                        },
                        {
                          $divide: [
                            {
                              $ifNull: ['$items.pieceQty', 0],
                            },
                            '$items.unitQtyInCase',
                          ],
                        },
                        0,
                      ],
                    },
                  ],
                },
              },

              /**
               * totalNetWeight is KG.
               * Convert KG to tonnage.
               */
              achievementTonnage: {
                $sum: {
                  $divide: [
                    {
                      $ifNull: ['$items.totalNetWeight', 0],
                    },
                    1000,
                  ],
                },
              },

              achievementValue: {
                $sum: {
                  $ifNull: ['$items.totalValue', 0],
                },
              },
            },
          },
        ])
        .allowDiskUse(true),
    ]);

    const categoryMap = new Map<string, any>();

    /**
     * ==========================================
     * MAP TARGETS
     * ==========================================
     */
    for (const target of targets) {
      const categoryId = target._id || 'UNKNOWN';

      categoryMap.set(categoryId, {
        categoryId,
        category: target.category || 'Unknown',

        targetCases: Number(target.targetCases || 0),
        targetTonnage: Number(target.targetTonnage || 0),
        targetValue: Number(target.targetValue || 0),

        achievementCases: 0,
        achievementTonnage: 0,
        achievementValue: 0,
      });
    }

    /**
     * ==========================================
     * MAP ACHIEVEMENTS
     * ==========================================
     */
    for (const achievement of achievements) {
      const categoryId = achievement._id || 'UNKNOWN';

      const current = categoryMap.get(categoryId) || {
        categoryId,
        category: achievement.category || 'Unknown',

        targetCases: 0,
        targetTonnage: 0,
        targetValue: 0,

        achievementCases: 0,
        achievementTonnage: 0,
        achievementValue: 0,
      };

      current.achievementCases = Number(achievement.achievementCases || 0);
      current.achievementTonnage = Number(achievement.achievementTonnage || 0);
      current.achievementValue = Number(achievement.achievementValue || 0);

      categoryMap.set(categoryId, current);
    }

    /**
     * ==========================================
     * FINAL DATA
     * ==========================================
     */
    const data = Array.from(categoryMap.values()).map((item) => {
      const remainingCases = Math.max(
        item.targetCases - item.achievementCases,
        0,
      );

      const remainingTonnage = Math.max(
        item.targetTonnage - item.achievementTonnage,
        0,
      );

      const remainingValue = Math.max(
        item.targetValue - item.achievementValue,
        0,
      );

      const achievementPercentage =
        item.targetCases > 0
          ? Number(
              ((item.achievementCases / item.targetCases) * 100).toFixed(2),
            )
          : 0;

      const tonnageAchievementPercentage =
        item.targetTonnage > 0
          ? Number(
              ((item.achievementTonnage / item.targetTonnage) * 100).toFixed(2),
            )
          : 0;

      const valueAchievementPercentage =
        item.targetValue > 0
          ? Number(
              ((item.achievementValue / item.targetValue) * 100).toFixed(2),
            )
          : 0;

      return {
        /**
         * This is parentCategoryId now.
         */
        categoryId: item.categoryId,

        /**
         * This is parentCategory name now.
         */
        category: item.category,

        targetCases: Number(item.targetCases.toFixed(2)),
        achievementCases: Number(item.achievementCases.toFixed(2)),
        remainingCases: Number(remainingCases.toFixed(2)),

        targetTonnage: Number(item.targetTonnage.toFixed(3)),
        achievementTonnage: Number(item.achievementTonnage.toFixed(3)),
        remainingTonnage: Number(remainingTonnage.toFixed(3)),

        targetValue: Number(item.targetValue.toFixed(2)),
        achievementValue: Number(item.achievementValue.toFixed(2)),
        remainingValue: Number(remainingValue.toFixed(2)),

        achievementPercentage,
        tonnageAchievementPercentage,
        valueAchievementPercentage,

        hasTarget:
          item.targetCases > 0 ||
          item.targetTonnage > 0 ||
          item.targetValue > 0,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'User primary category targets fetched successfully',
      data: data.sort((a, b) => b.achievementCases - a.achievementCases),
    };
  }

  async getSpecialTargetSummary(
    targetType: 'UBO' | 'FOCUSED_PACK',
    date?: string,
  ) {
    const managerId = RequestContextStore.getStore()?.userId;

    if (!managerId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = date ? parseCalendarDate(date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter(Boolean);

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: `${targetType} target summary fetched successfully`,
        data: [],
      };
    }

    const elapsedDays = Math.max(
      Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1,
      1,
    );

    const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);

    const round = (value: number, digits = 2) => Number(value.toFixed(digits));

    /**
     * =====================================================
     * UBO TARGET SUMMARY
     * =====================================================
     *
     * UBO = Unique Billed Outlets
     *
     * UBO Target:
     * Sum of uboTarget from target collection user-wise.
     *
     * UBO Achievement:
     * Count of unique billed customerId from completed sales user-wise.
     *
     * No category, no cases, no tonnage, no value.
     */
    if (targetType === 'UBO') {
      const [targets, achievements] = await Promise.all([
        /**
         * =====================================================
         * UBO TARGET USER-WISE
         * =====================================================
         */
        this.targetModel.aggregate([
          {
            $match: {
              userId: {
                $in: employeeIds,
              },
              uboTarget: {
                $gt: 0,
              },
              startDate: {
                $lte: endDate,
              },
              endDate: {
                $gte: startDate,
              },
            },
          },
          {
            $group: {
              _id: '$userId',

              target: {
                $sum: {
                  $ifNull: ['$uboTarget', 0],
                },
              },
            },
          },
        ]),

        /**
         * =====================================================
         * UBO ACHIEVEMENT USER-WISE
         * =====================================================
         *
         * Unique billed outlet = distinct customerId from completed sales.
         */
        this.saleModal.aggregate([
          {
            $match: {
              status: SaleStatus.COMPLETED,
              date: {
                $gte: startDate,
                $lte: endDate,
              },
              'employees.employeeId': {
                $in: employeeIds,
              },
              customerId: {
                $ne: null,
              },
            },
          },
          {
            $unwind: '$employees',
          },
          {
            $match: {
              'employees.employeeId': {
                $in: employeeIds,
              },
            },
          },
          {
            $group: {
              _id: '$employees.employeeId',

              uniqueBilledOutlets: {
                $addToSet: '$customerId',
              },
            },
          },
          {
            $project: {
              _id: 1,

              achievement: {
                $size: '$uniqueBilledOutlets',
              },
            },
          },
        ]),
      ]);

      const targetMap = new Map<string, any>(
        targets.map((item) => [item._id, item]),
      );

      const achievementMap = new Map<string, any>(
        achievements.map((item) => [item._id, item]),
      );

      const data = employees.map((employee) => {
        const employeeId = employee.employeeId;

        const targetData = targetMap.get(employeeId) || {};
        const achievementData = achievementMap.get(employeeId) || {};

        const target = Number(targetData.target || 0);
        const achievement = Number(achievementData.achievement || 0);
        const remaining = Math.max(target - achievement, 0);

        const percentage = target > 0 ? round((achievement / target) * 100) : 0;

        const crr = elapsedDays > 0 ? achievement / elapsedDays : 0;
        const rrr = remainingDays > 0 ? remaining / remainingDays : 0;

        return {
          employeeId,
          employeeName: employee.name,

          /**
           * UBO count fields only
           */
          target: round(target, 0),
          achievement: round(achievement, 0),
          remaining: round(remaining, 0),
          percentage,

          /**
           * CRR/RRR based on billed outlet count
           */
          crr: round(crr),
          rrr: round(rrr),

          elapsedDays,
          remainingDays,

          hasTarget: target > 0,
        };
      });

      return {
        statusCode: HttpStatus.OK,
        message: `${targetType} target summary fetched successfully`,
        data: data.sort((a, b) => b.achievement - a.achievement),
      };
    }

    /**
     * =====================================================
     * FOCUSED PACK TARGET SUMMARY
     * =====================================================
     *
     * Focused pack uses:
     * - cases
     * - tonnage
     * - value
     */
    const [targets, achievements] = await Promise.all([
      this.focusedPackTargetModel.aggregate([
        {
          $match: {
            userId: {
              $in: employeeIds,
            },
            startDate: {
              $lte: endDate,
            },
            endDate: {
              $gte: startDate,
            },
          },
        },
        {
          $group: {
            _id: {
              userId: '$userId',
              dimensionId: '$productId',
            },

            targetCases: {
              $sum: {
                $ifNull: ['$targetCases', 0],
              },
            },

            targetTonnage: {
              $sum: {
                $ifNull: ['$targetTonnage', 0],
              },
            },

            targetValue: {
              $sum: {
                $ifNull: ['$targetValue', 0],
              },
            },
          },
        },
      ]),

      this.saleModal
        .aggregate([
          {
            $match: {
              status: SaleStatus.COMPLETED,
              date: {
                $gte: startDate,
                $lte: endDate,
              },
              'employees.employeeId': {
                $in: employeeIds,
              },
            },
          },
          {
            $unwind: '$employees',
          },
          {
            $match: {
              'employees.employeeId': {
                $in: employeeIds,
              },
            },
          },
          {
            $lookup: {
              from: 'sale_items',
              let: {
                saleId: '$saleId',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$saleId', '$$saleId'],
                    },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    productId: 1,
                    netCases: 1,
                    caseQty: 1,
                    pieceQty: 1,
                    unitQtyInCase: 1,
                    totalNetWeight: 1,
                    totalValue: 1,
                  },
                },
              ],
              as: 'items',
            },
          },
          {
            $unwind: '$items',
          },
          {
            $match: {
              'items.productId': {
                $ne: null,
              },
            },
          },
          {
            $group: {
              _id: {
                employeeId: '$employees.employeeId',
                dimensionId: '$items.productId',
              },

              achievementCases: {
                $sum: {
                  $ifNull: [
                    '$items.netCases',
                    {
                      $add: [
                        {
                          $ifNull: ['$items.caseQty', 0],
                        },
                        {
                          $cond: [
                            {
                              $gt: ['$items.unitQtyInCase', 0],
                            },
                            {
                              $divide: [
                                {
                                  $ifNull: ['$items.pieceQty', 0],
                                },
                                '$items.unitQtyInCase',
                              ],
                            },
                            0,
                          ],
                        },
                      ],
                    },
                  ],
                },
              },

              /**
               * totalNetWeight is KG.
               * Convert KG to tonnage.
               */
              achievementTonnage: {
                $sum: {
                  $divide: [
                    {
                      $ifNull: ['$items.totalNetWeight', 0],
                    },
                    1000,
                  ],
                },
              },

              achievementValue: {
                $sum: {
                  $ifNull: ['$items.totalValue', 0],
                },
              },
            },
          },
        ])
        .allowDiskUse(true),
    ]);

    const targetsByUser = new Map<string, any>();

    for (const target of targets) {
      const userId = target._id?.userId;
      const dimensionId = target._id?.dimensionId;

      if (!userId || !dimensionId) continue;

      const current = targetsByUser.get(userId) || {
        dimensions: new Set<string>(),
        targetCases: 0,
        targetTonnage: 0,
        targetValue: 0,
      };

      current.dimensions.add(dimensionId);
      current.targetCases += Number(target.targetCases || 0);
      current.targetTonnage += Number(target.targetTonnage || 0);
      current.targetValue += Number(target.targetValue || 0);

      targetsByUser.set(userId, current);
    }

    const achievementsByUser = new Map<string, any>();

    for (const achievement of achievements) {
      const employeeId = achievement._id?.employeeId;
      const dimensionId = achievement._id?.dimensionId;

      if (!employeeId || !dimensionId) continue;

      const target = targetsByUser.get(employeeId);

      /**
       * Count only products that have focused pack target.
       */
      if (!target?.dimensions?.has(dimensionId)) continue;

      const current = achievementsByUser.get(employeeId) || {
        achievementCases: 0,
        achievementTonnage: 0,
        achievementValue: 0,
      };

      current.achievementCases += Number(achievement.achievementCases || 0);
      current.achievementTonnage += Number(achievement.achievementTonnage || 0);
      current.achievementValue += Number(achievement.achievementValue || 0);

      achievementsByUser.set(employeeId, current);
    }

    const data = employees.map((employee) => {
      const target = targetsByUser.get(employee.employeeId) || {};
      const achievement = achievementsByUser.get(employee.employeeId) || {};

      const targetCases = Number(target.targetCases || 0);
      const targetTonnage = Number(target.targetTonnage || 0);
      const targetValue = Number(target.targetValue || 0);

      const achievementCases = Number(achievement.achievementCases || 0);
      const achievementTonnage = Number(achievement.achievementTonnage || 0);
      const achievementValue = Number(achievement.achievementValue || 0);

      const remainingCases = Math.max(targetCases - achievementCases, 0);
      const remainingTonnage = Math.max(targetTonnage - achievementTonnage, 0);
      const remainingValue = Math.max(targetValue - achievementValue, 0);

      const achievementPercentage =
        targetCases > 0 ? round((achievementCases / targetCases) * 100) : 0;

      const tonnageAchievementPercentage =
        targetTonnage > 0
          ? round((achievementTonnage / targetTonnage) * 100)
          : 0;

      const valueAchievementPercentage =
        targetValue > 0 ? round((achievementValue / targetValue) * 100) : 0;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.name,

        targetCases: round(targetCases),
        achievementCases: round(achievementCases),
        remainingCases: round(remainingCases),

        targetTonnage: round(targetTonnage, 3),
        achievementTonnage: round(achievementTonnage, 3),
        remainingTonnage: round(remainingTonnage, 3),

        targetValue: round(targetValue),
        achievementValue: round(achievementValue),
        remainingValue: round(remainingValue),

        achievementPercentage,
        tonnageAchievementPercentage,
        valueAchievementPercentage,

        crr: round(achievementCases / elapsedDays),
        rrr: round(remainingCases / remainingDays),

        elapsedDays,
        remainingDays,

        hasTarget: targetCases > 0 || targetTonnage > 0 || targetValue > 0,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: `${targetType} target summary fetched successfully`,
      data: data.sort((a, b) => b.achievementCases - a.achievementCases),
    };
  }

  async getUserUboTargetBreakdown(query: {
    employeeId: string;
    date?: string;
  }) {
    if (!query.employeeId) {
      throw new BadRequestException('Employee ID is required');
    }

    const now = query.date ? parseCalendarDate(query.date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const elapsedDays = Math.max(
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
      1,
    );

    const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);

    const [targetResult, uniqueBilledOutletIds] = await Promise.all([
      /**
       * ==========================================
       * UBO TARGET
       * ==========================================
       *
       * Sum uboTarget from target collection.
       */
      this.targetModel.aggregate([
        {
          $match: {
            userId: query.employeeId,
            uboTarget: {
              $gt: 0,
            },
            startDate: {
              $lte: endDate,
            },
            endDate: {
              $gte: startDate,
            },
          },
        },
        {
          $group: {
            _id: null,
            target: {
              $sum: {
                $ifNull: ['$uboTarget', 0],
              },
            },
          },
        },
      ]),

      /**
       * ==========================================
       * UBO ACHIEVEMENT
       * ==========================================
       *
       * Faster than aggregation.
       * Directly gets unique customerId from completed sales.
       */
      this.saleModal.distinct('customerId', {
        'employees.employeeId': query.employeeId,
        status: SaleStatus.COMPLETED,
        date: {
          $gte: startDate,
          $lte: endDate,
        },
        customerId: {
          $nin: [null, ''],
        },
      }),
    ]);

    const targetValue = Number(targetResult?.[0]?.target || 0);
    const achievementValue = uniqueBilledOutletIds.length;

    const remainingValue = Math.max(targetValue - achievementValue, 0);

    const percentage =
      targetValue > 0
        ? Number(((achievementValue / targetValue) * 100).toFixed(2))
        : 0;

    const crr = elapsedDays > 0 ? achievementValue / elapsedDays : 0;
    const rrr = remainingDays > 0 ? remainingValue / remainingDays : 0;

    return {
      statusCode: HttpStatus.OK,
      message: 'User UBO target breakdown fetched successfully',
      data: [
        {
          categoryId: 'UBO',
          category: 'Unique Billed Outlets',

          target: Number(targetValue.toFixed(0)),
          achievement: Number(achievementValue.toFixed(0)),
          remaining: Number(remainingValue.toFixed(0)),

          percentage,

          crr: Number(crr.toFixed(2)),
          rrr: Number(rrr.toFixed(2)),

          elapsedDays,
          remainingDays,
        },
      ],
    };
  }

  // async getUserFocusedPackTargetBreakdown(query: {
  //   employeeId: string;
  //   date?: string;
  // }) {
  //   const now = query.date ? parseCalendarDate(query.date) : new Date();
  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );
  //   const [targets, achievements] = await Promise.all([
  //     this.focusedPackTargetModel.aggregate([
  //       {
  //         $match: {
  //           userId: query.employeeId,
  //           startDate: { $lte: now },
  //           endDate: { $gte: startDate },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: '$productId',
  //           productName: { $first: '$productName' },
  //           targetCases: { $sum: '$targetCases' },
  //           targetTonnage: { $sum: '$targetTonnage' },
  //           targetValue: { $sum: '$targetValue' },
  //         },
  //       },
  //     ]),
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           status: SaleStatus.COMPLETED,
  //           date: { $gte: startDate, $lte: now },
  //           'employees.employeeId': query.employeeId,
  //         },
  //       },
  //       { $unwind: '$employees' },
  //       { $match: { 'employees.employeeId': query.employeeId } },
  //       {
  //         $lookup: {
  //           from: 'sale_items',
  //           localField: 'saleId',
  //           foreignField: 'saleId',
  //           as: 'items',
  //         },
  //       },
  //       { $unwind: '$items' },
  //       {
  //         $lookup: {
  //           from: 'product_master',
  //           localField: 'items.productId',
  //           foreignField: 'productId',
  //           as: 'product',
  //         },
  //       },
  //       { $unwind: '$product' },
  //       { $match: { 'product.isFocusedPack': 'Y' } },
  //       {
  //         $group: {
  //           _id: '$product.productId',
  //           achievementCases: { $sum: { $ifNull: ['$items.netCases', 0] } },
  //           achievementTonnage: {
  //             $sum: { $ifNull: ['$items.totalNetWeight', 0] },
  //           },
  //           achievementValue: { $sum: { $ifNull: ['$items.totalValue', 0] } },
  //         },
  //       },
  //     ]),
  //   ]);
  //   const achievementMap = new Map(
  //     achievements.map((item) => [item._id, item]),
  //   );
  //   const round = (value: unknown) => Number(Number(value || 0).toFixed(2));
  //   const data = targets.map((target) => {
  //     const achievement = achievementMap.get(target._id) || {};
  //     return {
  //       productId: target._id,
  //       productName: target.productName,
  //       targetCases: round(target.targetCases),
  //       achievementCases: round(achievement.achievementCases),
  //       targetTonnage: round(target.targetTonnage),
  //       achievementTonnage: round(achievement.achievementTonnage),
  //       targetValue: round(target.targetValue),
  //       achievementValue: round(achievement.achievementValue),
  //     };
  //   });

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'User Focused Pack target breakdown fetched successfully',
  //     data,
  //   };
  // }

  // async getManagerOrderSummary() {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   const now = new Date();

  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const endDate = now;

  //   /* ==========================================
  //    * TEAM MEMBERS
  //    * ========================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager order summary fetched successfully',
  //       data: {
  //         primaryCategoryWiseOrder: {
  //           totalCases: 0,
  //           categories: [],
  //         },
  //         managerOrderSummary: {
  //           orders: 0,
  //           validation: 0,
  //         },
  //         outletSummary: {
  //           upc: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           zeroOrder: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           notVisited: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           total: {
  //             count: 0,
  //             percentage: 100,
  //           },
  //           productivity: {
  //             pc: 0,
  //             tc: 0,
  //             percentage: 0,
  //           },
  //         },
  //       },
  //     };
  //   }

  //   /* ==========================================
  //    * TEAM VANS
  //    * ========================================== */
  //   const vans = await this.vanModel.find(
  //     {
  //       associatedUsers: {
  //         $in: employeeIds,
  //       },
  //       status: VanStatus.ACTIVE,
  //     },
  //     {
  //       vanId: 1,
  //       associatedRoutes: 1,
  //     },
  //   );

  //   /* ==========================================
  //    * ROUTES FROM VANS
  //    * ========================================== */
  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || []).map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   /* ==========================================
  //    * ASSIGNED OUTLETS
  //    * ========================================== */
  //   const assignedCustomerIds = await this.routeCustomerMappingModel.distinct(
  //     'customerId',
  //     {
  //       routeId: {
  //         $in: routeIds,
  //       },
  //       status: RouteCustomerMappingStatus.ACTIVE,
  //     },
  //   );

  //   const totalAssignedOutlets = assignedCustomerIds.length;

  //   /* ==========================================
  //    * DASHBOARD DATA
  //    * ========================================== */
  //   const [
  //     categoryTargets,
  //     managerOrders,
  //     visitedCustomers,
  //     productiveCustomers,
  //   ] = await Promise.all([
  //     /* ======================================
  //      * PRIMARY CATEGORY WISE ORDER
  //      * ====================================== */
  //     this.targetModel.aggregate([
  //       {
  //         $match: {
  //           userId: {
  //             $in: employeeIds,
  //           },
  //           status: TargetStatus.ACTIVE,
  //           startDate: {
  //             $lte: endDate,
  //           },
  //           endDate: {
  //             $gte: startDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: '$categoryId',
  //           category: {
  //             $first: '$category',
  //           },
  //           cases: {
  //             $sum: '$achievedCases',
  //           },
  //         },
  //       },
  //       {
  //         $sort: {
  //           cases: -1,
  //         },
  //       },
  //     ]),

  //     /* ======================================
  //      * MANAGER ORDER SUMMARY
  //      * ====================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,
  //           orders: {
  //             $sum: '$salesCases', // replace with totalCases if not added yet
  //           },
  //           validation: {
  //             $sum: '$salesCases',
  //           },
  //         },
  //       },
  //     ]),

  //     /* ======================================
  //      * TOTAL CALLS (TC)
  //      * ====================================== */
  //     this.shopVisitModel.distinct('customerId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     /* ======================================
  //      * PRODUCTIVE CALLS (PC)
  //      * ====================================== */
  //     this.saleModal.distinct('customerId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: SaleStatus.COMPLETED,
  //       date: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),
  //   ]);

  //   /* ==========================================
  //    * CATEGORY SUMMARY
  //    * ========================================== */
  //   const totalCases = categoryTargets.reduce(
  //     (sum, item) => sum + item.cases,
  //     0,
  //   );

  //   const categories = categoryTargets.map((item) => ({
  //     categoryId: item._id,
  //     category: item.category,
  //     cases: Number(item.cases || 0),
  //     percentage:
  //       totalCases > 0 ? Math.round((item.cases / totalCases) * 100) : 0,
  //   }));

  //   /* ==========================================
  //    * OUTLET SUMMARY
  //    * ========================================== */
  //   const tc = visitedCustomers.length;

  //   const pc = productiveCustomers.length;

  //   const zeroOrder = Math.max(tc - pc, 0);

  //   const notVisited = Math.max(totalAssignedOutlets - tc, 0);

  //   const productivity = tc > 0 ? Number(((pc / tc) * 100).toFixed(2)) : 0;

  //   const managerOrder = managerOrders?.[0] || {
  //     orders: 0,
  //     validation: 0,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager order summary fetched successfully',
  //     data: {
  //       primaryCategoryWiseOrder: {
  //         totalCases: Number(totalCases.toFixed(2)),
  //         categories,
  //       },

  //       managerOrderSummary: {
  //         orders: Number(managerOrder.orders || 0),
  //         validation: Number(managerOrder.validation || 0),
  //       },

  //       outletSummary: {
  //         upc: {
  //           count: pc,
  //           percentage: productivity,
  //         },

  //         zeroOrder: {
  //           count: zeroOrder,
  //           percentage: tc > 0 ? Math.round((zeroOrder / tc) * 100) : 0,
  //         },

  //         notVisited: {
  //           count: notVisited,
  //           percentage:
  //             totalAssignedOutlets > 0
  //               ? Math.round((notVisited / totalAssignedOutlets) * 100)
  //               : 0,
  //         },

  //         total: {
  //           count: totalAssignedOutlets,
  //           percentage: 100,
  //         },

  //         productivity: {
  //           pc,
  //           tc,
  //           percentage: productivity,
  //         },
  //       },
  //     },
  //   };
  // }

  // async getManagerOrderSummary(query?: {
  //   date?: string;
  //   startDate?: string;
  //   endDate?: string;
  // }) {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   const now = new Date();

  //   const startDate = query?.startDate
  //     ? parseCalendarDate(query.startDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : new Date(now.getFullYear(), now.getMonth(), 1);
  //   startDate.setHours(0, 0, 0, 0);

  //   const endDate = query?.endDate
  //     ? parseCalendarDate(query.endDate)
  //     : query?.date
  //       ? parseCalendarDate(query.date)
  //       : now;
  //   endDate.setHours(23, 59, 59, 999);

  //   /* ==========================================
  //    * TEAM MEMBERS
  //    * ========================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Manager order summary fetched successfully',
  //       data: {
  //         primaryCategoryWiseOrder: {
  //           totalCases: 0,
  //           totalTonnage: 0,
  //           totalValue: 0,
  //           categories: [],
  //         },

  //         managerOrderSummary: {
  //           orders: 0,
  //           validation: 0,
  //           orderCases: 0,
  //           orderTonnage: 0,
  //           orderValue: 0,
  //           validationCases: 0,
  //           validationTonnage: 0,
  //           validationValue: 0,
  //         },

  //         outletSummary: {
  //           utc: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //           upc: {
  //             count: 0,
  //             percentage: 0,
  //           },

  //           zeroOrder: {
  //             count: 0,
  //             percentage: 0,
  //           },

  //           notVisited: {
  //             count: 0,
  //             percentage: 0,
  //           },

  //           total: {
  //             count: 0,
  //             percentage: 100,
  //           },

  //           productivity: {
  //             pc: 0,
  //             tc: 0,
  //             percentage: 0,
  //           },
  //           ordered: {
  //             count: 0,
  //             percentage: 0,
  //           },
  //         },
  //       },
  //     };
  //   }

  //   /* ==========================================
  //    * TEAM VANS
  //    * ========================================== */
  //   const vans = await this.vanModel.find(
  //     {
  //       associatedUsers: {
  //         $in: employeeIds,
  //       },
  //       status: VanStatus.ACTIVE,
  //     },
  //     {
  //       vanId: 1,
  //       associatedRoutes: 1,
  //     },
  //   );

  //   /* ==========================================
  //    * ROUTES
  //    * ========================================== */
  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || [])
  //           .filter((route) => {
  //             const fromDate = route.fromDate ? new Date(route.fromDate) : null;
  //             const toDate = route.toDate ? new Date(route.toDate) : null;

  //             return (
  //               route.routeId &&
  //               (!fromDate || fromDate <= endDate) &&
  //               (!toDate || toDate >= startDate)
  //             );
  //           })
  //           .map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   /* ==========================================
  //    * ASSIGNED OUTLETS
  //    * ========================================== */
  //   const assignedCustomerIds = await this.routeCustomerMappingModel.distinct(
  //     'customerId',
  //     {
  //       routeId: {
  //         $in: routeIds,
  //       },
  //       status: RouteCustomerMappingStatus.ACTIVE,
  //       effectiveFrom: {
  //         $lte: endDate,
  //       },
  //       $or: [
  //         { effectiveTo: null },
  //         { effectiveTo: { $exists: false } },
  //         { effectiveTo: { $gte: startDate } },
  //       ],
  //     },
  //   );

  //   const totalAssignedOutlets = assignedCustomerIds.length;

  //   /* ==========================================
  //    * DASHBOARD DATA
  //    * ========================================== */
  //   const [
  //     categoryTargets,
  //     managerOrders,
  //     visitedCustomers,
  //     productiveCustomers,
  //     totalCalls,
  //     productiveCalls,
  //     zeroOrderOutlets,
  //   ] = await Promise.all([
  //     /* ======================================
  //      * PRIMARY CATEGORY WISE ORDER
  //      * ====================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: 'sale_items',
  //           localField: 'saleId',
  //           foreignField: 'saleId',
  //           as: 'items',
  //         },
  //       },
  //       {
  //         $unwind: '$items',
  //       },
  //       {
  //         $lookup: {
  //           from: 'product_master',
  //           localField: 'items.productId',
  //           foreignField: 'productId',
  //           as: 'product',
  //         },
  //       },
  //       {
  //         $unwind: {
  //           path: '$product',
  //           preserveNullAndEmptyArrays: true,
  //         },
  //       },
  //       {
  //         $lookup: {
  //           from: 'productcategories',
  //           localField: 'product.parentCategoryId',
  //           foreignField: 'categoryId',
  //           as: 'category',
  //         },
  //       },
  //       {
  //         $unwind: {
  //           path: '$category',
  //           preserveNullAndEmptyArrays: true,
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $ifNull: ['$product.parentCategoryId', 'UNKNOWN'],
  //           },

  //           category: {
  //             $first: {
  //               $ifNull: ['$category.name', 'Unknown'],
  //             },
  //           },

  //           cases: {
  //             $sum: {
  //               $add: [
  //                 {
  //                   $ifNull: ['$items.caseQty', 0],
  //                 },
  //                 {
  //                   $cond: [
  //                     {
  //                       $gt: ['$items.unitQtyInCase', 0],
  //                     },
  //                     {
  //                       $divide: [
  //                         {
  //                           $ifNull: ['$items.pieceQty', 0],
  //                         },
  //                         '$items.unitQtyInCase',
  //                       ],
  //                     },
  //                     0,
  //                   ],
  //                 },
  //               ],
  //             },
  //           },

  //           tonnage: {
  //             $sum: {
  //               $ifNull: ['$items.totalNetWeight', 0],
  //             },
  //           },

  //           value: {
  //             $sum: {
  //               $ifNull: ['$items.totalValue', 0],
  //             },
  //           },
  //         },
  //       },
  //       {
  //         $sort: {
  //           cases: -1,
  //         },
  //       },
  //     ]),

  //     /* ======================================
  //      * MANAGER ORDER SUMMARY
  //      * ====================================== */
  //     this.saleModal.aggregate([
  //       {
  //         $match: {
  //           employeeId: {
  //             $in: employeeIds,
  //           },
  //           status: SaleStatus.COMPLETED,
  //           date: {
  //             $gte: startDate,
  //             $lte: endDate,
  //           },
  //         },
  //       },
  //       {
  //         $group: {
  //           _id: null,

  //           orders: {
  //             $sum: '$netCases',
  //           },

  //           validation: {
  //             $sum: '$totalValue',
  //           },

  //           orderCases: {
  //             $sum: '$netCases',
  //           },

  //           orderTonnage: {
  //             $sum: '$totalWeight',
  //           },

  //           orderValue: {
  //             $sum: '$totalValue',
  //           },

  //           validationCases: {
  //             $sum: '$netCases',
  //           },

  //           validationTonnage: {
  //             $sum: '$totalWeight',
  //           },

  //           validationValue: {
  //             $sum: '$totalValue',
  //           },
  //         },
  //       },
  //     ]),

  //     /* ======================================
  //      * TOTAL CALLS (TC)
  //      * ====================================== */
  //     this.shopVisitModel.distinct('outletId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       outletId: {
  //         $in: assignedCustomerIds,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //       checkInTime: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     /* ======================================
  //      * UNIQUE PRODUCTIVE OUTLETS (UPC)
  //      * ====================================== */
  //     this.saleModal.distinct('customerId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: SaleStatus.COMPLETED,
  //       date: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     /* ======================================
  //      * TOTAL CALLS (TC)
  //      * ====================================== */
  //     this.shopVisitModel.countDocuments({
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: ShopVisitStatus.COMPLETED,
  //       checkInTime: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     /* ======================================
  //      * PRODUCTIVE CALLS (PC)
  //      * ====================================== */
  //     this.saleModal.countDocuments({
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: SaleStatus.COMPLETED,
  //       date: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),

  //     /* ======================================
  //      * ZERO ORDER OUTLETS
  //      * ====================================== */
  //     this.nonSaleModel.distinct('outletId', {
  //       employeeId: {
  //         $in: employeeIds,
  //       },
  //       status: NonSaleStatus.COMPLETED,
  //       createdAt: {
  //         $gte: startDate,
  //         $lte: endDate,
  //       },
  //     }),
  //   ]);

  //   /* ==========================================
  //    * CATEGORY SUMMARY
  //    * ========================================== */
  //   const totalCases = categoryTargets.reduce(
  //     (sum, item) => sum + item.cases,
  //     0,
  //   );

  //   const totalTonnage = categoryTargets.reduce(
  //     (sum, item) => sum + item.tonnage,
  //     0,
  //   );

  //   const totalValue = categoryTargets.reduce(
  //     (sum, item) => sum + item.value,
  //     0,
  //   );

  //   const categories = categoryTargets.map((item) => ({
  //     categoryId: item._id,
  //     category: item.category,
  //     cases: Number((item.cases || 0).toFixed(2)),
  //     tonnage: Number((item.tonnage || 0).toFixed(2)),
  //     value: Number((item.value || 0).toFixed(2)),

  //     percentage:
  //       totalCases > 0 ? Math.round((item.cases / totalCases) * 100) : 0,
  //     tonnagePercentage:
  //       totalTonnage > 0 ? Math.round((item.tonnage / totalTonnage) * 100) : 0,
  //     valuePercentage:
  //       totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0,
  //   }));

  //   /* ==========================================
  //    * OUTLET SUMMARY
  //    * ========================================== */
  //   const tc = visitedCustomers.length;

  //   const upc = productiveCustomers.length;

  //   const zeroOrder = zeroOrderOutlets.length;

  //   const notVisited = Math.max(totalAssignedOutlets - tc, 0);

  //   const productivity =
  //     totalCalls > 0
  //       ? Number(((productiveCalls / totalCalls) * 100).toFixed(2))
  //       : 0;

  //   const managerOrder = managerOrders?.[0] || {
  //     orders: 0,
  //     validation: 0,
  //     orderCases: 0,
  //     orderTonnage: 0,
  //     orderValue: 0,
  //     validationCases: 0,
  //     validationTonnage: 0,
  //     validationValue: 0,
  //   };

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Manager order summary fetched successfully',

  //     data: {
  //       primaryCategoryWiseOrder: {
  //         totalCases: Number(totalCases.toFixed(2)),
  //         totalTonnage: Number(totalTonnage.toFixed(2)),
  //         totalValue: Number(totalValue.toFixed(2)),

  //         categories,
  //       },

  //       managerOrderSummary: {
  //         orders: Number(managerOrder.orders || 0),

  //         validation: Number(managerOrder.validation || 0),
  //         orderCases: Number(managerOrder.orderCases || 0),
  //         orderTonnage: Number(managerOrder.orderTonnage || 0),
  //         orderValue: Number(managerOrder.orderValue || 0),
  //         validationCases: Number(managerOrder.validationCases || 0),
  //         validationTonnage: Number(managerOrder.validationTonnage || 0),
  //         validationValue: Number(managerOrder.validationValue || 0),
  //       },

  //       outletSummary: {
  //         utc: {
  //           count: tc,
  //           percentage:
  //             totalAssignedOutlets > 0
  //               ? Number(((tc / totalAssignedOutlets) * 100).toFixed(2))
  //               : 0,
  //         },
  //         upc: {
  //           count: upc,
  //           percentage:
  //             totalAssignedOutlets > 0
  //               ? Number(((upc / totalAssignedOutlets) * 100).toFixed(2))
  //               : 0,
  //         },

  //         zeroOrder: {
  //           count: zeroOrder,

  //           percentage:
  //             tc > 0 ? Number(((zeroOrder / tc) * 100).toFixed(2)) : 0,
  //         },

  //         notVisited: {
  //           count: notVisited,

  //           percentage:
  //             totalAssignedOutlets > 0
  //               ? Number(((notVisited / totalAssignedOutlets) * 100).toFixed(2))
  //               : 0,
  //         },

  //         total: {
  //           count: totalAssignedOutlets,
  //           percentage: 100,
  //         },

  //         productivity: {
  //           pc: productiveCalls,
  //           tc: totalCalls,
  //           percentage: productivity,
  //         },
  //         ordered: {
  //           count: upc,
  //           percentage:
  //             totalAssignedOutlets > 0
  //               ? Number(((upc / totalAssignedOutlets) * 100).toFixed(2))
  //               : 0,
  //         },
  //       },
  //     },
  //   };
  // }

  async getUserFocusedPackTargetBreakdown(query: {
    employeeId: string;
    date?: string;
  }) {
    if (!query.employeeId) {
      throw new BadRequestException('Employee ID is required');
    }

    const now = query.date ? parseCalendarDate(query.date) : new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);

    const monthEndDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    const elapsedDays = Math.max(
      Math.floor(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1,
      1,
    );

    const remainingDays = Math.max(monthEndDate.getDate() - elapsedDays, 1);

    const round = (value: unknown, digits = 2) =>
      Number(Number(value || 0).toFixed(digits));

    /**
     * =====================================================
     * STEP 1: GET FOCUSED PACK TARGETS FIRST
     * =====================================================
     */
    const targets = await this.focusedPackTargetModel.aggregate([
      {
        $match: {
          userId: query.employeeId,
          startDate: {
            $lte: endDate,
          },
          endDate: {
            $gte: startDate,
          },
        },
      },
      {
        $group: {
          _id: '$productId',

          productName: {
            $first: '$productName',
          },

          targetCases: {
            $sum: {
              $ifNull: ['$targetCases', 0],
            },
          },

          targetTonnage: {
            $sum: {
              $ifNull: ['$targetTonnage', 0],
            },
          },

          targetValue: {
            $sum: {
              $ifNull: ['$targetValue', 0],
            },
          },
        },
      },
    ]);

    const targetProductIds = targets
      .map((target) => target._id)
      .filter(Boolean);

    if (!targetProductIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'User Focused Pack target breakdown fetched successfully',
        data: [],
      };
    }

    /**
     * =====================================================
     * STEP 2: GET ACHIEVEMENTS FROM SALE ITEMS
     * =====================================================
     *
     * Faster approach:
     * - Start from sale_items
     * - Match only focused target productIds
     * - Lookup sales only for those sale items
     */
    const achievements = await this.saleItemModel
      .aggregate([
        {
          $match: {
            productId: {
              $in: targetProductIds,
            },
          },
        },
        {
          $lookup: {
            from: 'sales',
            let: {
              saleId: '$saleId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$saleId', '$$saleId'],
                  },
                  status: SaleStatus.COMPLETED,
                  date: {
                    $gte: startDate,
                    $lte: endDate,
                  },
                  'employees.employeeId': query.employeeId,
                },
              },
              {
                $project: {
                  _id: 0,
                  saleId: 1,
                },
              },
            ],
            as: 'sale',
          },
        },
        {
          $unwind: '$sale',
        },
        {
          $group: {
            _id: '$productId',

            achievementCases: {
              $sum: {
                $ifNull: [
                  '$netCases',
                  {
                    $add: [
                      {
                        $ifNull: ['$caseQty', 0],
                      },
                      {
                        $cond: [
                          {
                            $gt: ['$unitQtyInCase', 0],
                          },
                          {
                            $divide: [
                              {
                                $ifNull: ['$pieceQty', 0],
                              },
                              '$unitQtyInCase',
                            ],
                          },
                          0,
                        ],
                      },
                    ],
                  },
                ],
              },
            },

            /**
             * totalNetWeight is KG.
             * Convert KG to tonnage.
             */
            achievementTonnage: {
              $sum: {
                $divide: [
                  {
                    $ifNull: ['$totalNetWeight', 0],
                  },
                  1000,
                ],
              },
            },

            achievementValue: {
              $sum: {
                $ifNull: ['$totalValue', 0],
              },
            },
          },
        },
      ])
      .allowDiskUse(true);

    const achievementMap = new Map<string, any>(
      achievements.map((item) => [item._id, item]),
    );

    const data = targets.map((target) => {
      const achievement = achievementMap.get(target._id) || {};

      const targetCases = Number(target.targetCases || 0);
      const achievementCases = Number(achievement.achievementCases || 0);
      const remainingCases = Math.max(targetCases - achievementCases, 0);

      const targetTonnage = Number(target.targetTonnage || 0);
      const achievementTonnage = Number(achievement.achievementTonnage || 0);
      const remainingTonnage = Math.max(targetTonnage - achievementTonnage, 0);

      const targetValue = Number(target.targetValue || 0);
      const achievementValue = Number(achievement.achievementValue || 0);
      const remainingValue = Math.max(targetValue - achievementValue, 0);

      const achievementPercentage =
        targetCases > 0
          ? Number(((achievementCases / targetCases) * 100).toFixed(2))
          : 0;

      const tonnageAchievementPercentage =
        targetTonnage > 0
          ? Number(((achievementTonnage / targetTonnage) * 100).toFixed(2))
          : 0;

      const valueAchievementPercentage =
        targetValue > 0
          ? Number(((achievementValue / targetValue) * 100).toFixed(2))
          : 0;

      const crr = elapsedDays > 0 ? achievementCases / elapsedDays : 0;
      const rrr = remainingDays > 0 ? remainingCases / remainingDays : 0;

      return {
        productId: target._id,
        productName: target.productName,

        targetCases: round(targetCases),
        achievementCases: round(achievementCases),
        remainingCases: round(remainingCases),

        targetTonnage: round(targetTonnage, 3),
        achievementTonnage: round(achievementTonnage, 3),
        remainingTonnage: round(remainingTonnage, 3),

        targetValue: round(targetValue),
        achievementValue: round(achievementValue),
        remainingValue: round(remainingValue),

        achievementPercentage,
        tonnageAchievementPercentage,
        valueAchievementPercentage,

        crr: round(crr),
        rrr: round(rrr),

        elapsedDays,
        remainingDays,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'User Focused Pack target breakdown fetched successfully',
      data: data.sort((a, b) => b.achievementCases - a.achievementCases),
    };
  }

  async getManagerOrderSummary(query?: {
    date?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const managerId = RequestContextStore.getStore()?.userId;

    if (!managerId) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    const now = new Date();

    const startDate = query?.startDate
      ? parseCalendarDate(query.startDate)
      : query?.date
        ? parseCalendarDate(query.date)
        : new Date(now.getFullYear(), now.getMonth(), 1);

    startDate.setHours(0, 0, 0, 0);

    const endDate = query?.endDate
      ? parseCalendarDate(query.endDate)
      : query?.date
        ? parseCalendarDate(query.date)
        : now;

    endDate.setHours(23, 59, 59, 999);

    const emptyResponse = {
      statusCode: HttpStatus.OK,
      message: 'Manager order summary fetched successfully',
      data: {
        primaryCategoryWiseOrder: {
          totalCases: 0,
          totalTonnage: 0,
          totalValue: 0,
          categories: [],
        },

        managerOrderSummary: {
          orders: 0,
          validation: 0,
          orderCases: 0,
          orderTonnage: 0,
          orderValue: 0,
          validationCases: 0,
          validationTonnage: 0,
          validationValue: 0,
        },

        outletSummary: {
          utc: {
            count: 0,
            percentage: 0,
          },
          upc: {
            count: 0,
            percentage: 0,
          },
          zeroOrder: {
            count: 0,
            percentage: 0,
          },
          notVisited: {
            count: 0,
            percentage: 0,
          },
          total: {
            count: 0,
            percentage: 100,
          },
          productivity: {
            pc: 0,
            tc: 0,
            percentage: 0,
          },
          ordered: {
            count: 0,
            percentage: 0,
          },
        },
      },
    };

    /**
     * ==========================================
     * TEAM MEMBERS
     * ==========================================
     */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds = employees
      .map((employee) => employee.employeeId)
      .filter(Boolean);

    if (!employeeIds.length) {
      return emptyResponse;
    }

    /**
     * ==========================================
     * TEAM VANS → ROUTES
     * ==========================================
     */
    const vans = await this.vanModel
      .find(
        {
          associatedUsers: {
            $in: employeeIds,
          },
          status: VanStatus.ACTIVE,
        },
        {
          vanId: 1,
          associatedRoutes: 1,
          _id: 0,
        },
      )
      .lean();

    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || [])
            .filter((route) => {
              const fromDate = route.fromDate ? new Date(route.fromDate) : null;
              const toDate = route.toDate ? new Date(route.toDate) : null;

              return (
                route.routeId &&
                (!fromDate || fromDate <= endDate) &&
                (!toDate || toDate >= startDate)
              );
            })
            .map((route) => route.routeId)
            .filter(Boolean),
        ),
      ),
    ];

    /**
     * ==========================================
     * ASSIGNED OUTLETS
     * ==========================================
     */
    const assignedCustomerIds = routeIds.length
      ? await this.routeCustomerMappingModel.distinct('customerId', {
          routeId: {
            $in: routeIds,
          },
          status: RouteCustomerMappingStatus.ACTIVE,
          effectiveFrom: {
            $lte: endDate,
          },
          $or: [
            { effectiveTo: null },
            { effectiveTo: { $exists: false } },
            { effectiveTo: { $gte: startDate } },
          ],
        })
      : [];

    const totalAssignedOutlets = assignedCustomerIds.length;

    /**
     * Common sale match.
     *
     * IMPORTANT:
     * Sale schema has employees array.
     * Use employees.employeeId, not employeeId.
     */
    const saleMatch = {
      'employees.employeeId': {
        $in: employeeIds,
      },
      status: SaleStatus.COMPLETED,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    };

    /**
     * ==========================================
     * DASHBOARD DATA
     * ==========================================
     */
    const [
      categoryTargets,
      managerOrders,
      visitSummaryResult,
      zeroOrderOutlets,
    ] = await Promise.all([
      /**
       * ======================================
       * PRIMARY CATEGORY WISE ORDER
       * ======================================
       *
       * Optimized:
       * - Removed product_master lookup.
       * - sale_items already has parentCategoryId.
       * - Lookup productcategories directly by items.parentCategoryId.
       * - Convert KG to tonnage using / 1000.
       */
      this.saleModal
        .aggregate([
          {
            $match: saleMatch,
          },
          {
            $lookup: {
              from: 'sale_items',
              let: {
                saleId: '$saleId',
              },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$saleId', '$$saleId'],
                    },
                  },
                },
                {
                  $project: {
                    _id: 0,
                    parentCategoryId: 1,
                    caseQty: 1,
                    pieceQty: 1,
                    unitQtyInCase: 1,
                    totalNetWeight: 1,
                    totalValue: 1,
                  },
                },
              ],
              as: 'items',
            },
          },
          {
            $unwind: '$items',
          },
          {
            $lookup: {
              from: 'productcategories',
              localField: 'items.parentCategoryId',
              foreignField: 'categoryId',
              as: 'category',
            },
          },
          {
            $unwind: {
              path: '$category',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $group: {
              _id: {
                $ifNull: ['$items.parentCategoryId', 'UNKNOWN'],
              },

              category: {
                $first: {
                  $ifNull: ['$category.name', 'Unknown'],
                },
              },

              cases: {
                $sum: {
                  $add: [
                    {
                      $ifNull: ['$items.caseQty', 0],
                    },
                    {
                      $cond: [
                        {
                          $gt: ['$items.unitQtyInCase', 0],
                        },
                        {
                          $divide: [
                            {
                              $ifNull: ['$items.pieceQty', 0],
                            },
                            '$items.unitQtyInCase',
                          ],
                        },
                        0,
                      ],
                    },
                  ],
                },
              },

              /**
               * totalNetWeight is KG, convert to tonnage.
               */
              tonnage: {
                $sum: {
                  $divide: [
                    {
                      $ifNull: ['$items.totalNetWeight', 0],
                    },
                    1000,
                  ],
                },
              },

              value: {
                $sum: {
                  $ifNull: ['$items.totalValue', 0],
                },
              },
            },
          },
          {
            $sort: {
              cases: -1,
            },
          },
        ])
        .allowDiskUse(true),

      /**
       * ======================================
       * MANAGER ORDER SUMMARY
       * ======================================
       *
       * Fixed sale employee filter.
       * order count = number of completed sales.
       * tonnage = KG / 1000.
       */
      this.saleModal.aggregate([
        {
          $match: saleMatch,
        },
        {
          $group: {
            _id: null,

            /**
             * Orders should be count of orders, not netCases.
             */
            orders: {
              $sum: 1,
            },

            /**
             * Keep validation same as order count unless you have
             * separate validation collection/status.
             */
            validation: {
              $sum: 1,
            },

            orderCases: {
              $sum: {
                $ifNull: ['$netCases', 0],
              },
            },

            orderTonnage: {
              $sum: {
                $divide: [
                  {
                    $ifNull: ['$totalWeight', 0],
                  },
                  1000,
                ],
              },
            },

            orderValue: {
              $sum: {
                $ifNull: ['$totalValue', 0],
              },
            },

            validationCases: {
              $sum: {
                $ifNull: ['$netCases', 0],
              },
            },

            validationTonnage: {
              $sum: {
                $divide: [
                  {
                    $ifNull: ['$totalWeight', 0],
                  },
                  1000,
                ],
              },
            },

            validationValue: {
              $sum: {
                $ifNull: ['$totalValue', 0],
              },
            },

            productiveOutletIds: {
              $addToSet: '$customerId',
            },
          },
        },
      ]),

      /**
       * ======================================
       * VISITS SUMMARY
       * ======================================
       *
       * Optimized:
       * - distinct visited outlets + total calls in one query.
       */
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId: {
              $in: employeeIds,
            },
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startDate,
              $lte: endDate,
            },
            ...(assignedCustomerIds.length
              ? {
                  outletId: {
                    $in: assignedCustomerIds,
                  },
                }
              : {}),
          },
        },
        {
          $group: {
            _id: null,
            totalCalls: {
              $sum: 1,
            },
            visitedOutletIds: {
              $addToSet: '$outletId',
            },
          },
        },
      ]),

      /**
       * ======================================
       * ZERO ORDER OUTLETS
       * ======================================
       */
      this.nonSaleModel.distinct('outletId', {
        employeeId: {
          $in: employeeIds,
        },
        status: NonSaleStatus.COMPLETED,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
        ...(assignedCustomerIds.length
          ? {
              outletId: {
                $in: assignedCustomerIds,
              },
            }
          : {}),
      }),
    ]);

    /**
     * ==========================================
     * CATEGORY SUMMARY
     * ==========================================
     */
    const totalCases = categoryTargets.reduce(
      (sum, item) => sum + Number(item.cases || 0),
      0,
    );

    const totalTonnage = categoryTargets.reduce(
      (sum, item) => sum + Number(item.tonnage || 0),
      0,
    );

    const totalValue = categoryTargets.reduce(
      (sum, item) => sum + Number(item.value || 0),
      0,
    );

    const categories = categoryTargets.map((item) => ({
      categoryId: item._id,
      category: item.category,
      cases: Number((item.cases || 0).toFixed(2)),
      tonnage: Number((item.tonnage || 0).toFixed(3)),
      value: Number((item.value || 0).toFixed(2)),

      percentage:
        totalCases > 0
          ? Math.round((Number(item.cases || 0) / totalCases) * 100)
          : 0,

      tonnagePercentage:
        totalTonnage > 0
          ? Math.round((Number(item.tonnage || 0) / totalTonnage) * 100)
          : 0,

      valuePercentage:
        totalValue > 0
          ? Math.round((Number(item.value || 0) / totalValue) * 100)
          : 0,
    }));

    /**
     * ==========================================
     * ORDER SUMMARY
     * ==========================================
     */
    const managerOrder = managerOrders?.[0] || {
      orders: 0,
      validation: 0,
      orderCases: 0,
      orderTonnage: 0,
      orderValue: 0,
      validationCases: 0,
      validationTonnage: 0,
      validationValue: 0,
      productiveOutletIds: [],
    };

    const visitSummary = visitSummaryResult?.[0] || {
      totalCalls: 0,
      visitedOutletIds: [],
    };

    /**
     * ==========================================
     * OUTLET SUMMARY
     * ==========================================
     */
    const visitedOutletIds = (visitSummary.visitedOutletIds || []).filter(
      Boolean,
    );
    const productiveOutletIds = (managerOrder.productiveOutletIds || []).filter(
      Boolean,
    );
    const zeroOrderOutletIds = (zeroOrderOutlets || []).filter(Boolean);

    /**
     * UTC = unique visited outlets.
     */
    const utc = visitedOutletIds.length;

    /**
     * UPC = unique productive outlets.
     */
    const upc = productiveOutletIds.length;

    /**
     * TC = total shop visits/calls.
     */
    const totalCalls = Number(visitSummary.totalCalls || 0);

    /**
     * PC = productive calls/orders.
     */
    const productiveCalls = Number(managerOrder.orders || 0);

    /**
     * Zero order should be outlets with non-sale,
     * excluding outlets that already placed order.
     */
    const productiveOutletSet = new Set(productiveOutletIds);
    const zeroOrder = zeroOrderOutletIds.filter(
      (outletId) => !productiveOutletSet.has(outletId),
    ).length;

    const notVisited = Math.max(totalAssignedOutlets - utc, 0);

    const productivity =
      totalCalls > 0
        ? Number(((productiveCalls / totalCalls) * 100).toFixed(2))
        : 0;

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager order summary fetched successfully',

      data: {
        primaryCategoryWiseOrder: {
          totalCases: Number(totalCases.toFixed(2)),
          totalTonnage: Number(totalTonnage.toFixed(3)),
          totalValue: Number(totalValue.toFixed(2)),
          categories,
        },

        managerOrderSummary: {
          orders: Number(managerOrder.orders || 0),

          validation: Number(managerOrder.validation || 0),

          orderCases: Number((managerOrder.orderCases || 0).toFixed(2)),
          orderTonnage: Number((managerOrder.orderTonnage || 0).toFixed(3)),
          orderValue: Number((managerOrder.orderValue || 0).toFixed(2)),

          validationCases: Number(
            (managerOrder.validationCases || 0).toFixed(2),
          ),
          validationTonnage: Number(
            (managerOrder.validationTonnage || 0).toFixed(3),
          ),
          validationValue: Number(
            (managerOrder.validationValue || 0).toFixed(2),
          ),
        },

        outletSummary: {
          utc: {
            count: utc,
            percentage:
              totalAssignedOutlets > 0
                ? Number(((utc / totalAssignedOutlets) * 100).toFixed(2))
                : 0,
          },

          upc: {
            count: upc,
            percentage:
              totalAssignedOutlets > 0
                ? Number(((upc / totalAssignedOutlets) * 100).toFixed(2))
                : 0,
          },

          zeroOrder: {
            count: zeroOrder,
            percentage:
              totalCalls > 0
                ? Number(((zeroOrder / totalCalls) * 100).toFixed(2))
                : 0,
          },

          notVisited: {
            count: notVisited,
            percentage:
              totalAssignedOutlets > 0
                ? Number(((notVisited / totalAssignedOutlets) * 100).toFixed(2))
                : 0,
          },

          total: {
            count: totalAssignedOutlets,
            percentage: 100,
          },

          productivity: {
            pc: productiveCalls,
            tc: totalCalls,
            percentage: productivity,
          },

          ordered: {
            count: upc,
            percentage:
              totalAssignedOutlets > 0
                ? Number(((upc / totalAssignedOutlets) * 100).toFixed(2))
                : 0,
          },
        },
      },
    };
  }

  // async getTeamCoverage() {
  //   const managerId = RequestContextStore.getStore()?.userId;

  //   const now = new Date();

  //   const startDate = new Date(
  //     now.getFullYear(),
  //     now.getMonth(),
  //     1,
  //     0,
  //     0,
  //     0,
  //     0,
  //   );

  //   const endDate = now;

  //   /* ==========================================
  //    * TEAM MEMBERS
  //    * ========================================== */
  //   const employees = await this.find({
  //     $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
  //     status: UserStatus.ACTIVE,
  //   });

  //   const employeeIds = employees.map((employee) => employee.employeeId);

  //   if (!employeeIds.length) {
  //     return {
  //       statusCode: HttpStatus.OK,
  //       message: 'Team coverage fetched successfully',
  //       data: {
  //         users: 0,
  //         vans: 0,
  //         warehouse: 0,
  //         routes: 0,
  //         outlets: 0,
  //         outletsPlanned: 0,
  //         upc: 0,
  //         utc: 0,
  //         uic: 0,
  //       },
  //     };
  //   }

  //   /* ==========================================
  //    * TEAM VANS
  //    * ========================================== */
  //   const vans = await this.vanModel.find(
  //     {
  //       associatedUsers: {
  //         $in: employeeIds,
  //       },
  //       status: VanStatus.ACTIVE,
  //     },
  //     {
  //       associatedRoutes: 1,
  //       warehouseId: 1,
  //     },
  //   );

  //   /* ==========================================
  //    * ROUTES
  //    * ========================================== */
  //   const routeIds = [
  //     ...new Set(
  //       vans.flatMap((van) =>
  //         (van.associatedRoutes || []).map((route) => route.routeId),
  //       ),
  //     ),
  //   ];

  //   const visitedBeatIds = await this.routeSessionModel.distinct('routeId', {
  //     userId: {
  //       $in: employeeIds,
  //     },
  //     routeId: {
  //       $in: routeIds,
  //     },
  //     sessionDate: {
  //       $gte: startDate,
  //       $lte: endDate,
  //     },
  //   });

  //   /* ==========================================
  //    * WAREHOUSES
  //    * ========================================== */
  //   const warehouseIds = [];

  //   /* ==========================================
  //    * ASSIGNED OUTLETS
  //    * ========================================== */
  //   const assignedCustomerIds = await this.routeCustomerMappingModel.distinct(
  //     'customerId',
  //     {
  //       routeId: {
  //         $in: routeIds,
  //       },
  //       status: RouteCustomerMappingStatus.ACTIVE,
  //     },
  //   );

  //   const outlets = assignedCustomerIds.length;

  //   /* ==========================================
  //    * UTC (UNIQUE VISITED OUTLETS)
  //    * ========================================== */
  //   const visitedOutletIds = await this.shopVisitModel.distinct('outletId', {
  //     employeeId: {
  //       $in: employeeIds,
  //     },
  //     status: ShopVisitStatus.COMPLETED,
  //     checkInTime: {
  //       $gte: startDate,
  //       $lte: endDate,
  //     },
  //   });

  //   const utc = visitedOutletIds.length;

  //   /* ==========================================
  //    * UPC (UNIQUE PRODUCTIVE OUTLETS)
  //    * ========================================== */
  //   const productiveCustomerIds = await this.saleModal.distinct('customerId', {
  //     employeeId: {
  //       $in: employeeIds,
  //     },
  //     status: SaleStatus.COMPLETED,
  //     date: {
  //       $gte: startDate,
  //       $lte: endDate,
  //     },
  //   });

  //   const upc = productiveCustomerIds.length;

  //   /* ==========================================
  //    * OUTLETS PLANNED
  //    * ========================================== */
  //   const plannedCustomerIds = visitedBeatIds.length
  //     ? await this.routeCustomerMappingModel.distinct('customerId', {
  //         routeId: {
  //           $in: visitedBeatIds,
  //         },
  //         status: RouteCustomerMappingStatus.ACTIVE,
  //       })
  //     : [];

  //   const outletsPlanned = plannedCustomerIds.length;

  //   return {
  //     statusCode: HttpStatus.OK,
  //     message: 'Team coverage fetched successfully',
  //     data: {
  //       users: employeeIds.length,
  //       vans: vans.length,
  //       warehouse: warehouseIds.length,
  //       routes: routeIds.length,
  //       outlets,
  //       outletsPlanned,
  //       upc,
  //       utc,
  //       uic: upc,
  //     },
  //   };
  // }

  async getTeamCoverage() {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    /* ==========================================
     * TEAM MEMBERS (DIRECT + INDIRECT)
     * ========================================== */
    const employeeIds: any = await this.model.distinct('employeeId', {
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    employeeIds.push(managerId); // Include manager themselves

    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Team coverage fetched successfully',
        data: {
          users: 0,
          vans: 0,
          warehouse: 0,
          routes: 0,
          outlets: 0,
          outletsPlanned: 0,
          upc: 0,
          utc: 0,
          uic: 0,
          userList: [],
          vanList: [],
          outletList: [],
          plannedOutletList: [],
        },
      };
    }

    const teamEmployeeIds = employeeIds.filter(
      (employeeId: string) => employeeId !== managerId,
    );

    const users = teamEmployeeIds.length
      ? await this.model.find(
          {
            employeeId: { $in: teamEmployeeIds },
            status: UserStatus.ACTIVE,
          },
          {
            employeeId: 1,
            name: 1,
            mobile: 1,
            designationId: 1,
          },
          { lean: true },
        )
      : [];

    /* ==========================================
     * ASSIGNED VANS
     * ========================================== */
    const vans = await this.vanModel.find(
      {
        associatedUsers: { $in: employeeIds },
        status: VanStatus.ACTIVE,
      },
      {
        vanId: 1,
        name: 1,
        vanNumber: 1,
        driverName: 1,
        capacity: 1,
        warehouseId: 1,
        associatedUsers: 1,
        associatedRoutes: 1,
      },
      { lean: true },
    );

    const vanIds = vans.map((v: any) => v.vanId);

    /* ==========================================
     * WAREHOUSES
     * ========================================== */
    const warehouseIds = [
      ...new Set(vans.map((v: any) => v.warehouseId).filter(Boolean)),
    ];

    /* ==========================================
     * ROUTES FROM ASSIGNED VANS
     * ========================================== */
    const routeIds = [
      ...new Set(
        vans.flatMap((van: any) =>
          (van.associatedRoutes || []).map((route: any) => route.routeId),
        ),
      ),
    ];

    console.log(routeIds, 'routeIds');
    /* ==========================================
     * ASSIGNED OUTLETS
     * ========================================== */
    const assignedCustomerIds =
      routeIds.length > 0
        ? await this.routeCustomerMappingModel.distinct('customerId', {
            routeId: { $in: routeIds },
            status: RouteCustomerMappingStatus.ACTIVE,
          })
        : [];

    const outlets = assignedCustomerIds.length;

    const assignedOutlets = assignedCustomerIds.length
      ? await this.customerModel.find(
          {
            customerId: { $in: assignedCustomerIds },
          },
          {
            customerId: 1,
            name: 1,
            ownerName: 1,
            phoneNumber: 1,
            marketId: 1,
            segmentation: 1,
          },
          { lean: true },
        )
      : [];

    /* ==========================================
     * VISITED ROUTES (MTD)
     * ========================================== */
    const visitedBeatIds =
      routeIds.length > 0
        ? await this.routeSessionModel.distinct('routeId', {
            userId: { $in: employeeIds },
            routeId: { $in: routeIds },
            sessionDate: {
              $gte: startDate,
              $lte: endDate,
            },
          })
        : [];

    /* ==========================================
     * PLANNED OUTLETS
     * Only routes actually visited this month
     * ========================================== */
    const plannedCustomerIds =
      visitedBeatIds.length > 0
        ? await this.routeCustomerMappingModel.distinct('customerId', {
            routeId: { $in: visitedBeatIds },
            status: RouteCustomerMappingStatus.ACTIVE,
          })
        : [];

    const outletsPlanned = plannedCustomerIds.length;

    const plannedOutlets = plannedCustomerIds.length
      ? await this.customerModel.find(
          {
            customerId: { $in: plannedCustomerIds },
          },
          {
            customerId: 1,
            name: 1,
            ownerName: 1,
            phoneNumber: 1,
            marketId: 1,
            segmentation: 1,
          },
          { lean: true },
        )
      : [];

    /* ==========================================
     * UNIQUE VISITED OUTLETS (UTC)
     * ========================================== */
    const visitedOutletIds =
      employeeIds.length > 0
        ? await this.shopVisitModel.distinct('outletId', {
            employeeId: { $in: employeeIds },
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startDate,
              $lte: endDate,
            },
          })
        : [];

    const utc = visitedOutletIds.length;

    /* ==========================================
     * UNIQUE PRODUCTIVE OUTLETS (UPC)
     * ========================================== */
    const productiveCustomerIds =
      employeeIds.length > 0
        ? await this.saleModal.distinct('customerId', {
            employeeId: { $in: employeeIds },
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startDate,
              $lte: endDate,
            },
          })
        : [];

    const upc = productiveCustomerIds.length;

    /* ==========================================
     * UNIQUE INVOICED CUSTOMERS (UIC)
     * ========================================== */
    const uic = upc;

    return {
      statusCode: HttpStatus.OK,
      message: 'Team coverage fetched successfully',
      data: {
        users: employeeIds.length - 1, // Exclude manager themselves
        vans: vanIds.length,
        warehouse: warehouseIds.length,
        routes: routeIds.length,
        outlets,
        outletsPlanned,
        upc,
        utc,
        uic,
        userList: users.map((user: any) => ({
          employeeId: user.employeeId,
          name: user.name,
          mobile: user.mobile,
          designationId: user.designationId,
        })),
        vanList: vans.map((van: any) => ({
          vanId: van.vanId,
          name: van.name,
          vanNumber: van.vanNumber,
          driverName: van.driverName,
          capacity: van.capacity,
          warehouseId: van.warehouseId,
          associatedUsers: van.associatedUsers || [],
          routeCount: (van.associatedRoutes || []).length,
        })),
        outletList: assignedOutlets.map((outlet: any) => ({
          customerId: outlet.customerId,
          name: outlet.name,
          ownerName: outlet.ownerName,
          phoneNumber: outlet.phoneNumber,
          marketId: outlet.marketId,
          segmentation: outlet.segmentation,
        })),
        plannedOutletList: plannedOutlets.map((outlet: any) => ({
          customerId: outlet.customerId,
          name: outlet.name,
          ownerName: outlet.ownerName,
          phoneNumber: outlet.phoneNumber,
          marketId: outlet.marketId,
          segmentation: outlet.segmentation,
        })),
      },
    };
  }

  async getBeatOMeter() {
    const managerId = RequestContextStore.getStore()?.userId;

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

    const endDate = now;

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    const employeeIds: any = employees.map((employee) => employee.employeeId);

    employeeIds.push(managerId); // Include manager themselves
    if (!employeeIds.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Beat-O-Meter fetched successfully',
        data: {
          totalOutlets: 0,
          summary: {
            visitedOutlets: 0,
            orderedOutlets: 0,
            visitedPercentage: 0,
            orderedPercentage: 0,
          },
          outletTypes: [],
        },
      };
    }

    /* ==========================================
     * TEAM VANS
     * ========================================== */
    const vans = await this.vanModel.find(
      {
        associatedUsers: {
          $in: employeeIds,
        },
        status: VanStatus.ACTIVE,
      },
      {
        associatedRoutes: 1,
      },
    );

    const routeIds = [
      ...new Set(
        vans.flatMap((van) =>
          (van.associatedRoutes || []).map((route) => route.routeId),
        ),
      ),
    ];

    /* ==========================================
     * ASSIGNED CUSTOMERS
     * ========================================== */
    const customerIds = await this.routeCustomerMappingModel.distinct(
      'customerId',
      {
        routeId: {
          $in: routeIds,
        },
        status: RouteCustomerMappingStatus.ACTIVE,
      },
    );

    const customers: any = await this.customerModel.find({
      customerId: {
        $in: customerIds,
      },
    });

    /* ==========================================
     * SALES HISTORY
     * ========================================== */
    const salesHistory = await this.saleModal.aggregate([
      {
        $match: {
          customerId: {
            $in: customerIds,
          },
          status: SaleStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: '$customerId',
          lastOrderDate: {
            $max: '$date',
          },
        },
      },
    ]);

    const lastOrderMap = new Map(
      salesHistory.map((item) => [item._id, item.lastOrderDate]),
    );

    /* ==========================================
     * VISIT HISTORY
     * ========================================== */
    const visitHistory = await this.shopVisitModel.aggregate([
      {
        $match: {
          outletId: {
            $in: customerIds,
          },
          status: ShopVisitStatus.COMPLETED,
        },
      },
      {
        $group: {
          _id: '$outletId',
          lastVisitedAt: {
            $max: '$checkInTime',
          },
        },
      },
    ]);

    const lastVisitMap = new Map(
      visitHistory.map((item) => [item._id, item.lastVisitedAt]),
    );

    /* ==========================================
     * MTD VISITED
     * ========================================== */
    const visitedCustomerIds = await this.shopVisitModel.distinct('outletId', {
      employeeId: {
        $in: employeeIds,
      },
      outletId: {
        $in: customerIds,
      },
      status: ShopVisitStatus.COMPLETED,
      checkInTime: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const visitedSet = new Set(visitedCustomerIds);

    /* ==========================================
     * MTD ORDERED
     * ========================================== */
    const orderedCustomerIds = await this.saleModal.distinct('customerId', {
      employeeId: {
        $in: employeeIds,
      },
      customerId: {
        $in: customerIds,
      },
      status: SaleStatus.COMPLETED,
      date: {
        $gte: startDate,
        $lte: endDate,
      },
    });

    const orderedSet = new Set(orderedCustomerIds);

    /* ==========================================
     * BEAT-O-METER BUCKETS
     * ========================================== */
    const buckets: any = {
      NEW: [],
      ACTIVE: [],
      TO_BE_DORMANT: [],
      DORMANT: [],
      NO_ORDER: [],
      NEVER_VISITED: [],
    };

    for (const customer of customers) {
      const customerId = customer.customerId;

      const lastOrder = lastOrderMap.get(customerId);

      const lastVisited = lastVisitMap.get(customerId);

      const createdAt = customer.createdAt
        ? new Date(customer.createdAt)
        : null;
      const ageDays = createdAt
        ? Math.floor((now.getTime() - createdAt.getTime()) / 86400000)
        : Number.POSITIVE_INFINITY;

      if (ageDays <= 30) {
        buckets.NEW.push(customerId);
      }

      if (customer.status === CustomerStatus.ACTIVE) {
        buckets.ACTIVE.push(customerId);
      }

      if (!lastOrder) {
        buckets.NO_ORDER.push(customerId);
      }

      if (!lastVisited) {
        buckets.NEVER_VISITED.push(customerId);
        continue;
      }

      if (!lastOrder) {
        continue;
      }

      const orderAge = Math.floor(
        (now.getTime() - new Date(lastOrder).getTime()) / 86400000,
      );

      if (orderAge >= 60) {
        buckets.DORMANT.push(customerId);
      } else if (orderAge >= 45) {
        buckets.TO_BE_DORMANT.push(customerId);
      }
    }

    const buildRow = (label: string, customerList: string[]) => {
      const total = customerList.length;

      const visited = customerList.filter((id) => visitedSet.has(id)).length;

      const ordered = customerList.filter((id) => orderedSet.has(id)).length;

      return {
        type: label,

        total,

        mtdVisited: {
          count: visited,
          percentage:
            total > 0 ? Number(((visited / total) * 100).toFixed(1)) : 0,
        },

        mtdOrder: {
          count: ordered,
          percentage:
            total > 0 ? Number(((ordered / total) * 100).toFixed(1)) : 0,
        },
      };
    };

    const totalOutlets = customerIds.length;

    const visitedOutlets = visitedCustomerIds.length;

    const orderedOutlets = orderedCustomerIds.length;

    return {
      statusCode: HttpStatus.OK,
      message: 'Beat-O-Meter fetched successfully',
      data: {
        totalOutlets,

        summary: {
          visitedOutlets,
          orderedOutlets,
          visitedPercentage:
            totalOutlets > 0
              ? Number(((visitedOutlets / totalOutlets) * 100).toFixed(1))
              : 0,
          orderedPercentage:
            totalOutlets > 0
              ? Number(((orderedOutlets / totalOutlets) * 100).toFixed(1))
              : 0,
        },

        outletTypes: [
          buildRow('New', buckets.NEW),
          buildRow('Active', buckets.ACTIVE),
          buildRow('To Be Dormant', buckets.TO_BE_DORMANT),
          buildRow('Dormant', buckets.DORMANT),
          buildRow('No Order', buckets.NO_ORDER),
          buildRow('Never Visited', buckets.NEVER_VISITED),
        ],
      },
    };
  }

  async getFieldUsersSummary(date?: string) {
    const managerId = RequestContextStore.getStore()?.userId;

    const startOfDay = date ? parseCalendarDate(date) : new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = date ? parseCalendarDate(date) : new Date();
    endOfDay.setHours(23, 59, 59, 999);

    /* ==========================================
     * TEAM MEMBERS
     * ========================================== */
    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });

    if (!employees.length) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Field users summary fetched successfully',
        data: [],
      };
    }

    const result = await Promise.all(
      employees.map(async (employee) => {
        /* ==========================================
         * DATE ACTIVITY
         * ========================================== */
        const [activity, leave] = await Promise.all([
          this.activityModel
            .findOne({
              userId: employee.employeeId,
              status: {
                $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
              },
              startTime: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            })
            .sort({
              startTime: -1,
            })
            .lean(),
          this.leaveModel
            .findOne({
              userId: employee.employeeId,
              status: LeaveStatus.COMPLETED,
              createdAt: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            })
            .sort({
              createdAt: -1,
            })
            .lean(),
        ]);
        const activityName = activity?.name || (leave ? 'Leave' : 'Offline');
        const isOfficialWork =
          activityName === 'Official Work' || activityName === 'Office Work';
        const isRetailing = activityName === 'Retailing';

        /* ==========================================
         * ROUTE SESSION
         * ========================================== */
        const routeSession = await this.routeSessionModel
          .findOne(
            {
              userId: employee.employeeId,
              status: {
                $in: [RouteSessionStatus.ACTIVE, RouteSessionStatus.COMPLETED],
              },
              sessionDate: {
                $gte: startOfDay,
                $lte: endOfDay,
              },
            },
            {
              routeId: 1,
              routeName: 1,
              startTime: 1,
            },
          )
          .sort({ startTime: -1 })
          .lean();
        let routeName = '-';

        if (routeSession?.routeName) {
          routeName = routeSession.routeName;
        } else if (routeSession?.routeId) {
          const route = await this.routeModel
            .findOne(
              {
                routeId: routeSession.routeId,
              },
              {
                name: 1,
              },
            )
            .lean();

          routeName = route?.name || '-';
        }

        /* ==========================================
         * FIRST CALL
         * ========================================== */
        const firstCall = await this.shopVisitModel
          .findOne({
            employeeId: employee.employeeId,
            status: ShopVisitStatus.COMPLETED,
            checkInTime: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          })
          .sort({
            checkInTime: 1,
          })
          .lean();

        /* ==========================================
         * FIRST PRODUCTIVE CALL
         * ========================================== */
        const firstPc = await this.saleModal
          .findOne({
            employeeId: employee.employeeId,
            status: SaleStatus.COMPLETED,
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          })
          .sort({
            date: 1,
          })
          .lean();

        /* ==========================================
         * TC
         * ========================================== */
        const tcCalls = await this.shopVisitModel.countDocuments({
          employeeId: employee.employeeId,
          status: ShopVisitStatus.COMPLETED,
          checkInTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        /* ==========================================
         * PC
         * ========================================== */
        const pcCalls = await this.saleModal.countDocuments({
          employeeId: employee.employeeId,
          status: SaleStatus.COMPLETED,
          date: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        /* ==========================================
         * LPC
         * LPC = Order item lines / Productive Calls
         * ========================================== */
        const saleIds = await this.saleModal.distinct('saleId', {
          employeeId: employee.employeeId,
          status: SaleStatus.COMPLETED,
          date: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        });

        const orderItemLines = saleIds.length
          ? await this.saleItemModel.countDocuments({
              saleId: {
                $in: saleIds,
              },
            })
          : 0;

        const tc = tcCalls;

        const pc = pcCalls;

        const lpc = pc > 0 ? Number((orderItemLines / pc).toFixed(1)) : 0;

        return {
          employeeId: employee.employeeId,

          employeeName: employee.name,

          mobile: employee.mobile || '',

          activity: {
            name: activityName,
            color: isOfficialWork
              ? '#6D28D9'
              : isRetailing
                ? '#22C55E'
                : leave
                  ? '#F59E0B'
                  : '#EF4444',
          },

          routeName: isOfficialWork ? 'Admin' : isRetailing ? routeName : '-',

          location:
            isRetailing || isOfficialWork ? activity?.description || '' : '',

          summary: {
            firstCallTime: firstCall?.checkInTime || null,

            firstPcTime: firstPc?.date || null,

            tc,

            pc,

            lpc,
          },
        };
      }),
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Field users summary fetched successfully',
      data: result,
    };
  }

  async getManagerLiveLocations(
    query: {
      date?: string;
      startDate?: string;
      endDate?: string;
    } = {},
  ) {
    const managerId = RequestContextStore.getStore()?.userId;
    const selectedStart = parseCalendarDate(query.startDate || query.date);
    const selectedEnd = parseCalendarDate(
      query.endDate || query.startDate || query.date,
    );
    const startOfDay = new Date(
      Math.min(selectedStart.getTime(), selectedEnd.getTime()),
    );
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(
      Math.max(selectedStart.getTime(), selectedEnd.getTime()),
    );
    endOfDay.setHours(23, 59, 59, 999);

    const employees = await this.find({
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
      status: UserStatus.ACTIVE,
    });
    const employeeIds = employees.map((employee) => employee.employeeId);

    const sessions = employeeIds.length
      ? await this.workSessionModel
          .find({
            userId: { $in: employeeIds },
            dayStartTime: { $gte: startOfDay, $lte: endOfDay },
          })
          .sort({ dayStartTime: 1 })
          .lean()
      : [];
    const sessionsByUser = new Map<string, any[]>();
    for (const session of sessions) {
      const userSessions = sessionsByUser.get(session.userId) || [];
      userSessions.push(session);
      sessionsByUser.set(session.userId, userSessions);
    }

    const sessionIds = sessions.map((session) => session.workSessionId);
    const trackedLocations = await this.liveLocationService.findForSessions(
      sessionIds,
      startOfDay,
      endOfDay,
    );
    const trackedLocationsBySession = new Map<string, any[]>();
    for (const location of trackedLocations) {
      const points =
        trackedLocationsBySession.get(location.workSessionId) || [];
      points.push(location);
      trackedLocationsBySession.set(location.workSessionId, points);
    }

    const normalizeLocation = (value?: any) => {
      const latitude = Number(value?.latitude);
      const longitude = Number(value?.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
        return null;
      return {
        latitude,
        longitude,
        accuracy: value?.accuracy ?? null,
        speed: value?.speed ?? null,
        heading: value?.heading ?? null,
        capturedAt: value?.capturedAt ?? null,
      };
    };

    const data = employees.map((employee) => {
      const userSessions = sessionsByUser.get(employee.employeeId) || [];
      const latestSession = userSessions.at(-1);
      const routePaths = userSessions
        .map((session) => {
          const dedicatedLocations =
            trackedLocationsBySession.get(session.workSessionId) || [];
          const trackedPath = dedicatedLocations
            .map(normalizeLocation)
            .filter(Boolean)
            .sort(
              (first: any, second: any) =>
                new Date(first.capturedAt || 0).getTime() -
                new Date(second.capturedAt || 0).getTime(),
            );
          return [
            normalizeLocation(session.dayStartLocation),
            ...trackedPath,
            normalizeLocation(session.dayEndLocation),
          ].filter(Boolean);
        })
        .filter((path) => path.length);
      const routePath = routePaths.flat();
      const location = routePath.at(-1) || null;

      return {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        mobile: employee.mobile || '',
        status: latestSession?.status || 'OFFLINE',
        vanId: latestSession?.vanId || null,
        vanName: latestSession?.vanName || null,
        dayStartTime: userSessions[0]?.dayStartTime || null,
        dayEndTime: latestSession?.dayEndTime || null,
        location,
        routePath,
        routePaths,
      };
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Live locations fetched successfully',
      data,
    };
  }

  async getManagerUserTimeline(query: { employeeId: string; date?: string }) {
    const managerId = RequestContextStore.getStore()?.userId;
    const selectedDate = query?.date
      ? parseCalendarDate(query.date)
      : new Date();
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const employee = await this.findOne({
      employeeId: query.employeeId,
      status: UserStatus.ACTIVE,
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
    });

    if (!employee) throw new NotFoundException(EMPLOYEE.NOT_FOUND);

    const [rawVisits, rawActivities, workSession] = await Promise.all([
      this.shopVisitModel
        .find({
          employeeId: query.employeeId,
          checkInTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        })
        .sort({ checkInTime: 1 })
        .lean(),
      this.activityModel
        .find({
          userId: query.employeeId,
          startTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
          status: {
            $in: [ActivityStatus.ACTIVE, ActivityStatus.COMPLETED],
          },
        })
        .sort({ startTime: 1 })
        .lean(),
      this.workSessionModel
        .findOne({
          userId: query.employeeId,
          dayStartTime: {
            $gte: startOfDay,
            $lte: endOfDay,
          },
        })
        .sort({ dayStartTime: 1 })
        .lean(),
    ]);

    const uniqueBy = <T>(items: T[], getKey: (item: T) => string) => {
      const seen = new Set<string>();

      return items.filter((item) => {
        const key = getKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    const visits = uniqueBy(rawVisits, (visit: any) => visit.visitId);
    const activities = uniqueBy(
      rawActivities,
      (activity: any) =>
        activity.activityId ||
        `${activity.name}-${activity.startTime}-${activity.description}`,
    );
    const visitIds = visits.map((visit) => visit.visitId);

    const [rawSales, rawNonSales] = await Promise.all([
      visitIds.length
        ? this.saleModal
            .find({
              employeeId: query.employeeId,
              visitId: { $in: visitIds },
              status: SaleStatus.COMPLETED,
            })
            .sort({ date: 1 })
            .lean()
        : [],
      visitIds.length
        ? this.nonSaleModel
            .find({
              employeeId: query.employeeId,
              visitId: { $in: visitIds },
              status: NonSaleStatus.COMPLETED,
            })
            .lean()
        : [],
    ]);

    const sales = uniqueBy(rawSales, (sale: any) => sale.saleId);
    const nonSales = uniqueBy(rawNonSales, (nonSale: any) => nonSale.nonSaleId);

    const salesByVisit = new Map<string, any>(
      sales.map((sale: any) => [sale.visitId, sale] as [string, any]),
    );
    const nonSalesByVisit = new Map<string, any>(
      nonSales.map(
        (nonSale: any) => [nonSale.visitId, nonSale] as [string, any],
      ),
    );
    const saleIds = sales.map((sale) => sale.saleId);
    const saleItems = saleIds.length
      ? await this.saleItemModel.aggregate([
          {
            $match: {
              saleId: { $in: saleIds },
            },
          },
          {
            $lookup: {
              from: 'product_master',
              localField: 'productId',
              foreignField: 'productId',
              as: 'product',
            },
          },
          {
            $unwind: {
              path: '$product',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $lookup: {
              from: 'productcategories',
              localField: 'product.parentCategoryId',
              foreignField: 'categoryId',
              as: 'category',
            },
          },
          {
            $unwind: {
              path: '$category',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              saleId: 1,
              productId: 1,
              productName: 1,
              caseQty: 1,
              pieceQty: 1,
              quantity: 1,
              casePrice: 1,
              totalValue: 1,
              totalNetWeight: 1,
              categoryId: {
                $ifNull: ['$product.parentCategoryId', 'UNKNOWN'],
              },
              categoryName: {
                $ifNull: ['$category.name', 'Unknown'],
              },
            },
          },
        ])
      : [];

    const itemsBySaleId = new Map<string, any[]>();
    for (const item of saleItems) {
      const currentItems = itemsBySaleId.get(item.saleId) || [];
      currentItems.push(item);
      itemsBySaleId.set(item.saleId, currentItems);
    }

    const formatNumberValue = (value?: number) =>
      Number(value || 0).toLocaleString('en-US', {
        maximumFractionDigits: 2,
      });

    const formatActivityTime = (value?: Date | string | null) => {
      if (!value) return '--';
      const dateValue = new Date(value);
      if (Number.isNaN(dateValue.getTime())) return '--';

      return dateValue.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    };

    const formatDuration = (
      start?: Date | string | null,
      end?: Date | string | null,
    ) => {
      if (!start || !end) return '< 1 min';
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const minutes = Math.max(Math.round(diffMs / 60000), 0);
      if (minutes < 1) return '< 1 min';
      if (minutes === 1) return '1 min';
      return `${minutes} mins`;
    };

    const normalizeLocation = (location?: any) => {
      const latitude = Number(location?.latitude);
      const longitude = Number(location?.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }

      return {
        latitude,
        longitude,
        accuracy: location?.accuracy,
        altitude: location?.altitude,
        speed: location?.speed,
        capturedAt: location?.capturedAt || null,
      };
    };

    const latestTrackedLocation = normalizeLocation(
      await this.liveLocationService.findLatestForSession(
        workSession?.workSessionId,
      ),
    );
    const dayStartLocation = normalizeLocation(workSession?.dayStartLocation);
    const dayEndLocation = normalizeLocation(workSession?.dayEndLocation);
    const currentLocation =
      dayEndLocation || latestTrackedLocation || dayStartLocation || null;

    const buildOrderDetail = (sale: any) => {
      const items = itemsBySaleId.get(sale.saleId) || [];
      const categoryMap = new Map<string, any>();

      for (const item of items) {
        const categoryId = item.categoryId || 'UNKNOWN';
        const category = categoryMap.get(categoryId) || {
          id: categoryId,
          name: item.categoryName || 'Unknown',
          caseQty: 0,
          pieceQty: 0,
          value: 0,
          lines: [],
        };

        category.caseQty += Number(item.caseQty || 0);
        category.pieceQty += Number(item.pieceQty || 0);
        category.value += Number(item.totalValue || 0);
        if (
          !category.lines.some(
            (line) => line.id === `${sale.saleId}-${item.productId}`,
          )
        ) {
          category.lines.push({
            id: `${sale.saleId}-${item.productId}`,
            name: item.productName || item.productId,
            ptr: `ZMW ${formatNumberValue(item.casePrice)}`,
            qty: formatNumberValue(item.quantity),
            unit: `${formatNumberValue(item.caseQty)} Cases ${formatNumberValue(
              item.pieceQty,
            )} Pcs`,
            value: `ZMW ${formatNumberValue(item.totalValue)}`,
          });
        }

        categoryMap.set(categoryId, category);
      }

      return {
        orderNo: sale.saleId,
        outlet: sale.customerName || sale.customerId,
        quantityCases: formatNumberValue(sale.netCases),
        quantitySuperUnit: formatNumberValue(sale.totalQty),
        totalPieces: formatNumberValue(sale.totalPieces),
        netValue: formatNumberValue(sale.totalValue),
        categories: Array.from(categoryMap.values()).map((category) => ({
          id: category.id,
          name: category.name,
          meta: `${formatNumberValue(category.caseQty)} Cases ${formatNumberValue(
            category.pieceQty,
          )} Pcs`,
          value: formatNumberValue(category.value),
          lines: category.lines,
        })),
        schemeDiscount: '0',
        cashDiscount: '0',
        tax: '0',
        payableAmount: formatNumberValue(sale.totalValue),
      };
    };

    const visitActivities = visits.map((visit) => {
      const sale: any = salesByVisit.get(visit.visitId);
      const nonSale: any = nonSalesByVisit.get(visit.visitId);
      const metrics = sale
        ? [
            { label: 'Value(ZMW)', value: formatNumberValue(sale.totalValue) },
            {
              label: 'NetValue(ZMW)',
              value: formatNumberValue(sale.totalValue),
            },
            { label: 'Qty(Cases)', value: formatNumberValue(sale.netCases) },
            { label: 'Tonnage', value: formatNumberValue(sale.totalWeight) },
            { label: 'Pieces', value: formatNumberValue(sale.totalPieces) },
            { label: 'Payment', value: sale.paymentStatus || '--' },
          ]
        : [
            { label: 'Visit Type', value: visit.visitType || '--' },
            { label: 'Status', value: visit.status || '--' },
            { label: 'Reason', value: nonSale?.reasonId || '--' },
            { label: 'Remark', value: nonSale?.remark || '--' },
          ];

      return {
        id: sale?.saleId || nonSale?.nonSaleId || visit.visitId,
        source: sale ? 'sale' : nonSale ? 'non-sale' : 'visit',
        type: sale
          ? 'VANSALES ACTIVITY'
          : nonSale
            ? 'NON SALE ACTIVITY'
            : 'SHOP VISIT',
        time: formatActivityTime(visit.checkInTime),
        duration: formatDuration(visit.checkInTime, visit.checkOutTime),
        outlet: visit.outletName || sale?.customerName || visit.outletId,
        owner: sale?.customerName || visit.outletName || visit.outletId,
        metrics,
        location:
          normalizeLocation(visit.checkOutLocation) ||
          normalizeLocation(visit.checkInLocation),
        checkInLocation: normalizeLocation(visit.checkInLocation),
        checkOutLocation: normalizeLocation(visit.checkOutLocation),
        order: sale ? buildOrderDetail(sale) : undefined,
        sortTime: new Date(visit.checkInTime).getTime(),
      };
    });

    const workActivities = activities
      .filter((activity) => activity.name !== 'Retailing')
      .map((activity) => ({
        id: activity.activityId,
        source: 'activity',
        type: `${activity.name || 'ACTIVITY'}`.toUpperCase(),
        time: formatActivityTime(activity.startTime),
        duration: formatDuration(activity.startTime, activity.endTime),
        outlet: activity.description || activity.category || activity.name,
        owner: activity.userName || employee.name,
        metrics: [
          { label: 'Status', value: activity.status || '--' },
          { label: 'Category', value: activity.category || '--' },
          { label: 'Sub Category', value: activity.subCategory || '--' },
        ],
        sortTime: new Date(activity.startTime).getTime(),
      }));

    const data = uniqueBy(
      [...visitActivities, ...workActivities],
      (activity: any) =>
        `${activity.source}-${activity.id}-${activity.time}-${activity.outlet}`,
    )
      .sort((a, b) => a.sortTime - b.sortTime)
      .map(({ sortTime, ...activity }) => activity);
    const dayStartTime =
      workSession?.dayStartTime ||
      activities[0]?.startTime ||
      visits[0]?.checkInTime ||
      null;

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager user timeline fetched successfully',
      data: {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        date: selectedDate,
        dayStartTime: dayStartTime ? formatActivityTime(dayStartTime) : null,
        dayEndTime: workSession?.dayEndTime
          ? formatActivityTime(workSession.dayEndTime)
          : null,
        dayStartImageUrl: workSession?.dayStartImageUrl || null,
        dayStartImageMediaId: workSession?.dayStartImageMediaId || null,
        dayStartLocation,
        dayEndLocation,
        currentLocation,
        activities: data,
      },
    };
  }

  private getDayRange(date?: string) {
    const selectedDate = date ? parseCalendarDate(date) : new Date();
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    return { selectedDate, startOfDay, endOfDay };
  }

  private getMonthRange(date?: string) {
    const selectedDate = date ? parseCalendarDate(date) : new Date();
    const startOfMonth = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      1,
    );
    startOfMonth.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    return { selectedDate, startOfMonth, endOfDay };
  }

  private async getManagedEmployee(employeeId: string) {
    const managerId = RequestContextStore.getStore()?.userId;
    const employee = await this.findOne({
      employeeId,
      status: UserStatus.ACTIVE,
      $or: [{ reportingEmployeeId: managerId }, { hierarchyPath: managerId }],
    });

    if (!employee) throw new NotFoundException(EMPLOYEE.NOT_FOUND);

    return employee;
  }

  private async getAssignedBeatCustomers(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const vans = await this.vanModel
      .find(
        {
          associatedUsers: employeeId,
          status: VanStatus.ACTIVE,
        },
        {
          associatedRoutes: 1,
        },
      )
      .lean();

    const routeIds = [
      ...new Set(
        vans.flatMap((van: any) =>
          (van.associatedRoutes || [])
            .filter((route: any) => {
              const fromDate = route.fromDate ? new Date(route.fromDate) : null;
              const toDate = route.toDate ? new Date(route.toDate) : null;

              return (
                route.routeId &&
                (!fromDate || fromDate <= endDate) &&
                (!toDate || toDate >= startDate)
              );
            })
            .map((route: any) => route.routeId),
        ),
      ),
    ];

    if (!routeIds.length) return [];

    return this.routeCustomerMappingModel
      .find({
        routeId: { $in: routeIds },
        status: RouteCustomerMappingStatus.ACTIVE,
        effectiveFrom: { $lte: endDate },
        $or: [
          { effectiveTo: null },
          { effectiveTo: { $exists: false } },
          { effectiveTo: { $gte: startDate } },
        ],
      })
      .sort({ sequence: 1 })
      .lean();
  }

  async getManagerUserMtdSummary(query: { employeeId: string; date?: string }) {
    const employee = await this.getManagedEmployee(query.employeeId);
    const { selectedDate, startOfMonth, endOfDay } = this.getMonthRange(
      query.date,
    );

    const [assignedBeatCustomers, visitedOutletIds, billedOutletIds] =
      await Promise.all([
        this.getAssignedBeatCustomers(
          employee.employeeId,
          startOfMonth,
          endOfDay,
        ),
        this.shopVisitModel.distinct('outletId', {
          employeeId: employee.employeeId,
          checkInTime: {
            $gte: startOfMonth,
            $lte: endOfDay,
          },
          status: ShopVisitStatus.COMPLETED,
        }),
        this.saleModal.distinct('customerId', {
          employeeId: employee.employeeId,
          date: {
            $gte: startOfMonth,
            $lte: endOfDay,
          },
          status: SaleStatus.COMPLETED,
        }),
      ]);

    const visitedBeatOutletCount = new Set(
      assignedBeatCustomers.map((mapping: any) => mapping.customerId),
    ).size;
    const utc = visitedOutletIds.length;
    const upc = billedOutletIds.length;
    const zeroOrder = Math.max(utc - upc, 0);
    const notVisited = Math.max(visitedBeatOutletCount - utc, 0);
    const total = utc + upc + zeroOrder + notVisited;

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager user MTD summary fetched successfully',
      data: {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        date: formatCalendarDate(selectedDate),
        utc,
        upc,
        zeroOrder,
        notVisited,
        total,
      },
    };
  }

  async getManagerUserRoutePlan(query: { employeeId: string; date?: string }) {
    const employee = await this.getManagedEmployee(query.employeeId);
    const { selectedDate, startOfDay, endOfDay } = this.getDayRange(query.date);
    const assignedBeatCustomers = await this.getAssignedBeatCustomers(
      employee.employeeId,
      startOfDay,
      endOfDay,
    );
    const customerIds = [
      ...new Set(
        assignedBeatCustomers.map((mapping: any) => mapping.customerId),
      ),
    ];

    const [customers, visitedOutletIds, billedOutletIds] = await Promise.all([
      customerIds.length
        ? this.customerModel
            .find(
              { customerId: { $in: customerIds } },
              { customerId: 1, name: 1, customerTypeId: 1 },
            )
            .lean()
        : [],
      customerIds.length
        ? this.shopVisitModel.distinct('outletId', {
            employeeId: employee.employeeId,
            outletId: { $in: customerIds },
            checkInTime: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: ShopVisitStatus.COMPLETED,
          })
        : [],
      customerIds.length
        ? this.saleModal.distinct('customerId', {
            employeeId: employee.employeeId,
            customerId: { $in: customerIds },
            date: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
            status: SaleStatus.COMPLETED,
          })
        : [],
    ]);

    const customersById = new Map<string, any>(
      customers.map(
        (customer: any) => [customer.customerId, customer] as [string, any],
      ),
    );
    const visited = new Set(visitedOutletIds);
    const billed = new Set(billedOutletIds);
    const seen = new Set<string>();
    const stops = assignedBeatCustomers
      .filter((mapping: any) => {
        if (!mapping.customerId || seen.has(mapping.customerId)) return false;
        seen.add(mapping.customerId);
        return true;
      })
      .map((mapping: any, index: number) => {
        const customer = customersById.get(mapping.customerId);
        const isVisited = visited.has(mapping.customerId);
        const isBilled = billed.has(mapping.customerId);

        return {
          id: mapping.mappingId || mapping.customerId,
          outletId: mapping.customerId,
          name: customer?.name || mapping.customerId,
          time: `Stop ${index + 1}`,
          status: isBilled ? 'completed' : isVisited ? 'missed' : 'pending',
          type: customer?.customerTypeId || 'Outlet',
        };
      });

    return {
      statusCode: HttpStatus.OK,
      message: 'Manager user route plan fetched successfully',
      data: {
        employeeId: employee.employeeId,
        employeeName: employee.name,
        date: formatCalendarDate(selectedDate),
        stops,
      },
    };
  }
}
