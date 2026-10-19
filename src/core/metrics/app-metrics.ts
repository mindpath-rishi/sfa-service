import * as client from 'prom-client';

/**
 * Business counters for Prometheus/Grafana. Module-level singletons on the
 * default registry, so services can record without injecting MetricsService.
 */

const counter = (name: string, help: string, labelNames: string[]) =>
  (client.register.getSingleMetric(name) as client.Counter<string>) ??
  new client.Counter({ name, help, labelNames });

export const syncOperationsTotal = counter(
  'sfa_sync_operations_total',
  'Offline sync operations uploaded by phones',
  ['entity', 'result'],
);

export const mobileErrorsTotal = counter(
  'sfa_mobile_errors_total',
  'Errors reported by the mobile app',
  ['level'],
);

export const alertsRaisedTotal = counter(
  'sfa_alerts_raised_total',
  'Monitoring alerts raised',
  ['severity'],
);

export const logEntriesTotal = counter(
  'sfa_log_entries_total',
  'Log entries stored, by level',
  ['level'],
);

export const repairsTotal = counter(
  'sfa_repairs_total',
  'Repair actions run from the Feature Debugger',
  ['action', 'result'],
);

/* ==================== SOCKETS ==================== */

type SocketCounter = () => number;
const socketCounters = new Map<string, SocketCounter>();

/** Gateways register how to count their connected clients. */
export const registerSocketCounter = (name: string, count: SocketCounter) => {
  socketCounters.set(name, count);
};

export const socketCounts = () =>
  Object.fromEntries(
    [...socketCounters.entries()].map(([name, count]) => {
      try {
        return [name, count()];
      } catch {
        return [name, 0];
      }
    }),
  ) as Record<string, number>;
