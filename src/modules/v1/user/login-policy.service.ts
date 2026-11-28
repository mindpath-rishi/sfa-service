/**
 * Login policy (admin controlled)
 * -------------------------------
 *  - singleDeviceLogin: signing in on a new device signs the user out of
 *    every older device (their session is revoked, the next request gets 401);
 *  - lockDayToDevice:   while a work day is ACTIVE, only the device that
 *    started it can sign in — the user completes the day there (online, so
 *    data syncs) before switching devices;
 *  - applyToWeb:        also apply both rules to web (portal) sign-ins.
 *
 * Stored in `app_settings` (key `login_policy`) and cached in memory. The
 * per-request "is this still the current session" check is cached for
 * SESSION_CACHE_MS, so it costs at most one Redis GET per user per 30 s.
 */
import {
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { RedisRepository } from 'src/core/database/radis/radis.repository';

export type LoginPolicy = {
  singleDeviceLogin: boolean;
  lockDayToDevice: boolean;
  applyToWeb: boolean;
};

export const DEFAULT_LOGIN_POLICY: LoginPolicy = {
  singleDeviceLogin: true,
  lockDayToDevice: true,
  applyToWeb: false,
};

const POLICY_KEY = 'login_policy';
const REFRESH_MS = 30_000;
const SESSION_CACHE_MS = 30_000;
const CURRENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 8;

@Injectable()
export class LoginPolicyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LoginPolicyService.name);
  private policy: LoginPolicy = { ...DEFAULT_LOGIN_POLICY };
  private updatedAt?: Date;
  private updatedBy?: string;
  private timer?: NodeJS.Timeout;
  /** userId → current session id (cached Redis value) */
  private readonly currentSessions = new Map<
    string,
    { sid: string | null; at: number }
  >();

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisRepository,
  ) {}

  private get collection() {
    return this.connection.collection('app_settings');
  }

  async onModuleInit() {
    await this.reload();
    this.timer = setInterval(() => void this.reload(), REFRESH_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async reload() {
    try {
      const doc: any = await this.collection.findOne({ key: POLICY_KEY });
      this.policy = { ...DEFAULT_LOGIN_POLICY, ...(doc?.policy ?? {}) };
      this.updatedAt = doc?.updatedAt;
      this.updatedBy = doc?.updatedBy;
    } catch (error) {
      this.logger.warn(`Login policy load failed: ${(error as Error).message}`);
    }
  }

  get current(): LoginPolicy {
    return this.policy;
  }

  /** Whether the rules apply to this kind of client. */
  appliesTo(deviceType?: string) {
    return deviceType !== 'web' || this.policy.applyToWeb;
  }

  getPolicy() {
    return {
      statusCode: HttpStatus.OK,
      message: 'Login policy fetched',
      data: {
        policy: this.policy,
        defaults: DEFAULT_LOGIN_POLICY,
        updatedAt: this.updatedAt ?? null,
        updatedBy: this.updatedBy ?? null,
      },
    };
  }

  async updatePolicy(next: Partial<LoginPolicy>) {
    const userId = RequestContextStore.getStore()?.userId;
    const policy: LoginPolicy = {
      singleDeviceLogin:
        next.singleDeviceLogin ?? this.policy.singleDeviceLogin,
      lockDayToDevice: next.lockDayToDevice ?? this.policy.lockDayToDevice,
      applyToWeb: next.applyToWeb ?? this.policy.applyToWeb,
    };
    const updatedAt = new Date();
    await this.collection.updateOne(
      { key: POLICY_KEY },
      { $set: { key: POLICY_KEY, policy, updatedAt, updatedBy: userId } },
      { upsert: true },
    );
    this.policy = policy;
    this.updatedAt = updatedAt;
    this.updatedBy = userId;
    this.logger.log(
      `Login policy changed by ${userId}: ${JSON.stringify(policy)}`,
    );
    return { ...this.getPolicy(), message: 'Login policy saved' };
  }

  /* ---------- current session (single device login) ---------- */

  async setCurrentSession(userId: string, sessionId: string) {
    await this.redis.client.set(
      `current-session:${userId}`,
      sessionId,
      'EX',
      CURRENT_SESSION_TTL_SECONDS,
    );
    this.currentSessions.set(userId, { sid: sessionId, at: Date.now() });
  }

  /**
   * False when the user has since signed in on another device. Unknown
   * (no record / Redis down) counts as current, so users are never locked out.
   */
  async isCurrentSession(userId: string, sessionId: string) {
    if (!this.policy.singleDeviceLogin) return true;
    let cached = this.currentSessions.get(userId);
    if (!cached || Date.now() - cached.at > SESSION_CACHE_MS) {
      try {
        const sid = await this.redis.client.get(`current-session:${userId}`);
        cached = { sid, at: Date.now() };
        if (this.currentSessions.size > 20_000) this.currentSessions.clear();
        this.currentSessions.set(userId, cached);
      } catch {
        return true;
      }
    }
    return !cached.sid || cached.sid === sessionId;
  }
}
