import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { createRedisClient } from 'src/core/config/redis.config';
import { LoggerService } from 'src/core/logger/logger.service';

@Injectable()
export class RedisRepository
  implements OnModuleInit, OnModuleDestroy
{
  public readonly client: Redis;

  /* ======================================================
   * GLOBAL REDIS READINESS (EVENT-DRIVEN)
   * ====================================================== */

  private static redisReady: Promise<void> | null = null;

  private static initRedisReady(client: Redis): Promise<void> {
    if (this.redisReady) return this.redisReady;

    this.redisReady = new Promise<void>((resolve) => {
      if (client.status === 'ready') {
        resolve();
        return;
      }

      client.once('ready', () => resolve());
    });

    return this.redisReady;
  }

  private async ensureReady(): Promise<void> {
    if (this.client.status === 'ready') return;
    await RedisRepository.initRedisReady(this.client);
  }

  /* ======================================================
   * CONSTRUCTOR
   * ====================================================== */

  constructor(private readonly logger: LoggerService) {
    this.logger.setContext(RedisRepository.name);
    this.client = createRedisClient(this.logger);
  }

  /* ======================================================
   * LIFECYCLE
   * ====================================================== */

  async onModuleInit() {
    await this.client.connect();
    await this.ensureReady();

    this.logger.info('Redis connected');
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.info('Redis disconnected');
  }

  /* ======================================================
   * SESSION HELPERS
   * ====================================================== */

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<void> {
    await this.ensureReady();

    const payload = JSON.stringify(value);

    if (ttlSeconds) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  async getJson<T>(key: string): Promise<T | null> {
    await this.ensureReady();

    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async delete(key: string): Promise<void> {
    await this.ensureReady();
    await this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    await this.ensureReady();
    return (await this.client.exists(key)) === 1;
  }

  async extendTTL(key: string, ttlSeconds: number): Promise<void> {
    await this.ensureReady();
    await this.client.expire(key, ttlSeconds);
  }

  /* ======================================================
   * RATE LIMITING HELPERS
   * ====================================================== */

  async increment(key: string, ttlSeconds: number): Promise<number> {
    await this.ensureReady();

    const pipeline = this.client.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, ttlSeconds);

    const results = await pipeline.exec();
    return Number(results?.[0]?.[1] ?? 0);
  }
}
