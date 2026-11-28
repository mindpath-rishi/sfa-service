import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as client from 'prom-client';
import { socketCounts } from './app-metrics';

const CACHE_MS = 30_000;

type BusinessSnapshot = {
  erp: { kind: string; status: string; count: number }[];
  stuckChanges: number;
  openWorkSessions: number;
  openAlerts: { severity: string; count: number }[];
  appVersions: { version: string; count: number }[];
  phonesCheckedIn: number;
};

@Injectable()
export class MetricsService {
  private readonly httpRequestDuration: client.Histogram<string>;
  private readonly httpRequestCount: client.Counter<string>;
  private snapshot?: { value: BusinessSnapshot; at: number };
  private pending?: Promise<BusinessSnapshot>;

  constructor(@InjectConnection() private readonly connection: Connection) {
    if (!client.register.getSingleMetric('process_cpu_seconds_total')) {
      client.collectDefaultMetrics();
    }

    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    });

    this.httpRequestCount = new client.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });

    this.registerBusinessGauges();
  }

  recordRequest(
    method: string,
    route: string,
    status: number,
    duration: number,
  ) {
    this.httpRequestDuration
      .labels(method, route, status.toString())
      .observe(duration);
    this.httpRequestCount.labels(method, route, status.toString()).inc();
  }

  getMetrics() {
    return client.register.metrics();
  }

  /* ==================== BUSINESS GAUGES ==================== */

  private registerBusinessGauges() {
    const business = () => this.business();
    const gauge = (
      name: string,
      help: string,
      labelNames: string[],
      fill: (g: client.Gauge<string>, s: BusinessSnapshot) => void,
    ) =>
      new client.Gauge({
        name,
        help,
        labelNames,
        async collect() {
          const snapshot = await business().catch(() => null);
          this.reset();
          if (snapshot) fill(this, snapshot);
        },
      });

    gauge(
      'sfa_erp_backlog',
      'Records not yet in ERP',
      ['kind', 'status'],
      (g, s) => {
        for (const row of s.erp) g.labels(row.kind, row.status).set(row.count);
      },
    );
    gauge(
      'sfa_sync_stuck_changes',
      'Offline changes whose latest upload failed (30 days)',
      [],
      (g, s) => g.set(s.stuckChanges),
    );
    gauge('sfa_open_work_sessions', 'Work sessions not yet ended', [], (g, s) =>
      g.set(s.openWorkSessions),
    );
    gauge(
      'sfa_open_alerts',
      'Open or acknowledged monitoring alerts',
      ['severity'],
      (g, s) => {
        for (const row of s.openAlerts) g.labels(row.severity).set(row.count);
      },
    );
    gauge(
      'sfa_phone_app_version',
      'Phones per app version (checked in within 24 h)',
      ['version'],
      (g, s) => {
        for (const row of s.appVersions) g.labels(row.version).set(row.count);
      },
    );
    gauge(
      'sfa_phones_checked_in',
      'Phones that checked in within 24 h',
      [],
      (g, s) => g.set(s.phonesCheckedIn),
    );

    new client.Gauge({
      name: 'sfa_socket_clients',
      help: 'Connected socket.io clients',
      labelNames: ['namespace'],
      collect() {
        this.reset();
        for (const [name, count] of Object.entries(socketCounts()))
          this.labels(name).set(count);
      },
    });
  }

  /** Cached so a 15 s scrape interval does not hammer MongoDB. */
  private async business(): Promise<BusinessSnapshot> {
    if (this.snapshot && Date.now() - this.snapshot.at < CACHE_MS)
      return this.snapshot.value;
    this.pending ??= this.loadBusiness().finally(
      () => (this.pending = undefined),
    );
    const value = await this.pending;
    this.snapshot = { value, at: Date.now() };
    return value;
  }

  private async loadBusiness(): Promise<BusinessSnapshot> {
    const db = this.connection;
    const dayAgo = new Date(Date.now() - 24 * 3600_000);
    const [salesErp, topupErp, stuck, openWorkSessions, openAlerts, versions] =
      await Promise.all([
        db
          .collection('sales')
          .aggregate([
            {
              $match: {
                erpSyncStatus: { $in: ['FAILED', 'PENDING'] },
                isDeleted: { $ne: true },
              },
            },
            { $group: { _id: '$erpSyncStatus', count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection('van_inventory_topup_items')
          .aggregate([
            {
              $match: {
                erpRequestSyncStatus: { $in: ['FAILED', 'PENDING'] },
                isDeleted: { $ne: true },
              },
            },
            { $group: { _id: '$erpRequestSyncStatus', count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection('offline_sync_audit_logs')
          .aggregate([
            {
              $match: {
                createdAt: { $gte: new Date(Date.now() - 30 * 86400_000) },
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: { o: '$ownerId', q: '$queueId', l: '$localId' },
                status: { $first: '$status' },
              },
            },
            { $match: { status: 'FAILED' } },
            { $count: 'count' },
          ])
          .toArray(),
        db.collection('work_sessions').countDocuments({
          status: { $ne: 'COMPLETED' },
          isDeleted: { $ne: true },
        }),
        db
          .collection('ops_alerts')
          .aggregate([
            { $match: { status: { $in: ['OPEN', 'ACKNOWLEDGED'] } } },
            { $group: { _id: '$severity', count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection('device_diagnostics')
          .aggregate([
            { $match: { lastHeartbeatAt: { $gte: dayAgo } } },
            { $group: { _id: '$appVersion', count: { $sum: 1 } } },
          ])
          .toArray(),
      ]);
    return {
      erp: [
        ...salesErp.map((row) => ({
          kind: 'sales',
          status: String(row._id),
          count: row.count,
        })),
        ...topupErp.map((row) => ({
          kind: 'topup_lines',
          status: String(row._id),
          count: row.count,
        })),
      ],
      stuckChanges: stuck[0]?.count ?? 0,
      openWorkSessions,
      openAlerts: openAlerts.map((row) => ({
        severity: String(row._id),
        count: row.count,
      })),
      appVersions: versions.map((row) => ({
        version: String(row._id ?? 'unknown'),
        count: row.count,
      })),
      phonesCheckedIn: versions.reduce((sum, row) => sum + row.count, 0),
    };
  }
}
