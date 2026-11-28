import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { RedisRepository } from 'src/core/database/radis/radis.repository';
import { AlertsService } from './alerts.service';
import { ReconciliationService } from './reconciliation.service';

const minutes = (value: number) => value * 60_000;

/**
 * Runs alert checks every ALERT_INTERVAL_MINUTES (default 15) and the
 * reconciliation report daily at RECONCILIATION_HOUR (default 2, server time).
 *
 * A Redis lock makes each run happen once even when several API instances
 * are running. Set MONITORING_SCHEDULER=false to switch it off.
 */
@Injectable()
export class MonitoringScheduler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(MonitoringScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly alerts: AlertsService,
    private readonly reconciliation: ReconciliationService,
    private readonly redis: RedisRepository,
  ) {}

  onApplicationBootstrap() {
    if (
      process.env.MONITORING_SCHEDULER === 'false' ||
      process.env.NODE_ENV === 'test'
    ) {
      this.logger.log('Monitoring scheduler is off');
      return;
    }

    const interval = minutes(
      Math.max(5, Number(process.env.ALERT_INTERVAL_MINUTES) || 15),
    );
    // First check shortly after start-up, once the app is warm.
    this.timers.push(
      setTimeout(
        () =>
          void this.locked('alerts', interval, () => this.alerts.evaluate()),
        minutes(2),
      ),
    );
    this.timers.push(
      setInterval(
        () =>
          void this.locked('alerts', interval, () => this.alerts.evaluate()),
        interval,
      ),
    );

    const hour = Math.min(
      23,
      Math.max(0, Number(process.env.RECONCILIATION_HOUR ?? 2)),
    );
    const next = new Date();
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);
    this.timers.push(
      setTimeout(() => {
        void this.locked('reconciliation', minutes(60), () =>
          this.reconciliation.run(),
        );
        this.timers.push(
          setInterval(
            () =>
              void this.locked('reconciliation', minutes(60), () =>
                this.reconciliation.run(),
              ),
            24 * 3600_000,
          ),
        );
      }, next.getTime() - Date.now()),
    );

    for (const timer of this.timers) timer.unref();
    this.logger.log(
      `Alerts every ${interval / 60_000} min; reconciliation daily at ${hour}:00 (next ${next.toLocaleString()})`,
    );
  }

  onModuleDestroy() {
    for (const timer of this.timers) clearTimeout(timer);
  }

  private async locked(
    name: string,
    ttlMs: number,
    run: () => Promise<unknown>,
  ) {
    const key = `ops:lock:${name}`;
    try {
      const acquired = await this.redis.client.set(
        key,
        String(process.pid),
        'PX',
        Math.max(60_000, ttlMs - 5_000),
        'NX',
      );
      if (acquired !== 'OK') return; // another instance has it
    } catch (error) {
      // Without Redis we still run: a duplicate alert check is harmless.
      this.logger.warn(
        `Lock ${name} unavailable (${(error as Error).message}); running anyway`,
      );
    }
    try {
      await run();
    } catch (error) {
      this.logger.error(
        `Scheduled ${name} failed`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
