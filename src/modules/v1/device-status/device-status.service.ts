import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { TrackingSettingsService } from '../live-location/tracking-settings.service';
import {
  DeviceStatus,
  DeviceStatusSchema,
  OfflineLog,
  OfflineLogSchema,
} from 'src/core/database/mongo/schema/device-status.schema';
import { DeviceHeartbeatDto } from './dto/device-heartbeat.dto';

const REPORT_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.TZ || 'Asia/Kolkata';
const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

/** A device that has not sent a heartbeat for this long is shown as offline. */
export const DEVICE_STALE_MINUTES = 15;

export type DeviceStatusView = {
  batteryLevel: number | null;
  isCharging: boolean;
  lastActiveAt: string | null;
  networkStatus: 'ONLINE' | 'OFFLINE';
  lastOfflineAt: string | null;
  offlineMinutesToday: number;
  /** Last heartbeat received (sent every 5 min while the app runs and is online) */
  lastHeartbeatAt: string | null;
  trackingHealth: {
    backgroundLocation: boolean | null;
    batteryUnrestricted: boolean | null;
    autostartConfirmed: boolean | null;
    reportedAt: string | null;
  } | null;
};

@Injectable()
export class DeviceStatusService {
  private readonly statusModel: Model<any>;
  private readonly offlineModel: Model<any>;

  constructor(
    mongo: MongoService,
    private readonly trackingSettings: TrackingSettingsService,
  ) {
    this.statusModel = mongo.getModel(DeviceStatus.name, DeviceStatusSchema);
    this.offlineModel = mongo.getModel(OfflineLog.name, OfflineLogSchema);
  }

  async heartbeat(dto: DeviceHeartbeatDto) {
    const ctx: any = RequestContextStore.getStore();
    const userId = ctx?.userId;
    if (!userId)
      throw new BadRequestException('Authenticated user is required');

    const now = new Date();
    const today = dayKey(now);

    // Store offline periods (idempotent on userId + offlineFrom).
    let offlineMinutesAdded = 0;
    let lastOfflineAt: Date | undefined;
    for (const period of dto.offlinePeriods ?? []) {
      const from = new Date(period.from);
      const to = new Date(period.to);
      if (!(to > from) || to > new Date(now.getTime() + 60_000)) continue;
      const durationMinutes =
        Math.round(((to.getTime() - from.getTime()) / 60_000) * 10) / 10;
      const result = await this.offlineModel.updateOne(
        { userId, offlineFrom: from },
        {
          $setOnInsert: {
            userId,
            workSessionId: dto.workSessionId,
            offlineFrom: from,
            offlineTo: to,
            durationMinutes,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount && dayKey(from) === today) {
        offlineMinutesAdded += durationMinutes;
      }
      if (!lastOfflineAt || from > lastOfflineAt) lastOfflineAt = from;
    }

    const lastActiveAt = dto.lastActiveAt ? new Date(dto.lastActiveAt) : now;

    // One atomic write per heartbeat (no read first): today's offline minutes
    // are carried over or reset by the pipeline itself.
    await this.statusModel.updateOne(
      { userId },
      [
        {
          $set: {
            userId,
            userName: ctx?.name,
            ...(dto.batteryLevel !== undefined
              ? { batteryLevel: Math.round(dto.batteryLevel) }
              : {}),
            ...(dto.isCharging !== undefined
              ? { isCharging: dto.isCharging }
              : {}),
            lastActiveAt: lastActiveAt > now ? now : lastActiveAt,
            networkStatus: 'ONLINE',
            lastOnlineAt: now,
            ...(lastOfflineAt ? { lastOfflineAt } : {}),
            offlineDay: today,
            offlineMinutesToday: {
              $round: [
                {
                  $add: [
                    {
                      $cond: [
                        { $eq: ['$offlineDay', today] },
                        { $ifNull: ['$offlineMinutesToday', 0] },
                        0,
                      ],
                    },
                    offlineMinutesAdded,
                  ],
                },
                1,
              ],
            },
            ...(dto.workSessionId ? { workSessionId: dto.workSessionId } : {}),
            ...(dto.appVersion ? { appVersion: dto.appVersion } : {}),
            ...(dto.trackingHealth
              ? {
                  trackingHealth: {
                    $literal: {
                      backgroundLocation:
                        dto.trackingHealth.backgroundLocation ?? null,
                      batteryUnrestricted:
                        dto.trackingHealth.batteryUnrestricted ?? null,
                      autostartConfirmed:
                        dto.trackingHealth.autostartConfirmed ?? null,
                      reportedAt: now,
                    },
                  },
                }
              : {}),
          },
        },
      ] as any,
      { upsert: true },
    );

    // Tracking settings are sent only when the phone's copy is out of date.
    const trackingSettings = this.trackingSettings.forUser(userId);
    const settingsChanged = dto.trackingVersion !== trackingSettings.version;

    return {
      statusCode: HttpStatus.OK,
      message: 'Device status updated',
      data: settingsChanged ? { trackingSettings } : {},
    };
  }

  /** Latest device status per user, for manager / TL / admin views. */
  async getByUserIds(
    userIds: string[],
  ): Promise<Map<string, DeviceStatusView>> {
    const ids = [...new Set(userIds.filter(Boolean))];
    const map = new Map<string, DeviceStatusView>();
    if (!ids.length) return map;
    const rows: any[] = await this.statusModel
      .find({ userId: { $in: ids } })
      .lean();
    const now = Date.now();
    const today = dayKey(new Date());
    for (const row of rows) {
      const lastActive = row.lastActiveAt ? new Date(row.lastActiveAt) : null;
      const stale =
        !lastActive ||
        now - lastActive.getTime() > DEVICE_STALE_MINUTES * 60_000;
      map.set(row.userId, {
        batteryLevel:
          row.batteryLevel === null || row.batteryLevel === undefined
            ? null
            : Number(row.batteryLevel),
        isCharging: Boolean(row.isCharging),
        lastActiveAt: lastActive ? lastActive.toISOString() : null,
        networkStatus: stale ? 'OFFLINE' : 'ONLINE',
        lastOfflineAt: row.lastOfflineAt
          ? new Date(row.lastOfflineAt).toISOString()
          : null,
        offlineMinutesToday:
          row.offlineDay === today ? Number(row.offlineMinutesToday) || 0 : 0,
        lastHeartbeatAt: row.lastOnlineAt
          ? new Date(row.lastOnlineAt).toISOString()
          : null,
        trackingHealth: row.trackingHealth
          ? {
              backgroundLocation: row.trackingHealth.backgroundLocation ?? null,
              batteryUnrestricted:
                row.trackingHealth.batteryUnrestricted ?? null,
              autostartConfirmed: row.trackingHealth.autostartConfirmed ?? null,
              reportedAt: row.trackingHealth.reportedAt
                ? new Date(row.trackingHealth.reportedAt).toISOString()
                : null,
            }
          : null,
      });
    }
    return map;
  }

  async findStatuses(userIds: string[]) {
    const map = await this.getByUserIds(userIds);
    return {
      statusCode: HttpStatus.OK,
      data: userIds.map((userId) => ({ userId, ...(map.get(userId) ?? null) })),
    };
  }

  async findOfflineLogs(query: {
    userId?: string;
    from?: string;
    to?: string;
  }) {
    const filter: Record<string, any> = {};
    if (query.userId) filter.userId = query.userId;
    if (query.from || query.to) {
      filter.offlineFrom = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(query.to) } : {}),
      };
    }
    const data = await this.offlineModel
      .find(filter)
      .sort({ offlineFrom: -1 })
      .limit(500)
      .lean();
    return { statusCode: HttpStatus.OK, data };
  }
}
