import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Response } from 'express';
import type { Collection, Filter } from 'mongodb';
import { Connection } from 'mongoose';
import {
  APP_LOGS_COLLECTION,
  logSink,
  StoredLog,
} from 'src/core/logger/log-sink';
import {
  LogLevelFilter,
  SystemLogsDownloadDto,
  SystemLogsFilterDto,
  SystemLogsQueryDto,
} from './dto/system-logs-query.dto';

const LEVEL_VALUE: Record<LogLevelFilter, number> = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_LIMIT = 200_000;
const TRACE_LIMIT = 1_000;
const TTL_INDEX = 'time_ttl';

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class SystemLogsService implements OnModuleInit {
  private readonly logger = new Logger(SystemLogsService.name);
  private readonly collection: Collection<StoredLog>;

  constructor(@InjectConnection() connection: Connection) {
    this.collection = connection.collection<StoredLog>(APP_LOGS_COLLECTION);
  }

  async onModuleInit() {
    try {
      await this.ensureIndexes();
    } catch (error) {
      // Viewing logs degrades without indexes; the API must still start.
      this.logger.error(
        'Could not prepare app_logs indexes',
        error instanceof Error ? error.stack : String(error),
      );
    }
    logSink.attach(this.collection as unknown as Collection);
  }

  /* ==================== QUERIES ==================== */

  async findAll(query: SystemLogsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const filter = this.buildFilter(query);

    const [items, total] = await Promise.all([
      this.collection
        .find(filter)
        .sort({ time: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.collection.countDocuments(filter),
    ]);

    return {
      statusCode: HttpStatus.OK,
      message: 'System logs fetched',
      data: items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Every log line written while serving one request, oldest first. */
  async trace(reqId: string) {
    const items = await this.collection
      .find({ reqId })
      .sort({ time: 1 })
      .limit(TRACE_LIMIT)
      .toArray();

    return {
      statusCode: HttpStatus.OK,
      message: 'Request trace fetched',
      data: items,
    };
  }

  async flows() {
    const since = new Date(Date.now() - 7 * DEFAULT_WINDOW_MS);
    const [flows, contexts] = await Promise.all([
      this.collection.distinct('flow', { time: { $gte: since } }),
      this.collection.distinct('context', { time: { $gte: since } }),
    ]);
    return {
      statusCode: HttpStatus.OK,
      message: 'Log filter options fetched',
      data: {
        flows: flows.filter(Boolean).sort(),
        contexts: contexts.filter(Boolean).sort(),
      },
    };
  }

  /** Health overview for the last `hours`: what is failing, where, how often. */
  async summary(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const [result] = await this.collection
      .aggregate([
        { $match: { time: { $gte: since } } },
        {
          $facet: {
            byLevel: [{ $group: { _id: '$levelLabel', count: { $sum: 1 } } }],
            requests: [
              { $match: { statusCode: { $exists: true } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  serverErrors: {
                    $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] },
                  },
                  clientErrors: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ['$statusCode', 400] },
                            { $lt: ['$statusCode', 500] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  avgResponseTime: { $avg: '$responseTime' },
                },
              },
            ],
            topErrors: [
              { $match: { level: { $gte: 50 } } },
              { $sort: { time: -1 } },
              {
                $group: {
                  _id: {
                    $ifNull: [
                      '$errorMessage',
                      { $ifNull: ['$err.message', '$msg'] },
                    ],
                  },
                  count: { $sum: 1 },
                  lastSeen: { $first: '$time' },
                  sampleReqId: { $first: '$reqId' },
                  flow: { $first: '$flow' },
                  context: { $first: '$context' },
                  users: { $addToSet: '$userId' },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 15 },
            ],
            byFlow: [
              {
                $match: {
                  flow: { $exists: true, $ne: null },
                  statusCode: { $exists: true },
                },
              },
              {
                $group: {
                  _id: '$flow',
                  requests: { $sum: 1 },
                  errors: {
                    $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] },
                  },
                  warnings: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $gte: ['$statusCode', 400] },
                            { $lt: ['$statusCode', 500] },
                          ],
                        },
                        1,
                        0,
                      ],
                    },
                  },
                  avgResponseTime: { $avg: '$responseTime' },
                },
              },
              { $sort: { errors: -1, warnings: -1, requests: -1 } },
              { $limit: 30 },
            ],
            hourly: [
              { $match: { level: { $gte: 40 } } },
              {
                $group: {
                  _id: {
                    $dateToString: {
                      format: '%Y-%m-%dT%H:00:00Z',
                      date: '$time',
                    },
                  },
                  errors: { $sum: { $cond: [{ $gte: ['$level', 50] }, 1, 0] } },
                  warnings: {
                    $sum: { $cond: [{ $lt: ['$level', 50] }, 1, 0] },
                  },
                },
              },
              { $sort: { _id: 1 } },
            ],
            slowest: [
              { $match: { responseTime: { $exists: true } } },
              { $sort: { responseTime: -1 } },
              { $limit: 10 },
              {
                $project: {
                  _id: 0,
                  time: 1,
                  method: 1,
                  url: 1,
                  statusCode: 1,
                  responseTime: 1,
                  reqId: 1,
                  userId: 1,
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const requests = result?.requests?.[0];
    return {
      statusCode: HttpStatus.OK,
      message: 'Log summary fetched',
      data: {
        hours,
        since,
        levels: Object.fromEntries(
          (result?.byLevel ?? []).map((row: any) => [row._id, row.count]),
        ),
        requests: {
          total: requests?.total ?? 0,
          serverErrors: requests?.serverErrors ?? 0,
          clientErrors: requests?.clientErrors ?? 0,
          avgResponseTime: Math.round(requests?.avgResponseTime ?? 0),
        },
        topErrors: (result?.topErrors ?? []).map((row: any) => ({
          message: row._id,
          count: row.count,
          lastSeen: row.lastSeen,
          sampleReqId: row.sampleReqId,
          flow: row.flow,
          context: row.context,
          users: (row.users ?? []).filter(Boolean).slice(0, 10),
        })),
        byFlow: (result?.byFlow ?? []).map((row: any) => ({
          flow: row._id,
          requests: row.requests,
          errors: row.errors,
          warnings: row.warnings,
          avgResponseTime: Math.round(row.avgResponseTime ?? 0),
        })),
        hourly: (result?.hourly ?? []).map((row: any) => ({
          hour: row._id,
          errors: row.errors,
          warnings: row.warnings,
        })),
        slowest: result?.slowest ?? [],
      },
    };
  }

  /* ==================== DOWNLOAD ==================== */

  /** Streams matching logs (oldest first) as a .log or .ndjson file. */
  async download(query: SystemLogsDownloadDto, res: Response) {
    const format = query.format ?? 'text';
    const filter = this.buildFilter(query);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const fileName = `sfa-logs-${stamp}.${format === 'json' ? 'ndjson' : 'log'}`;

    res.setHeader(
      'Content-Type',
      format === 'json' ? 'application/x-ndjson' : 'text/plain; charset=utf-8',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const cursor = this.collection
      .find(filter, { projection: { _id: 0 } })
      .sort({ time: 1 })
      .limit(DOWNLOAD_LIMIT);

    try {
      for await (const log of cursor) {
        const line =
          format === 'json' ? `${JSON.stringify(log)}\n` : formatLogLine(log);
        // Respect back-pressure so a large export does not balloon memory.
        if (!res.write(line)) {
          await new Promise((resolve) => res.once('drain', resolve));
        }
      }
    } finally {
      await cursor.close();
      res.end();
    }
  }

  /* ==================== HELPERS ==================== */

  buildFilter(query: SystemLogsFilterDto): Filter<StoredLog> {
    const filter: Filter<StoredLog> = {};

    // A request id pins the search; otherwise default to the last 24 hours
    // so text searches never scan the whole retention window by accident.
    if (!query.reqId || query.from || query.to) {
      const to = query.to ? new Date(query.to) : new Date();
      const from = query.from
        ? new Date(query.from)
        : new Date(to.getTime() - DEFAULT_WINDOW_MS);
      filter.time = { $gte: from, $lte: to };
    }

    if (query.level) filter.level = { $gte: LEVEL_VALUE[query.level] };
    if (query.reqId) filter.reqId = query.reqId;
    if (query.userId) filter.userId = query.userId;
    if (query.vanId) filter.vanId = query.vanId;
    if (query.flow) filter.flow = query.flow;
    if (query.context) filter.context = query.context;

    if (query.status === '2xx') filter.statusCode = { $gte: 200, $lt: 300 };
    if (query.status === '4xx') filter.statusCode = { $gte: 400, $lt: 500 };
    if (query.status === '5xx') filter.statusCode = { $gte: 500 };

    const search = query.search?.trim();
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: 'i' };
      filter.$or = [
        { msg: regex },
        { url: regex },
        { errorMessage: regex },
        { 'err.message': regex },
        { reqId: search },
        { userId: search },
      ];
    }

    return filter;
  }

  private async ensureIndexes() {
    const retentionDays = Math.max(
      1,
      Number(process.env.LOG_RETENTION_DAYS) || 14,
    );
    const expireAfterSeconds = retentionDays * 24 * 60 * 60;

    const existing: { name?: string; expireAfterSeconds?: number }[] =
      await this.collection.indexes().catch(() => []);
    const ttl = existing.find((index) => index.name === TTL_INDEX);

    if (!ttl) {
      await this.collection.createIndex(
        { time: -1 },
        { name: TTL_INDEX, expireAfterSeconds },
      );
    } else if (ttl.expireAfterSeconds !== expireAfterSeconds) {
      // Changing LOG_RETENTION_DAYS must not need a manual index rebuild.
      await this.collection.db.command({
        collMod: APP_LOGS_COLLECTION,
        index: { name: TTL_INDEX, expireAfterSeconds },
      });
    }

    await Promise.all([
      this.collection.createIndex({ level: 1, time: -1 }),
      this.collection.createIndex({ reqId: 1 }),
      this.collection.createIndex({ userId: 1, time: -1 }),
      this.collection.createIndex({ flow: 1, time: -1 }),
    ]);
  }
}

/** One human-readable line (plus indented stack) per log entry. */
export function formatLogLine(log: StoredLog): string {
  const parts = [
    new Date(log.time).toISOString(),
    (log.levelLabel ?? '').toUpperCase().padEnd(5),
    log.context ? `[${log.context}]` : '',
    log.msg,
    log.reqId ? `reqId=${log.reqId}` : '',
    log.userId ? `user=${log.userId}` : '',
    log.vanId ? `van=${log.vanId}` : '',
    log.errorMessage ? `| ${log.errorMessage}` : '',
    log.meta && !log.err ? `| ${log.meta}` : '',
  ].filter(Boolean);

  let line = `${parts.join(' ')}\n`;
  const stack = log.err?.stack ?? log.err?.message;
  if (stack) line += `${stack.replace(/^/gm, '    ')}\n`;
  return line;
}
