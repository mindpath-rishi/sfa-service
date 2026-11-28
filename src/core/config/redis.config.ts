import Redis from 'ioredis';
import { LoggerService } from 'src/core/logger/logger.service';

export function createRedisClient(logger: LoggerService): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB) || 0,

    // production-safe defaults
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,

    retryStrategy: (times) => Math.min(times * 100, 2000),
  });

  /* ==================== EVENTS ==================== */

  client.on('ready', () => logger.info('Redis ready'));

  client.on('error', (err) => logger.error('Redis error', err));

  client.on('reconnecting', () => logger.warn('Redis reconnecting'));

  client.on('end', () => logger.warn('Redis connection closed'));

  return client;
}
