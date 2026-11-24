/**
 * Location tracking settings (admin controlled)
 * ---------------------------------------------
 * Global settings + per-user overrides, stored in `app_settings`
 * (key `location_tracking`). Device settings are sent to the app (on
 * tracking start and with every device heartbeat, so a change reaches phones
 * within ~5 minutes); server settings drive storage, road matching and
 * day-route stop detection.
 *
 * Version control: every save is kept in `app_settings_history` as a
 * numbered revision (who, when, why, what changed); Super Admin can view the
 * history and restore any revision (a restore is saved as a new revision).
 */
import { BadRequestException, HttpStatus, Injectable, NotFoundException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RequestContextStore } from 'src/core/context/request-context';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { setFilterParams } from './location-points.store';

export type AccuracyMode = 'HIGH' | 'BALANCED' | 'LOW';

/** Settings applied on the phone (can be overridden per user). */
export type DeviceTrackingSettings = {
  trackingEnabled: boolean;
  accuracyMode: AccuracyMode;
  foregroundIntervalSec: number;
  foregroundDistanceM: number;
  backgroundEnabled: boolean;
  backgroundIntervalSec: number;
  backgroundDistanceM: number;
  maxAccuracyM: number;
  heartbeatSec: number;
};

/** Settings applied on the server. */
export type ServerTrackingSettings = {
  storageToleranceM: number;
  storageKeepAliveSec: number;
  roadSnapEnabled: boolean;
  stopMinMinutes: number;
  stopRadiusM: number;
};

export type TrackingSettings = DeviceTrackingSettings & ServerTrackingSettings;

export type TrackingOverride = {
  employeeId: string;
  employeeName?: string;
  note?: string;
  settings: Partial<DeviceTrackingSettings>;
};

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  trackingEnabled: true,
  accuracyMode: 'HIGH',
  foregroundIntervalSec: 5,
  foregroundDistanceM: 5,
  backgroundEnabled: true,
  backgroundIntervalSec: 5,
  backgroundDistanceM: 0,
  maxAccuracyM: 100,
  heartbeatSec: 30,
  storageToleranceM: 5,
  storageKeepAliveSec: 60,
  roadSnapEnabled: true,
  stopMinMinutes: 5,
  stopRadiusM: 75,
};

export const DEVICE_SETTING_KEYS: (keyof DeviceTrackingSettings)[] = [
  'trackingEnabled',
  'accuracyMode',
  'foregroundIntervalSec',
  'foregroundDistanceM',
  'backgroundEnabled',
  'backgroundIntervalSec',
  'backgroundDistanceM',
  'maxAccuracyM',
  'heartbeatSec',
];

const SETTINGS_KEY = 'location_tracking';
const REFRESH_MS = 30_000;

type SettingsDoc = {
  key: string;
  revision?: number;
  settings?: Partial<TrackingSettings>;
  overrides?: TrackingOverride[];
  updatedAt?: Date;
  updatedBy?: string;
  updatedByName?: string;
  note?: string;
};

export type SettingsChange = { field: string; from: unknown; to: unknown };

type HistoryDoc = SettingsDoc & {
  revision: number;
  changes: SettingsChange[];
  restoredFrom?: number;
};

const HISTORY_COLLECTION = 'app_settings_history';
const MAX_CHANGES_LISTED = 100;

/** Field-level differences between two saved states (overrides per user). */
function diffSettings(
  before: { settings: TrackingSettings; overrides: TrackingOverride[] },
  after: { settings: TrackingSettings; overrides: TrackingOverride[] },
): SettingsChange[] {
  const changes: SettingsChange[] = [];
  for (const key of Object.keys(after.settings) as (keyof TrackingSettings)[]) {
    if (before.settings[key] !== after.settings[key]) {
      changes.push({ field: key, from: before.settings[key], to: after.settings[key] });
    }
  }
  const beforeMap = new Map(before.overrides.map((row) => [row.employeeId, row]));
  const afterMap = new Map(after.overrides.map((row) => [row.employeeId, row]));
  for (const [employeeId, row] of afterMap) {
    const previous = beforeMap.get(employeeId);
    const label = `override:${row.employeeName || employeeId}`;
    if (!previous) {
      changes.push({ field: label, from: null, to: row.settings });
    } else if (JSON.stringify(previous.settings) !== JSON.stringify(row.settings)) {
      changes.push({ field: label, from: previous.settings, to: row.settings });
    }
  }
  for (const [employeeId, row] of beforeMap) {
    if (!afterMap.has(employeeId)) {
      changes.push({ field: `override:${row.employeeName || employeeId}`, from: row.settings, to: null });
    }
  }
  return changes.slice(0, MAX_CHANGES_LISTED);
}

@Injectable()
export class TrackingSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TrackingSettingsService.name);
  private settings: TrackingSettings = { ...DEFAULT_TRACKING_SETTINGS };
  private overrides = new Map<string, TrackingOverride>();
  private updatedAt?: Date;
  private updatedBy?: string;
  private revision = 0;
  private timer?: NodeJS.Timeout;

  constructor(private readonly mongo: MongoService) {}

  private get collection() {
    return this.mongo.getDb().collection<SettingsDoc>('app_settings');
  }

  async onModuleInit() {
    await this.reload();
    // Several API instances: pick up changes saved by another instance
    this.timer = setInterval(() => void this.reload(), REFRESH_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async reload() {
    try {
      const doc = await this.collection.findOne({ key: SETTINGS_KEY });
      this.apply(doc);
    } catch (error) {
      this.logger.warn(`Tracking settings load failed: ${(error as Error).message}`);
    }
  }

  private apply(doc: SettingsDoc | null) {
    this.settings = { ...DEFAULT_TRACKING_SETTINGS, ...(doc?.settings ?? {}) };
    this.overrides = new Map((doc?.overrides ?? []).map((row) => [row.employeeId, row]));
    this.updatedAt = doc?.updatedAt;
    this.updatedBy = doc?.updatedBy;
    this.revision = doc?.revision ?? 0;
    setFilterParams({
      toleranceMeters: this.settings.storageToleranceM,
      keepAliveMs: this.settings.storageKeepAliveSec * 1000,
      maxAccuracyMeters: this.settings.maxAccuracyM,
    });
  }

  /** Current global settings (in memory, no DB read). */
  get current(): TrackingSettings {
    return this.settings;
  }

  /** Device settings for one user: global settings + that user's override. */
  forUser(employeeId?: string) {
    const override = employeeId ? this.overrides.get(employeeId) : undefined;
    const device = Object.fromEntries(
      DEVICE_SETTING_KEYS.map((key) => [key, this.settings[key]]),
    ) as DeviceTrackingSettings;
    return {
      ...device,
      ...(override?.settings ?? {}),
      overridden: Boolean(override),
      /** Changes whenever the admin saves; the app restarts tracking on change. */
      version: this.updatedAt ? this.updatedAt.toISOString() : 'default',
    };
  }

  getSettings() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tracking settings fetched',
      data: {
        settings: this.settings,
        overrides: [...this.overrides.values()],
        defaults: DEFAULT_TRACKING_SETTINGS,
        updatedAt: this.updatedAt ?? null,
        updatedBy: this.updatedBy ?? null,
        revision: this.revision,
      },
    };
  }

  getMySettings() {
    const userId = RequestContextStore.getStore()?.userId;
    return {
      statusCode: HttpStatus.OK,
      message: 'Tracking settings fetched',
      data: this.forUser(userId),
    };
  }

  async updateSettings(payload: {
    settings?: Partial<TrackingSettings>;
    overrides?: TrackingOverride[];
    note?: string;
  }) {
    const settings = { ...this.settings, ...(payload.settings ?? {}) };
    const overrides = payload.overrides
      ? payload.overrides
          .filter((row) => row.employeeId)
          .map((row) => ({
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            note: row.note,
            // only device keys, only values that are set
            settings: Object.fromEntries(
              Object.entries(row.settings ?? {}).filter(
                ([key, value]) =>
                  DEVICE_SETTING_KEYS.includes(key as keyof DeviceTrackingSettings) &&
                  value !== undefined &&
                  value !== null,
              ),
            ),
          }))
      : [...this.overrides.values()];
    await this.save(settings, overrides, payload.note);
    return { ...this.getSettings(), message: `Tracking settings saved (version ${this.revision})` };
  }

  /** Saves a new revision: current doc + history entry with the field changes. */
  private async save(
    settings: TrackingSettings,
    overrides: TrackingOverride[],
    note?: string,
    restoredFrom?: number,
  ) {
    const context = RequestContextStore.getStore();
    // Latest state from the DB (another instance may have saved meanwhile)
    const latest = await this.collection.findOne({ key: SETTINGS_KEY });
    const before = {
      settings: { ...DEFAULT_TRACKING_SETTINGS, ...(latest?.settings ?? {}) },
      overrides: latest?.overrides ?? [],
    };
    const changes = diffSettings(before, { settings, overrides });
    const revision = (latest?.revision ?? 0) + 1;
    const doc: SettingsDoc = {
      key: SETTINGS_KEY,
      revision,
      settings,
      overrides,
      updatedAt: new Date(),
      updatedBy: context?.userId,
      updatedByName: context?.name,
      note: note?.trim() || undefined,
    };
    // Revision number guards against two admins saving at the same moment
    const result = await this.collection.updateOne(
      { key: SETTINGS_KEY, ...(latest ? { revision: latest.revision ?? { $exists: false } } : {}) } as any,
      { $set: doc },
      { upsert: !latest },
    );
    if (latest && !result.matchedCount) {
      throw new BadRequestException('Settings were changed by someone else. Reload and try again.');
    }
    const history = this.mongo.getDb().collection<HistoryDoc>(HISTORY_COLLECTION);
    await history.createIndex({ key: 1, revision: -1 }, { unique: true }).catch(() => undefined);
    await history.insertOne({ ...doc, revision, changes, ...(restoredFrom ? { restoredFrom } : {}) });
    this.apply(doc);
    this.logger.log(
      `Tracking settings v${revision} by ${context?.userId}: ${changes.length} change(s)${
        restoredFrom ? ` (restore of v${restoredFrom})` : ''
      }`,
    );
  }

  /** Revisions, newest first (Super Admin). */
  async getHistory(limit = 50) {
    const rows = await this.mongo
      .getDb()
      .collection<HistoryDoc>(HISTORY_COLLECTION)
      .find({ key: SETTINGS_KEY }, { projection: { _id: 0 } })
      .sort({ revision: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .toArray();
    return {
      statusCode: HttpStatus.OK,
      message: 'Tracking settings history fetched',
      data: { current: this.revision, revisions: rows },
    };
  }

  /** Brings back an earlier revision, saved as a new revision (Super Admin). */
  async restore(revision: number, note?: string) {
    const target = await this.mongo
      .getDb()
      .collection<HistoryDoc>(HISTORY_COLLECTION)
      .findOne({ key: SETTINGS_KEY, revision });
    if (!target) throw new NotFoundException(`Version ${revision} not found`);
    await this.save(
      { ...DEFAULT_TRACKING_SETTINGS, ...(target.settings ?? {}) },
      target.overrides ?? [],
      note?.trim() || `Restored version ${revision}`,
      revision,
    );
    return { ...this.getSettings(), message: `Version ${revision} restored as version ${this.revision}` };
  }
}
