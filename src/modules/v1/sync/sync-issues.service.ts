import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { ResolveSyncIssueDto, SyncIssuesQueryDto } from './dto/sync-issues.dto';
import { SYNC_RESOLUTIONS_COLLECTION, SyncService } from './sync.service';

const AUDIT_COLLECTION = 'offline_sync_audit_logs';
const CONFLICT_ERROR = 'VERSION_CONFLICT';
const DEFAULT_WINDOW_DAYS = 30;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Offline operations whose latest attempt failed, grouped per device queue
 * item (the app retries the same item, so one problem = many audit rows),
 * plus the Super Admin's decision on how to clear them.
 */
@Injectable()
export class SyncIssuesService implements OnModuleInit {
  private readonly logger = new Logger(SyncIssuesService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly syncService: SyncService,
  ) {}

  async onModuleInit() {
    await this.connection
      .collection(SYNC_RESOLUTIONS_COLLECTION)
      .createIndex({ ownerId: 1, queueId: 1, status: 1 })
      .catch((error) =>
        this.logger.warn(
          `Could not create resolution index: ${error?.message}`,
        ),
      );
  }

  async findAll(query: SyncIssuesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const type = query.type ?? 'CONFLICT';
    const state = query.state ?? 'ALL';
    const from = query.from
      ? new Date(query.from)
      : new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const match: Record<string, unknown> = { createdAt: { $gte: from } };
    if (query.ownerId) match.ownerId = query.ownerId;
    if (query.entity) match.entity = query.entity;

    const issueMatch: Record<string, unknown> = { lastStatus: 'FAILED' };
    if (type === 'CONFLICT') issueMatch.lastError = CONFLICT_ERROR;
    if (type === 'ERROR') issueMatch.lastError = { $ne: CONFLICT_ERROR };
    if (query.search?.trim()) {
      issueMatch.lastError = {
        ...(type === 'ERROR' ? { $ne: CONFLICT_ERROR } : {}),
        $regex: escapeRegex(query.search.trim()),
        $options: 'i',
      };
    }

    const stateMatch =
      state === 'OPEN'
        ? { resolution: null }
        : state === 'WAITING'
          ? { 'resolution.status': 'WAITING' }
          : {};

    const [result] = await this.connection
      .collection(AUDIT_COLLECTION)
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: {
              ownerId: '$ownerId',
              queueId: '$queueId',
              localId: '$localId',
            },
            latestAuditId: { $first: '$auditId' },
            lastStatus: { $first: '$status' },
            lastError: { $first: '$error' },
            entity: { $first: '$entity' },
            operation: { $first: '$operation' },
            businessId: { $first: '$businessId' },
            lastAttemptAt: { $first: '$createdAt' },
            firstAttemptAt: { $last: '$createdAt' },
            attempts: { $sum: 1 },
          },
        },
        { $match: issueMatch },
        {
          $lookup: {
            from: SYNC_RESOLUTIONS_COLLECTION,
            let: {
              ownerId: '$_id.ownerId',
              queueId: '$_id.queueId',
              localId: '$_id.localId',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$ownerId', '$$ownerId'] },
                      { $eq: ['$queueId', '$$queueId'] },
                      { $eq: ['$localId', '$$localId'] },
                      { $eq: ['$status', 'WAITING'] },
                    ],
                  },
                },
              },
              { $sort: { createdAt: -1 } },
              { $limit: 1 },
              {
                $project: {
                  _id: 0,
                  resolutionId: 1,
                  action: 1,
                  status: 1,
                  resolvedBy: 1,
                  createdAt: 1,
                },
              },
            ],
            as: 'resolution',
          },
        },
        {
          $set: { resolution: { $ifNull: [{ $first: '$resolution' }, null] } },
        },
        { $match: stateMatch },
        {
          $facet: {
            items: [
              { $sort: { lastAttemptAt: -1 } },
              { $skip: (page - 1) * limit },
              { $limit: limit },
              {
                $lookup: {
                  // let/$expr form: localField+pipeline needs MongoDB 5.0.
                  from: 'employees',
                  let: { ownerId: '$_id.ownerId' },
                  pipeline: [
                    {
                      $match: { $expr: { $eq: ['$employeeId', '$$ownerId'] } },
                    },
                    { $limit: 1 },
                    { $project: { _id: 0, name: 1, vanId: 1 } },
                  ],
                  as: 'owner',
                },
              },
            ],
            total: [{ $count: 'count' }],
            byError: [
              { $group: { _id: '$lastError', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ],
          },
        },
      ])
      .toArray();

    const total = result?.total?.[0]?.count ?? 0;
    return {
      statusCode: HttpStatus.OK,
      message: 'Offline sync issues fetched',
      data: (result?.items ?? []).map((row: any) => ({
        auditId: row.latestAuditId,
        ownerId: row._id.ownerId,
        ownerName: row.owner?.[0]?.name,
        queueId: row._id.queueId,
        localId: row._id.localId,
        entity: row.entity,
        operation: row.operation,
        businessId: row.businessId,
        error: row.lastError,
        isConflict: row.lastError === CONFLICT_ERROR,
        attempts: row.attempts,
        firstAttemptAt: row.firstAttemptAt,
        lastAttemptAt: row.lastAttemptAt,
        resolution: row.resolution,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        byError: (result?.byError ?? []).map((row: any) => ({
          error: row._id,
          count: row.count,
        })),
      },
    };
  }

  /** The salesman's change next to the current server record, plus history. */
  async findOne(auditId: string) {
    const audit = await this.getAudit(auditId);
    const key = {
      ownerId: audit.ownerId,
      queueId: audit.queueId,
      localId: audit.localId,
    };

    const [attempts, resolutions, owner, server] = await Promise.all([
      this.connection
        .collection(AUDIT_COLLECTION)
        .find(key, {
          projection: {
            _id: 0,
            auditId: 1,
            status: 1,
            error: 1,
            createdAt: 1,
            version: 1,
          },
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
      this.connection
        .collection(SYNC_RESOLUTIONS_COLLECTION)
        .find(key, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      this.connection
        .collection('employees')
        .findOne(
          { employeeId: audit.ownerId },
          { projection: { _id: 0, name: 1, vanId: 1, mobile: 1 } },
        ),
      this.syncService
        .findServerRecord({
          entity: audit.entity,
          ownerId: audit.ownerId,
          localId: audit.localId,
          businessId: audit.businessId,
          serverId: String(audit.result?.serverId ?? audit.before?._id ?? ''),
          payload: audit.cleanedPayload ?? audit.rawPayload,
        })
        .catch(() => null),
    ]);

    return {
      statusCode: HttpStatus.OK,
      message: 'Offline sync issue fetched',
      data: {
        auditId: audit.auditId,
        ownerId: audit.ownerId,
        owner,
        queueId: audit.queueId,
        localId: audit.localId,
        entity: audit.entity,
        operation: audit.operation,
        businessId: audit.businessId,
        error: audit.error,
        isConflict: audit.error === CONFLICT_ERROR,
        status: audit.status,
        createdAt: audit.createdAt,
        clientVersion: Number(audit.rawPayload?.version ?? 0) || null,
        clientPayload: audit.cleanedPayload ?? audit.rawPayload ?? null,
        serverRecord: server?.record ?? null,
        attempts,
        resolutions,
      },
    };
  }

  async resolve(auditId: string, dto: ResolveSyncIssueDto) {
    const audit = await this.getAudit(auditId);

    if (dto.action === 'APPLY_CLIENT' && audit.error !== CONFLICT_ERROR) {
      // Only a version conflict can be overridden; other errors (validation,
      // missing record) would fail again however often the device retries.
      throw new BadRequestException(
        "Only version conflicts can apply the salesman's change. Discard it on the device instead.",
      );
    }

    const context = RequestContextStore.getStore();
    const now = new Date();
    const key = {
      ownerId: audit.ownerId,
      queueId: audit.queueId,
      localId: audit.localId,
    };
    const resolution = {
      resolutionId: IdGenerator.generate('SRES', 10),
      ...key,
      entity: audit.entity,
      operation: audit.operation,
      auditId: audit.auditId,
      error: audit.error,
      action: dto.action,
      note: dto.note,
      status: 'WAITING',
      resolvedBy: {
        employeeId: context?.userId,
        name: context?.name,
        role: context?.role,
      },
      createdAt: now,
      updatedAt: now,
    };

    const resolutions = this.connection.collection(SYNC_RESOLUTIONS_COLLECTION);
    // A new decision replaces one the device has not picked up yet.
    await resolutions.updateMany(
      { ...key, status: 'WAITING' },
      { $set: { status: 'REPLACED', updatedAt: now } },
    );
    await resolutions.insertOne(resolution);

    this.logger.log(
      `Sync issue ${audit.auditId} (${audit.entity} ${audit.operation}, salesman ${audit.ownerId}) resolved as ${dto.action}`,
    );

    return {
      statusCode: HttpStatus.OK,
      message: 'Decision saved; it is applied the next time the device syncs',
      data: resolution,
    };
  }

  async cancel(auditId: string) {
    const audit = await this.getAudit(auditId);
    const result = await this.connection
      .collection(SYNC_RESOLUTIONS_COLLECTION)
      .updateMany(
        {
          ownerId: audit.ownerId,
          queueId: audit.queueId,
          localId: audit.localId,
          status: 'WAITING',
        },
        { $set: { status: 'CANCELLED', updatedAt: new Date() } },
      );

    return {
      statusCode: HttpStatus.OK,
      message: result.modifiedCount
        ? 'Decision cancelled'
        : 'Nothing was waiting for this issue',
      data: { cancelled: result.modifiedCount },
    };
  }

  private async getAudit(auditId: string) {
    const audit = await this.connection
      .collection(AUDIT_COLLECTION)
      .findOne({ auditId });
    if (!audit) throw new NotFoundException('Sync issue not found');
    return audit as Record<string, any>;
  }
}
