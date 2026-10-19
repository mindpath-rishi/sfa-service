import { Injectable, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

type Meta = Record<string, any>;

/**
 * Transient: every consumer gets its own instance, so `setContext` in one
 * class (e.g. MongoDB) no longer relabels the logs of another (e.g. Redis).
 * Resolve it with `app.resolve(LoggerService)`, not `app.get`.
 *
 * The context is kept here rather than via `PinoLogger.setContext`, because
 * Nest may hand the same transient PinoLogger to several LoggerServices.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private context?: string;

  constructor(private readonly pino: PinoLogger) {}

  setContext(context: string) {
    this.context = context;
  }

  info(message: string, meta?: Meta) {
    this.pino.info(this.withContext(meta), message);
  }

  debug(message: string, meta?: Meta) {
    this.pino.debug(this.withContext(meta), message);
  }

  warn(message: string, meta?: Meta) {
    this.pino.warn(this.withContext(meta), message);
  }

  /**
   * Accepts either form used across the codebase:
   *   error('msg', err, { extra })
   *   error('msg', { error: err, sql, ... })
   */
  error(message: string, errorOrMeta?: unknown, meta?: Meta) {
    let err: unknown = errorOrMeta;
    let extra: Meta | undefined = meta;

    if (isPlainObject(errorOrMeta)) {
      const { error, err: nestedErr, ...rest } = errorOrMeta;
      err = error ?? nestedErr;
      extra = { ...rest, ...meta };
    }

    this.pino.error(
      this.withContext({ ...extra, ...toErrField(err) }),
      message,
    );
  }

  private withContext(meta?: Meta): Meta {
    return this.context ? { context: this.context, ...meta } : { ...meta };
  }
}

function isPlainObject(value: unknown): value is Meta {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Error) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// pino's std serializer turns `err` into { type, message, stack, ... }.
// Non-Error throwables (strings, objects) are kept as-is instead of dropped.
function toErrField(err: unknown): Meta {
  if (err === undefined || err === null) return {};
  if (err instanceof Error) return { err };
  return { err: { message: String((err as any)?.message ?? err), value: err } };
}
