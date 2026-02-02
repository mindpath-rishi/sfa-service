import { HttpStatus, Injectable } from '@nestjs/common';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { AUDIT_LOGS } from './audit_logs.constants';
import {
  AuditLog,
  AuditLogSchema,
} from 'src/core/database/mongo/schema/audit-log.schema';

@Injectable()
export class AuditLogsService extends MongoRepository<AuditLog> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(AuditLog.name, AuditLogSchema));
  }

  /* ======================================================
   * GET AUDIT LOGS (FILTER + PAGINATION + SEARCH)
   * ====================================================== */

  async findAll(params?: {
    entity?: string;
    entityId?: string;
    action?: string;
    performedBy?: string;
    searchText?: string;
    from?: string; // ISO date
    to?: string; // ISO date
    page?: number;
    limit?: number;
  }) {
    const {
      entity,
      entityId,
      action,
      performedBy,
      searchText,
      from,
      to,
      page = 1,
      limit = 20,
    } = params || {};

    const filter: any = {};

    /* ---------- Exact filters ---------- */
    if (entity) filter.entity = entity.trim();
    if (entityId) filter.entityId = entityId.trim();
    if (action) filter.action = action.trim();
    if (performedBy) {
      filter['performedBy.employeeId'] = performedBy.trim();
    }

    /* ---------- Search (partial, case-insensitive) ---------- */
    if (searchText) {
      const regex = new RegExp(searchText.trim(), 'i');
      filter.$or = [
        { entityId: regex },
        { 'performedBy.employeeId': regex },
        { 'performedBy.name': regex },
      ];
    }

    /* ---------- Date range filter ---------- */
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: AUDIT_LOGS.FETCH,
      data: result.items,
      meta: result.meta,
    };
  }

  /* ======================================================
   * GET AUDIT LOG BY ID
   * ====================================================== */

  async findById(id: string) {
    return this.findById(id);
  }
}
