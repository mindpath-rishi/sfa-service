/**
 * Permission Service
 * ------------------
 * Purpose : Handle read-only access to system permissions
 * Used by : PermissionController
 *
 * Responsibilities:
 * - Fetch active permissions
 * - Support free-text search across permission attributes
 *
 * Notes:
 * - Permissions are treated as static reference data
 * - No create/update/delete operations are exposed here
 */

import { Injectable, HttpStatus } from '@nestjs/common';

import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';

import {
  Permission,
  PermissionSchema,
} from 'src/core/database/mongo/schema/permission.schema';

import { Status } from 'src/shared/enums/app.enums';
import { PERMISSION } from './permission.constants';
import { PermissionsQueryDto } from './dto/permission-query.dto';
import { HydratedDocument } from 'mongoose';

@Injectable()
export class PermissionService extends MongoRepository<Permission> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Permission.name, PermissionSchema));
  }

  /**
   * Get Permissions
   * ---------------
   * Purpose : Retrieve all active permissions
   * Used by : ROLE MANAGEMENT / PERMISSION SELECTION UI
   *
   * Supports:
   * - Free-text search across permission name, code, module, and description
   *
   * Notes:
   * - Only ACTIVE permissions are returned
   * - Results are sorted alphabetically by name
   */
  async findAll(query: PermissionsQueryDto) {
    const { searchText } = query;
    const filter: any = { status: Status.ACTIVE };

    if (searchText?.trim()) {
      filter.$or = [
        { name: { $regex: searchText.trim(), $options: 'i' } },
        { code: { $regex: searchText.trim(), $options: 'i' } },
        { module: { $regex: searchText.trim(), $options: 'i' } },
        { description: { $regex: searchText.trim(), $options: 'i' } },
      ];
    }

    const permissions = await this.find(filter, { sort: { name: 1 } });

    return {
      statusCode: HttpStatus.OK,
      message: PERMISSION.FETCHED,
      data: permissions,
    };
  }
}
