import { HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { isSuperAdmin } from 'src/core/guards/super-admin.guard';
import { alertsRaisedTotal } from 'src/core/metrics/app-metrics';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { FeatureDebugService } from '../feature-debug/feature-debug.service';
import type { InspectTarget } from '../feature-debug/feature-debug.types';
import { NotificationService } from '../notification/notification.service';
import { HealthService } from './health.service';

export const ALERTS = 'ops_alerts';

type Candidate = {
  fingerprint: string;
  severity: 'FAIL' | 'WARN';
  source: string;
  problem: string;
  detail: string;
  target?: InspectTarget;
};

/**
 * Turns scan findings and health problems into alerts with a lifecycle:
 * OPEN → (ACKNOWLEDGED) → RESOLVED automatically once the problem is gone.
 * Only newly opened alerts notify anyone, so a known problem pings once.
 */
@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly featureDebug: FeatureDebugService,
    private readonly health: HealthService,
    private readonly notifications: NotificationService,
  ) {}

  private get alerts() {
    return this.connection.collection(ALERTS);
  }

  async onModuleInit() {
    await Promise.all([
      this.alerts.createIndex({ fingerprint: 1, status: 1 }),
      this.alerts.createIndex({ status: 1, lastSeenAt: -1 }),
      // Resolved alerts are history; keep 90 days.
      this.alerts.createIndex({ resolvedAt: 1 }, { expireAfterSeconds: 90 * 86400, partialFilterExpression: { status: 'RESOLVED' } }),
    ]).catch((error) => this.logger.warn(`Alert indexes: ${error?.message}`));
  }

  /** One alerting pass: scan, open/refresh/resolve alerts, notify about new ones. */
  async evaluate(trigger: 'schedule' | 'manual' = 'schedule') {
    const started = Date.now();
    const candidates = await this.collect();
    const now = new Date();
    const seen = new Set<string>();
    const opened: Candidate[] = [];

    for (const candidate of candidates) {
      if (seen.has(candidate.fingerprint)) continue;
      seen.add(candidate.fingerprint);

      const existing = await this.alerts.findOne({ fingerprint: candidate.fingerprint, status: { $in: ['OPEN', 'ACKNOWLEDGED'] } });
      if (existing) {
        await this.alerts.updateOne(
          { _id: existing._id },
          { $set: { lastSeenAt: now, detail: candidate.detail, severity: candidate.severity }, $inc: { occurrences: 1 } },
        );
        continue;
      }
      await this.alerts.insertOne({
        alertId: IdGenerator.generate('ALRT', 10),
        ...candidate,
        status: 'OPEN',
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      alertsRaisedTotal.labels(candidate.severity).inc();
      opened.push(candidate);
    }

    const resolved = await this.alerts.updateMany(
      { status: { $in: ['OPEN', 'ACKNOWLEDGED'] }, fingerprint: { $nin: [...seen] } },
      { $set: { status: 'RESOLVED', resolvedAt: now } },
    );

    if (opened.length) await this.notify(opened);

    const summary = {
      trigger,
      checked: seen.size,
      opened: opened.length,
      resolved: resolved.modifiedCount,
      tookMs: Date.now() - started,
    };
    this.logger.log(`Alert check: ${summary.opened} new, ${summary.resolved} resolved, ${summary.checked} active (${summary.tookMs} ms)`);
    return summary;
  }

  async list(status?: string, page = 1, limit = 50) {
    const filter = status && status !== 'ALL' ? { status } : { status: { $in: ['OPEN', 'ACKNOWLEDGED'] } };
    const [items, total, counts] = await Promise.all([
      this.alerts.find(filter).sort({ severity: 1, lastSeenAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
      this.alerts.countDocuments(filter),
      this.alerts.aggregate([{ $group: { _id: { status: '$status', severity: '$severity' }, count: { $sum: 1 } } }]).toArray(),
    ]);
    return {
      statusCode: HttpStatus.OK,
      message: 'Alerts fetched',
      data: items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        counts: counts.map((row) => ({ ...row._id, count: row.count })),
      },
    };
  }

  async acknowledge(alertId: string, note?: string) {
    const context = RequestContextStore.getStore();
    const result = await this.alerts.updateOne(
      { alertId, status: 'OPEN' },
      { $set: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedBy: { employeeId: context?.userId, name: context?.name }, note } },
    );
    if (!result.matchedCount) throw new NotFoundException('No open alert with this ID');
    return { statusCode: HttpStatus.OK, message: 'Alert acknowledged', data: { alertId } };
  }

  /* ==================== HELPERS ==================== */

  private async collect(): Promise<Candidate[]> {
    const candidates: Candidate[] = [];

    const scan = await this.featureDebug.scan(undefined, 1);
    for (const feature of scan.data.features) {
      if (feature.error) {
        candidates.push({ fingerprint: `scan-error:${feature.feature}`, severity: 'WARN', source: feature.label, problem: 'Scan failed', detail: feature.error });
      }
      for (const finding of feature.findings) {
        candidates.push({
          fingerprint: `${feature.feature}:${finding.problem}:${finding.target?.id ?? finding.detail}`,
          severity: finding.severity,
          source: feature.label,
          problem: finding.problem,
          detail: finding.detail,
          target: finding.target,
        });
      }
    }

    const health = await this.health.snapshot();
    for (const component of health.components) {
      if (component.status === 'WARN' || component.status === 'DOWN') {
        candidates.push({
          fingerprint: `health:${component.key}`,
          severity: component.status === 'DOWN' ? 'FAIL' : 'WARN',
          source: 'System health',
          problem: `${component.label} ${component.status === 'DOWN' ? 'down' : 'degraded'}`,
          detail: component.summary,
        });
      }
    }
    return candidates;
  }

  /** One summary notification per pass, to every Super Admin and the webhook. */
  private async notify(opened: Candidate[]) {
    const failures = opened.filter((alert) => alert.severity === 'FAIL');
    const title = failures.length
      ? `${failures.length} new problem(s) in SFA`
      : `${opened.length} new warning(s) in SFA`;
    const lines = [...failures, ...opened.filter((alert) => alert.severity === 'WARN')]
      .slice(0, 8)
      .map((alert) => `• ${alert.source}: ${alert.problem}${alert.target ? ` (${alert.target.id})` : ''}`);
    if (opened.length > 8) lines.push(`…and ${opened.length - 8} more`);
    const body = lines.join('\n');

    const recipients = await this.superAdminIds();
    for (const recipientId of recipients) {
      await this.notifications
        .create({ recipientId, title, body, category: 'SYSTEM_ALERT', data: { route: '/monitoring', type: 'SYSTEM_ALERT' } } as any)
        .catch((error) => this.logger.warn(`Alert notification to ${recipientId} failed: ${error?.message}`));
    }

    const webhook = process.env.ALERT_WEBHOOK_URL;
    if (webhook) {
      const link = process.env.MIS_PUBLIC_URL ? `\n${process.env.MIS_PUBLIC_URL.replace(/\/$/, '')}/monitoring` : '';
      // `text` is understood by Slack, Google Chat and Teams incoming webhooks.
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `*${title}*\n${body}${link}` }),
        signal: AbortSignal.timeout(10_000),
      }).catch((error) => this.logger.warn(`Alert webhook failed: ${error?.message}`));
    }
  }

  private async superAdminIds(): Promise<string[]> {
    const positions = await this.connection
      .collection('position_master')
      .find({ employeeId: { $exists: true, $ne: null }, status: 'ACTIVE', isDeleted: { $ne: true } }, { projection: { employeeId: 1, roleId: 1 } })
      .toArray();
    return [...new Set(positions.filter((position) => isSuperAdmin(position.roleId)).map((position) => String(position.employeeId)))];
  }
}
