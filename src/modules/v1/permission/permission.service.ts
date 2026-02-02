import { Injectable, HttpStatus } from '@nestjs/common';

import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';

import {
  Permission,
  PermissionSchema,
} from 'src/core/database/mongo/schema/permission.schema';

import { Status } from 'src/shared/enums/app.enum';
import { PERMISSION } from './permission.constants';

@Injectable()
export class PermissionService extends MongoRepository<Permission> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Permission.name, PermissionSchema));
  }

  /* ================= GET ALL ================= */

  async findAll(searchText?: string) {
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
