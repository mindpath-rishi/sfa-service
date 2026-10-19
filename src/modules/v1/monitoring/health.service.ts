import { HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { promises as fs } from 'fs';
import { Connection } from 'mongoose';
import * as oracledb from 'oracledb';
import { join } from 'path';
import { monitorEventLoopDelay, type IntervalHistogram } from 'perf_hooks';
import { RedisRepository } from 'src/core/database/radis/radis.repository';
import { APP_LOGS_COLLECTION } from 'src/core/logger/log-sink';
import { socketCounts } from 'src/core/metrics/app-metrics';
import { stuckItems } from '../feature-debug/inspectors/sync.inspector';
import { DIAGNOSTICS, DiagnosticsService, STALE_AFTER_MS } from '../diagnostics/diagnostics.service';
import { isBelow } from '../diagnostics/version.utils';

export type HealthStatus = 'OK' | 'WARN' | 'DOWN' | 'DISABLED';

export type HealthComponent = {
  key: string;
  label: string;
  status: HealthStatus;
  summary: string;
  metrics: Record<string, unknown>;
};

const env = (name: string, fallback: number) => Number(process.env[name]) || fallback;
const THRESHOLDS = {
  eventLoopP99Ms: env('HEALTH_EVENT_LOOP_WARN_MS', 200),
  memoryMb: env('HEALTH_MEMORY_WARN_MB', 1536),
  diskFreePercent: env('HEALTH_DISK_WARN_PERCENT', 10),
  errorRate: env('HEALTH_ERROR_RATE_WARN', 0.05),
  minRequestsForRate: 20,
  erpPendingHours: env('HEALTH_ERP_PENDING_WARN_HOURS', 2),
};

const ms = (start: number) => Date.now() - start;
const mb = (bytes: number) => Math.round(bytes / 1024 / 1024);
const worst = (statuses: HealthStatus[]): HealthStatus =>
  statuses.includes('DOWN') ? 'DOWN' : statuses.includes('WARN') ? 'WARN' : 'OK';

/** One snapshot of everything the API depends on, plus field-side health. */
@Injectable()
export class HealthService implements OnModuleInit, OnModuleDestroy {
  private loopDelay?: IntervalHistogram;
  private cpu = { usage: process.cpuUsage(), at: Date.now() };

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisRepository,
    private readonly diagnostics: DiagnosticsService,
  ) {}

  onModuleInit() {
    this.loopDelay = monitorEventLoopDelay({ resolution: 20 });
    this.loopDelay.enable();
  }

  onModuleDestroy() {
    this.loopDelay?.disable();
  }

  async snapshot() {
    const components = await Promise.all([
      this.guard('mongo', 'MongoDB', () => this.mongo()),
      this.guard('redis', 'Redis', () => this.redisHealth()),
      this.guard('oracle', 'Oracle (ERP)', () => this.oracle()),
      this.guard('process', 'API process', () => this.process()),
      this.guard('disk', 'Upload storage', () => this.disk()),
      this.guard('traffic', 'API traffic (15 min)', () => this.traffic()),
      this.guard('erp', 'ERP sync backlog', () => this.erp()),
      this.guard('sync', 'Offline sync', () => this.offlineSync()),
      this.guard('phones', 'Phones', () => this.phones()),
    ]);
    return {
      status: worst(components.map((component) => component.status)),
      checkedAt: new Date().toISOString(),
      components,
    };
  }

  async health() {
    return { statusCode: HttpStatus.OK, message: 'Health checked', data: await this.snapshot() };
  }

  /* ==================== COMPONENTS ==================== */

  private async mongo(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const start = Date.now();
    const admin = this.connection.db!.admin();
    await admin.ping();
    const latencyMs = ms(start);
    const status = await admin.serverStatus().catch(() => null);
    return {
      status: latencyMs > 500 ? 'WARN' : 'OK',
      summary: `Ping ${latencyMs} ms${status ? `, ${status.connections?.current} connections` : ''}`,
      metrics: {
        latencyMs,
        connections: status?.connections?.current,
        availableConnections: status?.connections?.available,
        version: status?.version,
        uptimeHours: status ? Math.round(status.uptime / 3600) : undefined,
      },
    };
  }

  private async redisHealth(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const start = Date.now();
    await this.redis.client.ping();
    const latencyMs = ms(start);
    const info = await this.redis.client.info().catch(() => '');
    const field = (name: string) => info.match(new RegExp(`^${name}:(.*)$`, 'm'))?.[1]?.trim();
    return {
      status: latencyMs > 200 ? 'WARN' : 'OK',
      summary: `Ping ${latencyMs} ms, ${field('used_memory_human') ?? '?'} used`,
      metrics: {
        latencyMs,
        usedMemory: field('used_memory_human'),
        clients: Number(field('connected_clients') ?? 0),
        version: field('redis_version'),
      },
    };
  }

  private async oracle(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    if (process.env.ORACLE_ENABLED !== 'true') {
      return { status: 'DISABLED', summary: 'ORACLE_ENABLED is not true; ERP sync is off', metrics: {} };
    }
    let pool: oracledb.Pool;
    try {
      pool = oracledb.getPool();
    } catch {
      return { status: 'DOWN', summary: 'Oracle is enabled but no connection pool exists (startup failed?)', metrics: {} };
    }
    const start = Date.now();
    const connection = await pool.getConnection();
    try {
      await connection.ping();
    } finally {
      await connection.close();
    }
    const latencyMs = ms(start);
    const busy = pool.connectionsInUse / Math.max(1, pool.poolMax);
    return {
      status: latencyMs > 2000 || busy >= 0.9 ? 'WARN' : 'OK',
      summary: `Ping ${latencyMs} ms, ${pool.connectionsInUse}/${pool.poolMax} connections in use`,
      metrics: { latencyMs, open: pool.connectionsOpen, inUse: pool.connectionsInUse, max: pool.poolMax, status: pool.status },
    };
  }

  private async process(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const memory = process.memoryUsage();
    const now = Date.now();
    const usage = process.cpuUsage(this.cpu.usage);
    const cpuPercent = Math.round(((usage.user + usage.system) / 1000 / Math.max(1, now - this.cpu.at)) * 100);
    this.cpu = { usage: process.cpuUsage(), at: now };

    const p99 = this.loopDelay ? Math.round(this.loopDelay.percentile(99) / 1e6) : 0;
    const max = this.loopDelay ? Math.round(this.loopDelay.max / 1e6) : 0;
    this.loopDelay?.reset();

    const rssMb = mb(memory.rss);
    const sockets = socketCounts();
    const warnings = [
      p99 > THRESHOLDS.eventLoopP99Ms ? `event loop p99 ${p99} ms` : '',
      rssMb > THRESHOLDS.memoryMb ? `memory ${rssMb} MB` : '',
    ].filter(Boolean);

    return {
      status: warnings.length ? 'WARN' : 'OK',
      summary: warnings.length
        ? `Slow: ${warnings.join(', ')}`
        : `Up ${Math.round(process.uptime() / 3600)} h, ${rssMb} MB, CPU ${cpuPercent}%`,
      metrics: {
        uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
        rssMb,
        heapUsedMb: mb(memory.heapUsed),
        heapTotalMb: mb(memory.heapTotal),
        cpuPercent,
        eventLoopP99Ms: p99,
        eventLoopMaxMs: max,
        node: process.version,
        pid: process.pid,
        sockets,
      },
    };
  }

  private async disk(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const path = join(process.cwd(), 'uploads');
    const stats = await fs.statfs(path);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const freePercent = Math.round((free / Math.max(1, total)) * 1000) / 10;
    return {
      status: freePercent < THRESHOLDS.diskFreePercent ? 'WARN' : 'OK',
      summary: `${mb(free).toLocaleString()} MB free (${freePercent}%)`,
      metrics: { path, freeMb: mb(free), totalMb: mb(total), freePercent },
    };
  }

  private async traffic(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const since = new Date(Date.now() - 15 * 60_000);
    const [row] = await this.connection
      .collection(APP_LOGS_COLLECTION)
      .aggregate([
        { $match: { time: { $gte: since }, statusCode: { $exists: true } } },
        {
          $group: {
            _id: null,
            requests: { $sum: 1 },
            serverErrors: { $sum: { $cond: [{ $gte: ['$statusCode', 500] }, 1, 0] } },
            avgMs: { $avg: '$responseTime' },
            slow: { $sum: { $cond: [{ $gte: ['$responseTime', 3000] }, 1, 0] } },
          },
        },
      ])
      .toArray();
    const requests = row?.requests ?? 0;
    const errorRate = requests ? row!.serverErrors / requests : 0;
    const high = requests >= THRESHOLDS.minRequestsForRate && errorRate >= THRESHOLDS.errorRate;
    return {
      status: high ? 'WARN' : 'OK',
      summary: `${requests} requests, ${row?.serverErrors ?? 0} server errors (${(errorRate * 100).toFixed(1)}%), avg ${Math.round(row?.avgMs ?? 0)} ms`,
      metrics: {
        requests,
        serverErrors: row?.serverErrors ?? 0,
        errorRatePercent: Math.round(errorRate * 1000) / 10,
        avgResponseMs: Math.round(row?.avgMs ?? 0),
        slowRequests: row?.slow ?? 0,
      },
    };
  }

  private async erp(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const db = this.connection;
    const pendingBefore = new Date(Date.now() - THRESHOLDS.erpPendingHours * 3600_000);
    const [salesFailed, salesStale, topupsFailed, oldest] = await Promise.all([
      db.collection('sales').countDocuments({ erpSyncStatus: 'FAILED', isDeleted: { $ne: true } }),
      db.collection('sales').countDocuments({ erpSyncStatus: 'PENDING', isDeleted: { $ne: true }, createdAt: { $lt: pendingBefore } }),
      db.collection('van_inventory_topup_items').countDocuments({ erpRequestSyncStatus: 'FAILED', isDeleted: { $ne: true } }),
      db.collection('sales').findOne({ erpSyncStatus: { $in: ['FAILED', 'PENDING'] }, isDeleted: { $ne: true } }, { sort: { createdAt: 1 }, projection: { createdAt: 1 } }),
    ]);
    const disabled = process.env.ORACLE_ENABLED !== 'true';
    const backlog = salesFailed + salesStale + topupsFailed;
    return {
      status: backlog && !disabled ? 'WARN' : 'OK',
      summary: backlog
        ? `${salesFailed} sales failed, ${salesStale} sales pending > ${THRESHOLDS.erpPendingHours} h, ${topupsFailed} top-up lines failed${disabled ? ' (ERP is off)' : ''}`
        : 'Nothing waiting for ERP',
      metrics: {
        salesFailed,
        salesPendingStale: salesStale,
        topupLinesFailed: topupsFailed,
        oldestUnsentAt: oldest?.createdAt ?? null,
      },
    };
  }

  private async offlineSync(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const stuck = await stuckItems(this.connection.db as any, {});
    const owners = new Set(stuck.map((item) => item._id.ownerId)).size;
    const conflicts = stuck.filter((item) => item.error === 'VERSION_CONFLICT').length;
    const lastHour = await this.connection.collection('offline_sync_audit_logs').aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 3600_000) } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).toArray();
    const counts = Object.fromEntries(lastHour.map((row) => [row._id, row.count]));
    return {
      status: stuck.length ? 'WARN' : 'OK',
      summary: stuck.length
        ? `${stuck.length} change(s) stuck on ${owners} phone(s), ${conflicts} conflict(s)`
        : `No stuck changes; ${counts.SUCCESS ?? 0} uploads in the last hour`,
      metrics: { stuckChanges: stuck.length, phonesAffected: owners, conflicts, uploadsLastHour: counts },
    };
  }

  private async phones(): Promise<Omit<HealthComponent, 'key' | 'label'>> {
    const config = await this.diagnostics.appConfig();
    const recent = await this.connection
      .collection(DIAGNOSTICS)
      .find({ lastHeartbeatAt: { $gte: new Date(Date.now() - 24 * 3600_000) } }, { projection: { userId: 1, appVersion: 1, lastHeartbeatAt: 1, 'queue.failed': 1, permissions: 1 } })
      .toArray();
    const staleBefore = Date.now() - STALE_AFTER_MS;
    const openDayUsers = new Set(
      (await this.connection.collection('work_sessions').distinct('userId', { status: { $ne: 'COMPLETED' }, isDeleted: { $ne: true }, dayStartTime: { $gte: new Date(Date.now() - 24 * 3600_000) } })).map(String),
    );
    const quiet = recent.filter((row) => openDayUsers.has(String(row.userId)) && new Date(row.lastHeartbeatAt).getTime() < staleBefore).length;
    const mustUpdate = recent.filter((row) => isBelow(row.appVersion, config.minAppVersion)).length;
    const noLocation = recent.filter((row) => row.permissions && row.permissions.backgroundLocation !== 'granted').length;
    return {
      status: quiet || mustUpdate ? 'WARN' : 'OK',
      summary: recent.length
        ? `${recent.length} phones checked in today; ${quiet} quiet during an open day, ${mustUpdate} below the minimum version, ${noLocation} without background location`
        : 'No phone has checked in yet (apps need the diagnostics update)',
      metrics: { activeToday: recent.length, quietDuringDay: quiet, belowMinimumVersion: mustUpdate, withoutBackgroundLocation: noLocation, openDays: openDayUsers.size },
    };
  }

  /** One failing dependency must not break the whole health page. */
  private async guard(
    key: string,
    label: string,
    run: () => Promise<Omit<HealthComponent, 'key' | 'label'>>,
  ): Promise<HealthComponent> {
    try {
      const result = await Promise.race([
        run(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timed out after 10 s')), 10_000).unref()),
      ]);
      return { key, label, ...result };
    } catch (error) {
      return { key, label, status: 'DOWN', summary: (error as Error)?.message ?? String(error), metrics: {} };
    }
  }
}
