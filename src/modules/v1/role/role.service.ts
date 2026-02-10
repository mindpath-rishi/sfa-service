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
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { Status } from 'src/shared/enums/app.enums';
import { normalizeRoleName } from './role.uitls';

@Injectable()
export class RoleService extends MongoRepository<Role> {
  constructor(mongo: MongoService) {
    super(mongo.getModel<Role>(Role.name, RoleSchema));
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
          maxAssociatedVans: dto.maxAssociatedVans ?? 0,
          status: Status.ACTIVE,
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
      roleId: IdGenerator.roleId(),
      name: normalizedName,
      displayName: dto.name.trim(),
      description: dto.description,
      permissions: dto.permissions,
      maxAssociatedVans: dto.maxAssociatedVans ?? 0,
      status: Status.ACTIVE,
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
   * - Van association limit filters
   * - Pagination & sorting
   */
  async findAll(query: RoleQueryDto) {
    const {
      status,
      searchText,
      maxAssociatedVans,
      maxAssociatedVansLte,
      maxAssociatedVansGte,
      page = 1,
      limit = 20,
    } = query;

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

    if (maxAssociatedVans !== undefined) {
      filter.maxAssociatedVans = maxAssociatedVans;
    }

    if (maxAssociatedVansLte !== undefined) {
      filter.maxAssociatedVans = {
        ...(filter.maxAssociatedVans || {}),
        $lte: maxAssociatedVansLte,
      };
    }

    if (maxAssociatedVansGte !== undefined) {
      filter.maxAssociatedVans = {
        ...(filter.maxAssociatedVans || {}),
        $gte: maxAssociatedVansGte,
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
      message: ROLE.FETCHED,
      data: result.items,
      meta: result.meta,
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
