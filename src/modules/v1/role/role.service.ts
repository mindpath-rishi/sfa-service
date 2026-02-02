import {
  Injectable,
  ConflictException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';

import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleQueryDto } from './dto/role-query.dto';

import { ROLE } from './role.constants';
import { UserStatus } from 'src/modules/v1/user/user.enum';
import { Role, RoleSchema } from 'src/core/database/mongo/schema/role.schema';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { Status } from 'src/shared/enums/app.enum';

@Injectable()
export class RoleService extends MongoRepository<Role> {
  constructor(mongo: MongoService) {
    // ✅ ONE LINE – no repetition, no timing issue
    super(mongo.getModel(Role.name, RoleSchema));
  }

  /* ======================================================
   * CREATE ROLE
   * ====================================================== */

  async create(dto: CreateRoleDto) {
    try {
      const role = await this.save({
        roleId: IdGenerator.roleId(),
        name: dto.name,
        description: dto.description,
        permissions: dto.permissions,
        status: Status.ACTIVE,
      });

      return {
        statusCode: HttpStatus.CREATED,
        message: ROLE.CREATED,
        data: role,
      };
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new ConflictException(ROLE.DUPLICATE);
      }
      throw err;
    }
  }

  /* ======================================================
   * GET ALL ROLES (FILTER + PAGINATION)
   * ====================================================== */

  async findAll(params?: {
    status?: string;
    searchText?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, searchText, page = 1, limit = 20 } = params || {};

    const filter: any = {};

    /* ---------- Status filter ---------- */
    if (status) {
      filter.status = status;
    }

    /* ---------- Search filter ---------- */
    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ roleId: regex }, { name: regex }, { description: regex }];
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

  /* ======================================================
   * GET ROLE BY roleId
   * ====================================================== */

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

  /* ======================================================
   * UPDATE ROLE
   * ====================================================== */

  async update(roleId: string, dto: UpdateRoleDto) {
    const role = await this.upsert({ roleId }, dto, {
      upsert: false,
    });

    if (!role) {
      throw new NotFoundException(ROLE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: ROLE.UPDATED,
      data: role,
    };
  }

  /* ======================================================
   * DELETE ROLE (SOFT)
   * ====================================================== */

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
