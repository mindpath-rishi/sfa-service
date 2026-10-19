import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { PinoLogger } from 'nestjs-pino';
import { Connection } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { RedisRepository } from 'src/core/database/radis/radis.repository';
import { logSink } from 'src/core/logger/log-sink';
import { mobileErrorsTotal } from 'src/core/metrics/app-metrics';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import {
  AppConfigDto,
  CompleteCommandDto,
  CreateCommandDto,
  DebugLoggingDto,
  DevicesQueryDto,
  DiagnosticReportDto,
  HeartbeatDto,
  MobileErrorsDto,
} from './dto/diagnostics.dto';
import { compareVersions, isBelow } from './version.utils';

export const DIAGNOSTICS = 'device_diagnostics';
export const COMMANDS = 'device_commands';
export const REPORTS = 'diagnostic_reports';
export const APP_CONFIG = 'app_runtime_config';
export const DEBUG_USERS = 'debug_log_users';

/** A phone that has not checked in for this long is "stale". */
export const STALE_AFTER_MS = 30 * 60 * 1000;
const LOW_STORAGE_MB = 500;
const REPORT_TTL_DAYS = 30;
const CONFIG_CACHE_MS = 60_000;

export type AppConfig = {
  minAppVersion?: string;
  latestAppVersion?: string;
  updateMessage?: string;
  storeUrl?: string;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Phone health reported by the app (heartbeats, errors, diagnostic reports)
 * and the controls Super Admin has over phones: commands, minimum app
 * version and per-user debug logging.
 */
@Injectable()
export class DiagnosticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiagnosticsService.name);
  private configCache?: { value: AppConfig; at: number };
  private debugTimer?: NodeJS.Timeout;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly pino: PinoLogger,
    private readonly redis: RedisRepository,
  ) {
    this.pino.setContext('Mobile');
  }

  private col(name: string) {
    return this.connection.collection(name);
  }

  async onModuleInit() {
    await Promise.all([
      this.col(DIAGNOSTICS).createIndex({ userId: 1, deviceId: 1 }, { unique: true }),
      this.col(DIAGNOSTICS).createIndex({ lastHeartbeatAt: -1 }),
      this.col(COMMANDS).createIndex({ userId: 1, status: 1 }),
      this.col(REPORTS).createIndex({ createdAt: 1 }, { expireAfterSeconds: REPORT_TTL_DAYS * 86400 }),
      this.col(REPORTS).createIndex({ userId: 1, createdAt: -1 }),
      this.col(DEBUG_USERS).createIndex({ userId: 1 }, { unique: true }),
    ]).catch((error) => this.logger.warn(`Diagnostics indexes: ${error?.message}`));

    await this.refreshDebugUsers();
    this.debugTimer = setInterval(() => void this.refreshDebugUsers(), 30_000);
    this.debugTimer.unref();
  }

  onModuleDestroy() {
    if (this.debugTimer) clearInterval(this.debugTimer);
  }

  /* ==================== PHONE → SERVER ==================== */

  async heartbeat(dto: HeartbeatDto, headerVersion?: string) {
    const userId = this.currentUserId();
    const now = new Date();
    const appVersion = dto.appVersion ?? headerVersion;

    await this.col(DIAGNOSTICS).updateOne(
      { userId, deviceId: dto.deviceId },
      {
        $set: { ...dto, appVersion, userId, lastHeartbeatAt: now },
        $setOnInsert: { firstSeenAt: now },
      },
      { upsert: true },
    );

    // Hand over pending commands (for this device, or for any of the user's).
    const commands = await this.col(COMMANDS)
      .find({ userId, status: 'PENDING', $or: [{ deviceId: null }, { deviceId: { $exists: false } }, { deviceId: dto.deviceId }] })
      .sort({ createdAt: 1 })
      .toArray();
    if (commands.length) {
      await this.col(COMMANDS).updateMany(
        { _id: { $in: commands.map((command) => command._id) } },
        { $set: { status: 'DELIVERED', deliveredAt: now, deviceId: dto.deviceId } },
      );
    }

    const config = await this.appConfig();
    const debug = await this.col(DEBUG_USERS).findOne({ userId, until: { $gt: now } });

    return {
      statusCode: HttpStatus.OK,
      message: 'Heartbeat received',
      data: {
        serverTime: now.toISOString(),
        minAppVersion: config.minAppVersion || null,
        latestAppVersion: config.latestAppVersion || null,
        updateRequired: isBelow(appVersion, config.minAppVersion),
        updateAvailable: isBelow(appVersion, config.latestAppVersion),
        updateMessage: config.updateMessage || null,
        storeUrl: config.storeUrl || null,
        debugLogging: Boolean(debug),
        commands: commands.map((command) => ({ commandId: command.commandId, command: command.command })),
      },
    };
  }

  /** Phone-side errors go into the same log store as server logs. */
  reportErrors(dto: MobileErrorsDto) {
    for (const error of dto.errors) {
      mobileErrorsTotal.labels(error.level).inc();
      const fields = {
        source: 'mobile',
        appVersion: dto.appVersion,
        deviceId: dto.deviceId,
        screen: error.screen,
        mobileContext: error.context,
        clientTime: error.time,
        clientReqId: error.reqId,
        ...(error.meta ? { mobileMeta: error.meta } : {}),
        ...(error.stack ? { err: { type: 'MobileError', message: error.message, stack: error.stack } } : {}),
      };
      const message = `[app] ${error.message}`;
      if (error.level === 'fatal') this.pino.fatal(fields, message);
      else if (error.level === 'error') this.pino.error(fields, message);
      else if (error.level === 'warn') this.pino.warn(fields, message);
      else this.pino.info(fields, message);
    }
    return { statusCode: HttpStatus.OK, message: 'Errors received', data: { received: dto.errors.length } };
  }

  async saveReport(dto: DiagnosticReportDto) {
    const userId = this.currentUserId();
    const reportId = IdGenerator.generate('DREP', 10);
    // Keep reports bounded: newest 1000 lines, each at most 2 KB.
    const logs = (dto.logs ?? []).slice(-1000).map((line) => line.slice(0, 2000));
    await this.col(REPORTS).insertOne({
      reportId,
      userId,
      deviceId: dto.deviceId,
      commandId: dto.commandId,
      appVersion: dto.appVersion,
      logs,
      queue: dto.queue ?? [],
      diagnostics: dto.diagnostics ?? null,
      createdAt: new Date(),
    });
    if (dto.commandId) {
      await this.col(COMMANDS).updateOne(
        { commandId: dto.commandId, userId },
        { $set: { status: 'DONE', completedAt: new Date(), result: { reportId } } },
      );
    }
    this.logger.log(`Diagnostic report ${reportId} received from ${userId} (${logs.length} log lines)`);
    return { statusCode: HttpStatus.CREATED, message: 'Report received', data: { reportId } };
  }

  async completeCommand(commandId: string, dto: CompleteCommandDto) {
    const userId = this.currentUserId();
    const result = await this.col(COMMANDS).updateOne(
      { commandId, userId },
      { $set: { status: dto.success ? 'DONE' : 'FAILED', completedAt: new Date(), result: { message: dto.message } } },
    );
    if (!result.matchedCount) throw new NotFoundException('Command not found');
    return { statusCode: HttpStatus.OK, message: 'Command updated', data: { commandId } };
  }

  /* ==================== MIS ==================== */

  async devices(query: DevicesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const config = await this.appConfig();
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);

    const match: Record<string, unknown> = {};
    if (query.appVersion) match.appVersion = query.appVersion;
    if (query.issue === 'STALE') match.lastHeartbeatAt = { $lt: staleBefore };
    if (query.issue === 'QUEUE') match.$or = [{ 'queue.failed': { $gt: 0 } }, { 'queue.pending': { $gt: 20 } }];
    if (query.issue === 'PERMISSIONS') {
      match.$or = [
        { 'permissions.location': { $ne: 'granted' } },
        { 'permissions.backgroundLocation': { $ne: 'granted' } },
        { 'permissions.notifications': { $ne: 'granted' } },
      ];
    }
    if (query.issue === 'STORAGE') match.freeStorageMb = { $lt: LOW_STORAGE_MB };

    const pipeline: Record<string, unknown>[] = [
      { $match: match },
      {
        $lookup: {
          from: 'employees',
          let: { userId: '$userId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$employeeId', '$$userId'] } } },
            { $limit: 1 },
            { $project: { _id: 0, name: 1, mobile: 1 } },
          ],
          as: 'employee',
        },
      },
      { $set: { employeeName: { $first: '$employee.name' } } },
      { $unset: 'employee' },
    ];
    if (query.search?.trim()) {
      const regex = { $regex: escapeRegex(query.search.trim()), $options: 'i' };
      pipeline.push({ $match: { $or: [{ userId: regex }, { employeeName: regex }, { deviceModel: regex }] } });
    }

    let rows = await this.col(DIAGNOSTICS).aggregate(pipeline).sort({ lastHeartbeatAt: -1 }).toArray();
    // Version comparison is numeric, so the OUTDATED filter runs here.
    if (query.issue === 'OUTDATED') rows = rows.filter((row) => isBelow(row.appVersion, config.latestAppVersion || config.minAppVersion));

    const versions = await this.col(DIAGNOSTICS)
      .aggregate([
        { $match: { lastHeartbeatAt: { $gte: new Date(Date.now() - 7 * 86400_000) } } },
        { $group: { _id: '$appVersion', devices: { $sum: 1 } } },
      ])
      .toArray();

    return {
      statusCode: HttpStatus.OK,
      message: 'Devices fetched',
      data: rows.slice((page - 1) * limit, page * limit).map((row) => ({
        ...row,
        stale: !row.lastHeartbeatAt || new Date(row.lastHeartbeatAt) < staleBefore,
        updateRequired: isBelow(row.appVersion, config.minAppVersion),
        outdated: isBelow(row.appVersion, config.latestAppVersion),
      })),
      meta: {
        total: rows.length,
        page,
        limit,
        totalPages: Math.ceil(rows.length / limit),
        versions: versions
          .map((row) => ({ version: row._id ?? 'unknown', devices: row.devices }))
          .sort((a, b) => compareVersions(b.version, a.version)),
        config,
      },
    };
  }

  async deviceDetail(userId: string) {
    const [devices, commands, reports, debug, employee] = await Promise.all([
      this.col(DIAGNOSTICS).find({ userId }).sort({ lastHeartbeatAt: -1 }).toArray(),
      this.col(COMMANDS).find({ userId }).sort({ createdAt: -1 }).limit(20).toArray(),
      this.col(REPORTS).find({ userId }, { projection: { logs: 0, queue: 0 } }).sort({ createdAt: -1 }).limit(10).toArray(),
      this.col(DEBUG_USERS).findOne({ userId, until: { $gt: new Date() } }),
      this.col('employees').findOne({ employeeId: userId }, { projection: { _id: 0, name: 1, mobile: 1, status: 1 } }),
    ]);
    return {
      statusCode: HttpStatus.OK,
      message: 'Device detail fetched',
      data: { userId, employee, devices, commands, reports, debugLoggingUntil: debug?.until ?? null },
    };
  }

  async report(reportId: string) {
    const report = await this.col(REPORTS).findOne({ reportId });
    if (!report) throw new NotFoundException('Report not found');
    return { statusCode: HttpStatus.OK, message: 'Report fetched', data: report };
  }

  async createCommand(dto: CreateCommandDto) {
    const context = RequestContextStore.getStore();
    const now = new Date();
    // A newer request for the same thing replaces one not yet picked up.
    await this.col(COMMANDS).updateMany(
      { userId: dto.userId, command: dto.command, status: 'PENDING' },
      { $set: { status: 'CANCELLED', updatedAt: now } },
    );
    const command = {
      commandId: IdGenerator.generate('DCMD', 10),
      userId: dto.userId,
      deviceId: dto.deviceId ?? null,
      command: dto.command,
      status: 'PENDING',
      createdBy: { employeeId: context?.userId, name: context?.name },
      createdAt: now,
    };
    await this.col(COMMANDS).insertOne(command);

    if (dto.command === 'LOGOUT') await this.revokeSessions(dto.userId, dto.deviceId);

    this.logger.log(`Device command ${dto.command} queued for ${dto.userId} by ${context?.userId}`);
    return { statusCode: HttpStatus.CREATED, message: 'Command queued; the phone runs it on its next check-in', data: command };
  }

  async cancelCommand(commandId: string) {
    const result = await this.col(COMMANDS).updateOne(
      { commandId, status: 'PENDING' },
      { $set: { status: 'CANCELLED', updatedAt: new Date() } },
    );
    return { statusCode: HttpStatus.OK, message: result.modifiedCount ? 'Command cancelled' : 'Nothing pending to cancel', data: { cancelled: result.modifiedCount } };
  }

  /**
   * Access tokens live 15 minutes and are not checked against a session, so
   * deleting the refresh sessions locks the device out within 15 minutes;
   * the LOGOUT command signs the app out immediately when it is online.
   */
  async revokeSessions(userId: string, deviceId?: string) {
    const devices = await this.col('user_devices')
      .find({ userId, ...(deviceId ? { deviceId } : {}), isActive: true }, { projection: { sessionId: 1 } })
      .toArray();
    for (const device of devices) {
      if (!device.sessionId) continue;
      await Promise.all([
        this.redis.delete(`session:${device.sessionId}`),
        this.redis.delete(`refresh:${device.sessionId}`),
      ]).catch(() => null);
    }
    await this.col('user_devices').updateMany(
      { userId, ...(deviceId ? { deviceId } : {}) },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
    return devices.length;
  }

  async appConfig(fresh = false): Promise<AppConfig> {
    if (!fresh && this.configCache && Date.now() - this.configCache.at < CONFIG_CACHE_MS) {
      return this.configCache.value;
    }
    const doc = await this.col(APP_CONFIG).findOne({ key: 'mobile' }).catch(() => null);
    const value: AppConfig = {
      minAppVersion: doc?.minAppVersion || undefined,
      latestAppVersion: doc?.latestAppVersion || undefined,
      updateMessage: doc?.updateMessage || undefined,
      storeUrl: doc?.storeUrl || undefined,
    };
    this.configCache = { value, at: Date.now() };
    return value;
  }

  async getAppConfig() {
    return { statusCode: HttpStatus.OK, message: 'App config fetched', data: await this.appConfig(true) };
  }

  async updateAppConfig(dto: AppConfigDto) {
    const context = RequestContextStore.getStore();
    await this.col(APP_CONFIG).updateOne(
      { key: 'mobile' },
      { $set: { ...dto, key: 'mobile', updatedBy: context?.userId, updatedAt: new Date() } },
      { upsert: true },
    );
    this.configCache = undefined;
    this.logger.log(`Mobile app config changed by ${context?.userId}: ${JSON.stringify(dto)}`);
    return { statusCode: HttpStatus.OK, message: 'App config saved', data: await this.appConfig(true) };
  }

  /* ==================== PER-USER DEBUG LOGGING ==================== */

  async enableDebugLogging(dto: DebugLoggingDto) {
    const minutes = dto.minutes ?? 60;
    const until = new Date(Date.now() + minutes * 60_000);
    const context = RequestContextStore.getStore();
    await this.col(DEBUG_USERS).updateOne(
      { userId: dto.userId },
      { $set: { userId: dto.userId, until, enabledBy: context?.userId, updatedAt: new Date() } },
      { upsert: true },
    );
    await this.refreshDebugUsers();
    this.logger.log(`Debug logging on for ${dto.userId} for ${minutes} min (by ${context?.userId})`);
    return { statusCode: HttpStatus.OK, message: `Debug logging on until ${until.toLocaleTimeString()}`, data: { userId: dto.userId, until } };
  }

  async disableDebugLogging(userId: string) {
    await this.col(DEBUG_USERS).deleteOne({ userId });
    await this.refreshDebugUsers();
    return { statusCode: HttpStatus.OK, message: 'Debug logging off', data: { userId } };
  }

  async debugLoggingUsers() {
    const rows = await this.col(DEBUG_USERS).find({ until: { $gt: new Date() } }).toArray();
    return { statusCode: HttpStatus.OK, message: 'Debug logging users', data: rows };
  }

  private async refreshDebugUsers() {
    try {
      const rows = await this.col(DEBUG_USERS).find({ until: { $gt: new Date() } }, { projection: { userId: 1 } }).toArray();
      logSink.setDebugUsers(rows.map((row) => String(row.userId)));
    } catch (error) {
      this.logger.warn(`Could not refresh debug logging users: ${(error as Error).message}`);
    }
  }

  private currentUserId() {
    const userId = RequestContextStore.getStore()?.userId;
    if (!userId) throw new NotFoundException('No authenticated user');
    return String(userId);
  }
}
