/**
 * Audit Logs Service
 * ------------------
 * Purpose : Handles read-only access to audit log data
 * Used by : AuditLogsController
 *
 * Responsibilities:
 * - Fetch audit logs with filters and pagination
 * - Support text search and date range queries
 * - Return single audit log records
 *
 * Notes:
 * - Audit logs are immutable
 * - No create/update/delete operations are exposed here
 * - This service focuses only on read operations
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { AUDIT_LOGS } from './audit-logs.constants';
import {
  AuditLog,
  AuditLogSchema,
} from 'src/core/database/mongo/schema/audit-log.schema';

@Injectable()
export class AuditLogsService extends MongoRepository<AuditLog> {
  constructor(mongo: MongoService) {
    super(mongo.getModel<AuditLog>(AuditLog.name, AuditLogSchema));
  }

  /**
   * Get Audit Logs (List)
   * --------------------
   * Purpose : Fetch audit logs with filtering, search, and pagination
   * Used by : AUDIT LOG LIST / ADMIN ACTIVITY SCREENS
   *
   * Supports:
   * - Entity-based filtering
   * - Entity ID filtering
   * - Action-based filtering
   * - Performer-based filtering
   * - Text search across entity & performer fields
   * - Date range filtering
   * - Pagination & sorting
   *
   * Notes:
   * - Results are sorted by latest activity first
   */
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

    /* ---------- Exact Match Filters ---------- */
    if (entity) filter.entity = entity.trim();
    if (entityId) filter.entityId = entityId.trim();
    if (action) filter.action = action.trim();
    if (performedBy) {
      filter['performedBy.employeeId'] = performedBy.trim();
    }

    /* ---------- Text Search (Case-Insensitive) ---------- */
    if (searchText) {
      const regex = new RegExp(searchText.trim(), 'i');
      filter.$or = [
        { entityId: regex },
        { 'performedBy.employeeId': regex },
        { 'performedBy.name': regex },
      ];
    }

    /* ---------- Date Range Filtering ---------- */
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

  /**
   * Get Audit Log by ID
   * -------------------
   * Purpose : Fetch a single audit log entry
   * Used by : AUDIT LOG DETAIL / FORENSIC REVIEW
   *
   * Params:
   * - id : Audit log document ID
   */
  async findById(id: string) {
    return this.findById(id);
  }
}
