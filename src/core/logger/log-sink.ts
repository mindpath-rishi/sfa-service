import { EventEmitter } from 'events';
import type { Collection } from 'mongodb';
import { logEntriesTotal } from '../metrics/app-metrics';

/**
 * Second pino destination (next to stdout) that keeps a searchable copy of
 * the logs in MongoDB for the MIS "System Logs" page, and broadcasts every
 * entry for the live view.
 *
 * pino is configured before MongoDB connects, so entries are buffered until
 * `attach()` is called by SystemLogsService. A storage failure must never
 * break the app or recurse into the logger, so problems go straight to
 * stderr (throttled) and the batch is dropped.
 */

export const APP_LOGS_COLLECTION = 'app_logs';

export const LOG_LEVELS: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export type StoredLog = {
  time: Date;
  level: number;
  levelLabel: string;
  msg: string;
  context?: string;
  reqId?: string;
  method?: string;
  url?: string;
  flow?: string;
  statusCode?: number;
  responseTime?: number;
  userId?: string;
  role?: string;
  vanId?: string;
  errorMessage?: string;
  err?: { type?: string; message?: string; stack?: string };
  meta?: string;
};

const FLUSH_INTERVAL_MS = 1_000;
const FLUSH_BATCH_SIZE = 200;
const MAX_BUFFER = 10_000;
const MAX_MSG = 2_000;
const MAX_STACK = 8_000;
const MAX_META = 4_000;

// Fields mapped onto StoredLog columns; everything else goes into `meta`.
const KNOWN_FIELDS = new Set([
  'level',
  'time',
  'msg',
  'pid',
  'hostname',
  'context',
  'req',
  'res',
  'responseTime',
  'userId',
  'role',
  'vanId',
  'errorMessage',
  'err',
]);

const truncate = (value: unknown, max: number) => {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
};

/** "/api/v1/work-session/123?x=1" → "work-session" */
export const flowFromUrl = (url?: string) => {
  if (!url) return undefined;
  const path = url.split('?')[0];
  const match = path.match(/^\/api\/(?:v\d+\/)?([^/]+)/i);
  return match ? match[1].toLowerCase() : undefined;
};

export const toStoredLog = (entry: Record<string, any>): StoredLog => {
  const req = entry.req ?? {};
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!KNOWN_FIELDS.has(key)) meta[key] = value;
  }
  const metaText = Object.keys(meta).length ? JSON.stringify(meta) : undefined;

  return {
    time: new Date(entry.time ?? Date.now()),
    level: Number(entry.level ?? 30),
    levelLabel: LOG_LEVELS[entry.level] ?? String(entry.level),
    msg: truncate(entry.msg, MAX_MSG) ?? '',
    context: entry.context,
    reqId: req.id,
    method: req.method,
    url: req.url,
    flow: flowFromUrl(req.url),
    statusCode: entry.res?.statusCode,
    responseTime: entry.responseTime,
    userId: entry.userId,
    role: entry.role,
    vanId: entry.vanId,
    errorMessage: truncate(entry.errorMessage, MAX_MSG),
    err: entry.err
      ? {
          type: entry.err.type,
          message: truncate(entry.err.message, MAX_MSG),
          stack: truncate(entry.err.stack, MAX_STACK),
        }
      : undefined,
    meta: truncate(metaText, MAX_META),
  };
};

class LogSink extends EventEmitter {
  private buffer: StoredLog[] = [];
  /** Entries below this level are kept only for users with debug logging on. */
  private storeLevel = 30;
  private debugUsers = new Set<string>();
  private collection?: Collection;
  private flushing = false;
  private dropped = 0;
  private lastWarnAt = 0;
  private timer?: NodeJS.Timeout;

  constructor() {
    super();
    // Many sockets may listen for live entries.
    this.setMaxListeners(0);
  }

  /** pino calls this with one JSON line per entry. */
  write(line: string) {
    let log: StoredLog;
    try {
      log = toStoredLog(JSON.parse(line));
    } catch {
      return;
    }

    if (
      log.level < this.storeLevel &&
      !(log.userId && this.debugUsers.has(log.userId))
    ) {
      return;
    }
    logEntriesTotal.labels(log.levelLabel).inc();

    this.emit('entry', log);

    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
      this.dropped += 1;
    }
    this.buffer.push(log);

    if (this.collection && this.buffer.length >= FLUSH_BATCH_SIZE) {
      void this.flush();
    }
  }

  setStoreLevel(level: number) {
    this.storeLevel = level;
  }

  /** Users whose debug-level lines are stored (set from MIS, time-limited). */
  setDebugUsers(userIds: string[]) {
    this.debugUsers = new Set(userIds);
  }

  attach(collection: Collection) {
    this.collection = collection;
    if (!this.timer) {
      this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
      this.timer.unref();
    }
    void this.flush();
  }

  async flush() {
    if (!this.collection || this.flushing || !this.buffer.length) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, FLUSH_BATCH_SIZE * 5);
    try {
      await this.collection.insertMany(batch, { ordered: false });
    } catch (error) {
      this.warn(
        `could not store ${batch.length} log entries: ${(error as Error)?.message}`,
      );
    } finally {
      this.flushing = false;
    }
    if (this.dropped) {
      this.warn(
        `dropped ${this.dropped} log entries while storage was unavailable`,
      );
      this.dropped = 0;
    }
  }

  private warn(message: string) {
    const now = Date.now();
    if (now - this.lastWarnAt < 60_000) return;
    this.lastWarnAt = now;
    process.stderr.write(`[LogSink] ${message}\n`);
  }
}

export const logSink = new LogSink();
