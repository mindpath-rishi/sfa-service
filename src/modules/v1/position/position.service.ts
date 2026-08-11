import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import {
  Position,
  PositionSchema,
} from 'src/core/database/mongo/schema/position.schema';
import { TextNormalizer } from 'src/shared/utils/text-normalizer.utils';
import { NormalizeType } from 'src/shared/enums/normalize.enums';
import { POSITION } from './position.constants';
import { CreatePositionDto } from './dto/create-position.dto';
import { PositionQueryDto } from './dto/position-query.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import { Role, RoleSchema } from 'src/core/database/mongo/schema/role.schema';
import { ClientSession } from 'mongoose';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { EmployeeType } from 'src/shared/enums/employee.enums';
import {
  Activity,
  ActivitySchema,
} from 'src/core/database/mongo/schema/activity.schema';
import { ActivityStatus } from 'src/shared/enums/activity.enums';

const POSITION_ROLE_LEVELS: Record<string, number> = {
  ADMIN: 1,
  CATEGORY_MANAGER: 2,
  MANAGER: 3,
  TEAM_LEADER: 4,
  SALESMAN: 5,
};

@Injectable()
export class PositionService extends MongoRepository<Position> {
  private readonly vanModel;
  private readonly roleModel;
  private readonly employeeModel;
  private readonly activityModel;

  constructor(mongo: MongoService) {
    super(mongo.getModel(Position.name, PositionSchema));
    this.vanModel = mongo.getModel(Van.name, VanSchema);
    this.roleModel = mongo.getModel(Role.name, RoleSchema);
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
    this.activityModel = mongo.getModel(Activity.name, ActivitySchema);
  }

  private async attachMappedEmployees<T extends { employeeId?: string }>(
    positions: T[],
    session?: ClientSession,
  ) {
    const plainPositions = positions.map(
      (position) =>
        (position as T & { toObject?: () => T }).toObject?.() ?? position,
    );
    const employeeIds = [
      ...new Set(
        plainPositions
          .map((position) => position.employeeId)
          .filter((employeeId): employeeId is string => Boolean(employeeId)),
      ),
    ];
    const employeesQuery = this.employeeModel
      .find({
        employeeId: { $in: employeeIds },
        isDeleted: { $ne: true },
      })
      .select('employeeId manNumber name mobile status')
      .lean();
    if (session) employeesQuery.session(session);
    const employees = employeeIds.length ? await employeesQuery : [];
    const employeeById = new Map(
      employees.map((employee) => [employee.employeeId, employee]),
    );

    return plainPositions.map((position) => ({
      ...position,
      employee: position.employeeId
        ? employeeById.get(position.employeeId) || null
        : null,
    }));
  }

  private async getReportingHierarchy(
    reportTo?: string,
    session?: ClientSession,
    currentPositionId?: string,
  ) {
    if (!reportTo) {
      return {
        employeeHierarchyPath: [] as string[],
        positionHierarchyPath: [] as string[],
        hierarchyDepth: 1,
      };
    }

    const parentChain: Array<{
      positionId: string;
      employeeId?: string;
      reportTo?: string;
    }> = [];
    const visited = new Set<string>(
      currentPositionId ? [currentPositionId] : [],
    );
    let parentPositionId: string | undefined = reportTo;

    while (parentPositionId) {
      if (visited.has(parentPositionId)) {
        throw new BadRequestException(
          'A cycle exists in the position reporting hierarchy.',
        );
      }
      visited.add(parentPositionId);

      const parentQuery = this.model
        .findOne({
          positionId: parentPositionId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('positionId employeeId reportTo')
        .lean();
      if (session) parentQuery.session(session);
      const parent = await parentQuery;

      if (!parent) {
        throw new NotFoundException(
          `Active reporting position not found: ${parentPositionId}`,
        );
      }
      parentChain.push(parent);
      if (parentChain.length >= 5) {
        throw new BadRequestException(
          'Position hierarchy cannot contain more than five levels.',
        );
      }
      parentPositionId = parent.reportTo;
    }

    const orderedParents = parentChain.reverse();
    return {
      employeeHierarchyPath: orderedParents
        .map((position) => position.employeeId)
        .filter((employeeId): employeeId is string => Boolean(employeeId)),
      positionHierarchyPath: orderedParents.map(
        (position) => position.positionId,
      ),
      hierarchyDepth: orderedParents.length + 1,
    };
  }

  private async validateEmployeeAssignment(
    employeeId?: string,
    currentPositionId?: string,
    session?: ClientSession,
  ) {
    if (!employeeId) return;

    const employee = await this.employeeModel.collection.findOne(
      {
        employeeId,
        isDeleted: { $ne: true },
      },
      { projection: { employeeId: 1, employeeType: 1, status: 1 }, session },
    );
    if (!employee) {
      throw new NotFoundException(`Employee not found: ${employeeId}`);
    }
    if (employee.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Only an active employee can be mapped to a position: ${employeeId}`,
      );
    }
    if (employee.employeeType === EmployeeType.SUPPORTING_STAFF) {
      throw new BadRequestException(
        'Supporting staff cannot be mapped to a position',
      );
    }

    const mappedPositionQuery = this.model
      .findOne({
        employeeId,
        ...(currentPositionId
          ? { positionId: { $ne: currentPositionId } }
          : {}),
        isDeleted: { $ne: true },
      })
      .select('positionId')
      .lean();
    if (session) mappedPositionQuery.session(session);
    const mappedPosition = await mappedPositionQuery;
    if (mappedPosition) {
      throw new ConflictException(
        `Employee ${employeeId} is already mapped to position ${mappedPosition.positionId}`,
      );
    }
  }

  private normalizePositionRoleName(roleName: unknown) {
    return String(roleName ?? '')
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
  }

  private async validatePositionHierarchyLevel(
    roleName: unknown,
    reportTo: string | undefined,
    hierarchyDepth: number,
    session?: ClientSession,
  ) {
    const normalizedRoleName = this.normalizePositionRoleName(roleName);
    const expectedLevel = POSITION_ROLE_LEVELS[normalizedRoleName];
    if (!expectedLevel) {
      throw new BadRequestException(
        'Positions only support ADMIN, CATEGORY_MANAGER, MANAGER, TEAM_LEADER, and SALESMAN roles.',
      );
    }

    if (expectedLevel === 1) {
      if (reportTo) {
        throw new BadRequestException(
          'An ADMIN position cannot report to another position.',
        );
      }
      return;
    }

    if (!reportTo) {
      throw new BadRequestException(
        `${normalizedRoleName} must have a reporting position.`,
      );
    }

    if (hierarchyDepth !== expectedLevel) {
      throw new BadRequestException(
        `${normalizedRoleName} must be at position hierarchy level ${expectedLevel}.`,
      );
    }

    const parentPositionQuery = this.model
      .findOne({
        positionId: reportTo,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('roleId')
      .lean();
    if (session) parentPositionQuery.session(session);
    const parentPosition = await parentPositionQuery;
    const parentRoleQuery = this.roleModel
      .findOne({
        roleId: parentPosition?.roleId,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('name')
      .lean();
    if (session) parentRoleQuery.session(session);
    const parentRole = await parentRoleQuery;
    const parentRoleName = this.normalizePositionRoleName(parentRole?.name);
    const expectedParentRole = Object.entries(POSITION_ROLE_LEVELS).find(
      ([, level]) => level === expectedLevel - 1,
    )?.[0];

    if (parentRoleName !== expectedParentRole) {
      throw new BadRequestException(
        `${normalizedRoleName} must report to a ${expectedParentRole} position.`,
      );
    }
  }

  private async validateDescendantPositionLevels(
    positionId: string,
    hierarchyDepth: number,
    session?: ClientSession,
  ) {
    const queue = [{ positionId, hierarchyDepth }];

    while (queue.length) {
      const parent = queue.shift()!;
      const childrenQuery = this.model
        .find({
          reportTo: parent.positionId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('positionId roleId')
        .lean();
      if (session) childrenQuery.session(session);
      const children = await childrenQuery;
      const childDepth = parent.hierarchyDepth + 1;

      if (children.length && childDepth > 5) {
        throw new BadRequestException(
          'Position hierarchy cannot contain more than five levels.',
        );
      }

      const childRoleIds = [...new Set(children.map((child) => child.roleId))];
      const childRolesQuery = this.roleModel
        .find({
          roleId: { $in: childRoleIds },
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('roleId name')
        .lean();
      if (session) childRolesQuery.session(session);
      const childRoles = childRoleIds.length ? await childRolesQuery : [];
      const childRoleById = new Map(
        childRoles.map((role) => [role.roleId, role.name]),
      );

      for (const child of children) {
        const childRoleName = this.normalizePositionRoleName(
          childRoleById.get(child.roleId),
        );
        if (POSITION_ROLE_LEVELS[childRoleName] !== childDepth) {
          throw new BadRequestException(
            `Position ${child.positionId} must use the role assigned to hierarchy level ${childDepth}.`,
          );
        }
        queue.push({
          positionId: child.positionId,
          hierarchyDepth: childDepth,
        });
      }
    }
  }

  private async refreshDescendantHierarchies(
    positionId: string,
    employeeHierarchyPath: string[],
    positionHierarchyPath: string[],
    hierarchyDepth: number,
    employeeId?: string,
    session?: ClientSession,
  ) {
    const queue = [
      {
        positionId,
        employeeHierarchyPath,
        positionHierarchyPath,
        hierarchyDepth,
        employeeId,
      },
    ];
    const visited = new Set<string>();

    while (queue.length) {
      const parent = queue.shift()!;
      if (visited.has(parent.positionId)) {
        throw new BadRequestException(
          'A cycle exists in the position reporting hierarchy.',
        );
      }
      visited.add(parent.positionId);

      const childEmployeeHierarchyPath = [
        ...parent.employeeHierarchyPath,
        ...(parent.employeeId ? [parent.employeeId] : []),
      ];
      const childPositionHierarchyPath = [
        ...parent.positionHierarchyPath,
        parent.positionId,
      ];
      const childHierarchyDepth = parent.hierarchyDepth + 1;
      const childrenQuery = this.model
        .find({
          reportTo: parent.positionId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('positionId employeeId')
        .lean();
      if (session) childrenQuery.session(session);
      const children = await childrenQuery;

      for (const child of children) {
        await this.model.updateOne(
          { positionId: child.positionId },
          {
            $set: {
              hierarchyPath: childPositionHierarchyPath,
              hierarchyDepth: childHierarchyDepth,
            },
          },
          { session },
        );
        if (child.employeeId) {
          await this.employeeModel.updateOne(
            { employeeId: child.employeeId, isDeleted: { $ne: true } },
            { $set: { hierarchyPath: childEmployeeHierarchyPath } },
            { session },
          );
        }
        queue.push({
          positionId: child.positionId,
          employeeHierarchyPath: childEmployeeHierarchyPath,
          positionHierarchyPath: childPositionHierarchyPath,
          hierarchyDepth: childHierarchyDepth,
          employeeId: child.employeeId,
        });
      }
    }
  }

  private async validatePositionAssignments(
    roleId: string,
    vanIds: string[],
    offlineAccessAllowed = false,
    session?: ClientSession,
  ) {
    const roleQuery = this.roleModel
      .findOne({ roleId, status: 'ACTIVE', isDeleted: { $ne: true } })
      .select('roleId name')
      .lean();
    if (session) roleQuery.session(session);
    const role = await roleQuery;
    if (!role) throw new NotFoundException(`Active role not found: ${roleId}`);

    const roleName = String(role.name ?? '')
      .trim()
      .toUpperCase();
    if (!POSITION_ROLE_LEVELS[this.normalizePositionRoleName(roleName)]) {
      throw new BadRequestException(
        'Positions only support ADMIN, CATEGORY_MANAGER, MANAGER, TEAM_LEADER, and SALESMAN roles.',
      );
    }
    if (
      offlineAccessAllowed &&
      !['SALESMAN', 'SALES', 'SALES_EXECUTIVE'].includes(roleName)
    ) {
      throw new BadRequestException(
        'Offline access can only be enabled for a sales position.',
      );
    }

    if (roleName === 'SALESMAN' && new Set(vanIds.filter(Boolean)).size > 1) {
      throw new BadRequestException(
        'A SALESMAN position can be assigned to only one van.',
      );
    }
    return role;
  }

  private async nextPositionId(session: ClientSession) {
    const latest = await this.model
      .findOne({ positionId: /^P\d{5,}$/ })
      .select('positionId')
      .sort({ positionId: -1 })
      .session(session)
      .lean();
    const latestSequence = latest?.positionId
      ? Number(latest.positionId.slice(1))
      : 0;
    const counters = this.model.db.collection('id_counters');

    await counters.updateOne(
      { _id: 'positionId' as any },
      { $max: { sequence: latestSequence } },
      { upsert: true, session },
    );
    const counter = await counters.findOneAndUpdate(
      { _id: 'positionId' as any },
      { $inc: { sequence: 1 } },
      { returnDocument: 'after', session },
    );
    const sequence = Number(counter?.sequence);
    if (!Number.isSafeInteger(sequence) || sequence < 1) {
      throw new ConflictException('Unable to generate position ID');
    }
    return `P${String(sequence).padStart(5, '0')}`;
  }

  private async validateVanIds(vanIds?: string[]) {
    if (!vanIds?.length) return;
    const uniqueVanIds = [...new Set(vanIds)];
    const existingVanIds = await this.vanModel.distinct('vanId', {
      vanId: { $in: uniqueVanIds },
      status: 'ACTIVE',
      isDeleted: { $ne: true },
    });
    const missingVanIds = uniqueVanIds.filter(
      (vanId) => !existingVanIds.includes(vanId),
    );
    if (missingVanIds.length) {
      throw new NotFoundException(
        `Active van not found: ${missingVanIds.join(', ')}`,
      );
    }
  }

  private async validateSalesmanVanChangeDuringRetailing(
    roleId: string,
    employeeId: string | undefined,
    currentVanIds: string[],
    nextVanIds: string[],
    session: ClientSession,
  ) {
    if (!employeeId) return;

    const currentVanIdSet = new Set(currentVanIds.filter(Boolean));
    const nextVanIdSet = new Set(nextVanIds.filter(Boolean));
    const vanAssignmentChanged =
      currentVanIdSet.size !== nextVanIdSet.size ||
      [...currentVanIdSet].some((vanId) => !nextVanIdSet.has(vanId));
    if (!vanAssignmentChanged) return;

    const role = await this.roleModel
      .findOne({ roleId, isDeleted: { $ne: true } })
      .select('name')
      .session(session)
      .lean();
    if (
      String(role?.name ?? '')
        .trim()
        .toUpperCase() !== 'SALESMAN'
    )
      return;

    const activeRetailingActivity = await this.activityModel
      .findOne({
        userId: employeeId,
        name: 'Retailing',
        status: ActivityStatus.ACTIVE,
        isDeleted: { $ne: true },
      })
      .select('activityId')
      .session(session)
      .lean();
    if (activeRetailingActivity) {
      throw new ConflictException(
        'Vehicle cannot be changed while the salesman is actively retailing.',
      );
    }
  }

  private async getAssignedVanCategoryIds(
    vanIds: string[],
    session?: ClientSession,
  ): Promise<string[]> {
    const vanId = vanIds.find(Boolean);
    if (!vanId) return [];

    const vanQuery = this.vanModel
      .findOne({
        vanId,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('categoryIds')
      .lean();
    if (session) vanQuery.session(session);
    const van = await vanQuery;
    const categoryIds: unknown[] = Array.isArray(van?.categoryIds)
      ? Array.from(van.categoryIds)
      : [];

    return [
      ...new Set(
        categoryIds.filter(
          (categoryId): categoryId is string =>
            typeof categoryId === 'string' && Boolean(categoryId),
        ),
      ),
    ];
  }

  private async validatePositionVanAssignments(
    reportTo: string | undefined,
    roleId: string,
    roleName: string,
    vanIds: string[],
    currentPositionId?: string,
    session?: ClientSession,
  ) {
    if (!vanIds.length) return;

    if (reportTo) {
      const reportingPositionQuery = this.model
        .findOne({
          positionId: reportTo,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        })
        .select('positionId vanIds')
        .lean();
      if (session) reportingPositionQuery.session(session);
      const reportingPosition = await reportingPositionQuery;
      const reportingVanIds = new Set(reportingPosition?.vanIds || []);
      const unavailableFromParent = vanIds.filter(
        (vanId) => !reportingVanIds.has(vanId),
      );
      if (unavailableFromParent.length) {
        throw new BadRequestException(
          `Van(s) are not mapped to the selected Report To position: ${unavailableFromParent.join(', ')}`,
        );
      }
    }

    if (roleName !== 'SALESMAN') return;

    const excludedPositionIds = [reportTo, currentPositionId].filter(
      (positionId): positionId is string => Boolean(positionId),
    );
    const conflictingPositionsQuery = this.model
      .find({
        positionId: { $nin: excludedPositionIds },
        roleId,
        vanIds: { $in: vanIds },
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      })
      .select('positionId vanIds')
      .lean();
    if (session) conflictingPositionsQuery.session(session);
    const conflictingPositions = await conflictingPositionsQuery;
    const assignedElsewhere = [
      ...new Set(
        conflictingPositions.flatMap((position) =>
          (position.vanIds || []).filter((vanId) => vanIds.includes(vanId)),
        ),
      ),
    ];
    if (assignedElsewhere.length) {
      throw new ConflictException(
        `Van(s) already assigned to another salesperson position: ${assignedElsewhere.join(', ')}`,
      );
    }
  }

  async create(payload: CreatePositionDto) {
    try {
      return await this.withTransaction(async (session) => {
        await this.validateVanIds(payload.vanIds);
        const role = await this.validatePositionAssignments(
          payload.roleId,
          payload.vanIds || [],
          payload.offlineAccessAllowed === true,
          session,
        );
        await this.validateEmployeeAssignment(
          payload.employeeId || undefined,
          undefined,
          session,
        );
        const hierarchy = await this.getReportingHierarchy(
          payload.reportTo,
          session,
        );
        await this.validatePositionHierarchyLevel(
          role.name,
          payload.reportTo,
          hierarchy.hierarchyDepth,
          session,
        );
        await this.validatePositionVanAssignments(
          payload.reportTo,
          payload.roleId,
          String(role.name).trim().toUpperCase(),
          payload.vanIds || [],
          undefined,
          session,
        );
        const isSalesmanRole =
          String(role.name).trim().toUpperCase() === 'SALESMAN';
        const assignedVanCategoryIds = isSalesmanRole
          ? await this.getAssignedVanCategoryIds(
              payload.vanIds || [],
              session,
            )
          : undefined;
        const positionData: Record<string, unknown> = {
          ...payload,
          ...(isSalesmanRole
            ? { parentCategoryId: assignedVanCategoryIds }
            : {}),
          name: TextNormalizer.normalize(
            payload.name,
            NormalizeType.TITLE,
          ),
          hierarchyPath: hierarchy.positionHierarchyPath,
          hierarchyDepth: hierarchy.hierarchyDepth,
        };
        for (const optionalField of [
          'reportTo',
          'marketId',
          'provinceId',
          'employeeId',
        ]) {
          if (!positionData[optionalField]) delete positionData[optionalField];
        }

        const existing = await this.findOne(
          { name: String(positionData.name) },
          { session, includeDeleted: true },
        );

        if (existing && !existing.isDeleted) {
          throw new ConflictException(POSITION.DUPLICATE);
        }

        if (existing?.isDeleted) {
          await this.updateById(
            existing._id.toString(),
            {
              ...positionData,
              status: 'ACTIVE',
              isDeleted: false,
            },
            { session },
          );
          if (payload.employeeId) {
            await this.employeeModel.updateOne(
              { employeeId: payload.employeeId, isDeleted: { $ne: true } },
              { $set: { hierarchyPath: hierarchy.employeeHierarchyPath } },
              { session },
            );
          }
          await this.refreshDescendantHierarchies(
            existing.positionId,
            hierarchy.employeeHierarchyPath,
            hierarchy.positionHierarchyPath,
            hierarchy.hierarchyDepth,
            payload.employeeId,
            session,
          );
          const restored = await this.findOne(
            { positionId: existing.positionId },
            { session, lean: true },
          );

          return {
            statusCode: HttpStatus.OK,
            message: POSITION.CREATED,
            data: restored
              ? (await this.attachMappedEmployees([restored], session))[0]
              : { positionId: existing.positionId },
          };
        }

        const doc = await this.save(
          {
            positionId: await this.nextPositionId(session),
            ...positionData,
          },
          { session },
        );
        if (payload.employeeId) {
          await this.employeeModel.updateOne(
            { employeeId: payload.employeeId, isDeleted: { $ne: true } },
            { $set: { hierarchyPath: hierarchy.employeeHierarchyPath } },
            { session },
          );
        }

        return {
          statusCode: HttpStatus.CREATED,
          message: POSITION.CREATED,
          data: (await this.attachMappedEmployees([doc], session))[0],
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: PositionQueryDto) {
    const {
      searchText,
      status,
      parentCategoryId,
      roleId,
      countryId,
      provinceId,
      marketId,
      employeeId,
      hierarchyDepth,
      page = 1,
      limit = 20,
    } = query;
    const filter: FilterQuery<Position> = {};

    if (status) filter.status = status;
    if (parentCategoryId) {
      filter.parentCategoryId = {
        $in: parentCategoryId
          .split(',')
          .map((categoryId) => categoryId.trim())
          .filter(Boolean),
      };
    }
    if (roleId) filter.roleId = roleId;
    if (countryId) filter.countryId = countryId;
    if (provinceId) filter.provinceId = provinceId;
    if (marketId) filter.marketId = marketId;
    if (employeeId) filter.employeeId = employeeId;
    if (hierarchyDepth) filter.hierarchyDepth = hierarchyDepth;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { positionId: regex },
        { name: regex },
        { parentCategoryId: regex },
        { countryId: regex },
        { provinceId: regex },
        { marketId: regex },
        { employeeId: regex },
        { hierarchyPath: regex },
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
      message: POSITION.FETCHED,
      data: await this.attachMappedEmployees(result.items),
      meta: result.meta,
    };
  }

  async findByPositionId(positionId: string) {
    const doc = await this.findOne({ positionId }, { lean: true });

    if (!doc) throw new NotFoundException(POSITION.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: POSITION.FETCHED,
      data: (await this.attachMappedEmployees([doc]))[0],
    };
  }

  async update(positionId: string, dto: UpdatePositionDto) {
    try {
      return await this.withTransaction(async (session) => {
        const existing = await this.findOne(
          { positionId },
          { session, lean: true },
        );
        if (!existing) throw new NotFoundException(POSITION.NOT_FOUND);
        const nextRoleId = dto.roleId ?? existing.roleId;
        const nextVanIds = dto.vanIds ?? existing.vanIds ?? [];
        const nextOfflineAccessAllowed =
          dto.offlineAccessAllowed ?? existing.offlineAccessAllowed ?? false;
        const nextReportTo =
          dto.reportTo !== undefined ? dto.reportTo : existing.reportTo;
        const nextEmployeeId =
          dto.employeeId !== undefined
            ? dto.employeeId || undefined
            : existing.employeeId;
        if (dto.vanIds !== undefined) {
          await this.validateSalesmanVanChangeDuringRetailing(
            existing.roleId,
            existing.employeeId,
            existing.vanIds ?? [],
            nextVanIds,
            session,
          );
        }
        await this.validateVanIds(nextVanIds);
        const role = await this.validatePositionAssignments(
          nextRoleId,
          nextVanIds,
          nextOfflineAccessAllowed,
          session,
        );
        const hierarchy = await this.getReportingHierarchy(
          nextReportTo,
          session,
          positionId,
        );
        await this.validatePositionHierarchyLevel(
          role.name,
          nextReportTo,
          hierarchy.hierarchyDepth,
          session,
        );
        if (dto.roleId !== undefined || dto.reportTo !== undefined) {
          await this.validateDescendantPositionLevels(
            positionId,
            hierarchy.hierarchyDepth,
            session,
          );
        }
        await this.validateEmployeeAssignment(
          nextEmployeeId,
          positionId,
          session,
        );
        await this.validatePositionVanAssignments(
          nextReportTo,
          nextRoleId,
          String(role.name).trim().toUpperCase(),
          nextVanIds,
          positionId,
          session,
        );
        const isSalesmanRole =
          String(role.name).trim().toUpperCase() === 'SALESMAN';
        const assignedVanCategoryIds = isSalesmanRole
          ? await this.getAssignedVanCategoryIds(nextVanIds, session)
          : undefined;
        const normalizedDto = {
          ...dto,
          ...(isSalesmanRole
            ? { parentCategoryId: assignedVanCategoryIds }
            : {}),
          ...(dto.name
            ? {
                name: TextNormalizer.normalize(
                  dto.name,
                  NormalizeType.TITLE,
                ),
              }
            : {}),
          hierarchyPath: hierarchy.positionHierarchyPath,
          hierarchyDepth: hierarchy.hierarchyDepth,
        };

        const fieldsToUnset = [
          ...(dto.reportTo !== undefined && !dto.reportTo ? ['reportTo'] : []),
          ...(dto.marketId !== undefined && !dto.marketId ? ['marketId'] : []),
          ...(dto.provinceId !== undefined && !dto.provinceId
            ? ['provinceId']
            : []),
          ...(dto.employeeId !== undefined && !dto.employeeId
            ? ['employeeId']
            : []),
        ];
        const update = fieldsToUnset.length
          ? {
              $set: Object.fromEntries(
                Object.entries(normalizedDto).filter(
                  ([key]) => !fieldsToUnset.includes(key),
                ),
              ),
              $unset: Object.fromEntries(
                fieldsToUnset.map((field) => [field, 1]),
              ),
            }
          : normalizedDto;
        await this.updateOne({ positionId }, update, {
          session,
          new: true,
        });
        if (existing.employeeId && existing.employeeId !== nextEmployeeId) {
          await this.employeeModel.updateMany(
            { employeeId: existing.employeeId, isDeleted: { $ne: true } },
            { $set: { hierarchyPath: [] } },
            { session },
          );
        }
        if (
          nextEmployeeId &&
          (dto.reportTo !== undefined || dto.employeeId !== undefined)
        ) {
          await this.employeeModel.updateOne(
            { employeeId: nextEmployeeId, isDeleted: { $ne: true } },
            { $set: { hierarchyPath: hierarchy.employeeHierarchyPath } },
            { session },
          );
        }
        if (dto.reportTo !== undefined || dto.employeeId !== undefined) {
          await this.refreshDescendantHierarchies(
            positionId,
            hierarchy.employeeHierarchyPath,
            hierarchy.positionHierarchyPath,
            hierarchy.hierarchyDepth,
            nextEmployeeId,
            session,
          );
        }
        const updated = await this.findOne(
          { positionId },
          { session, lean: true },
        );
        if (!updated) throw new NotFoundException(POSITION.NOT_FOUND);

        return {
          statusCode: HttpStatus.OK,
          message: POSITION.UPDATED,
          data: (await this.attachMappedEmployees([updated], session))[0],
        };
      });
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async delete(positionId: string) {
    const existing = await this.findOne({ positionId });

    if (!existing) throw new NotFoundException(POSITION.NOT_FOUND);

    const childPosition = await this.model
      .findOne({
        reportTo: positionId,
        isDeleted: { $ne: true },
      })
      .select('positionId')
      .lean();
    if (childPosition) {
      throw new ConflictException(
        `Position ${positionId} cannot be deleted while ${childPosition.positionId} reports to it`,
      );
    }

    await this.softDelete({ positionId });
    if (existing.employeeId) {
      await this.employeeModel.updateOne(
        { employeeId: existing.employeeId, isDeleted: { $ne: true } },
        { $set: { hierarchyPath: [] } },
      );
    }

    return {
      statusCode: HttpStatus.OK,
      message: POSITION.DELETED,
      data: existing,
    };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(POSITION.DUPLICATE);
    }
    throw error;
  }
}
