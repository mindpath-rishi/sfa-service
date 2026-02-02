import { Injectable } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly httpRequestDuration: client.Histogram<string>;
  private readonly httpRequestCount: client.Counter<string>;

  constructor() {
    client.collectDefaultMetrics();

    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
    });

    this.httpRequestCount = new client.Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
    });
  }

  recordRequest(method: string, route: string, status: number, duration: number) {
    this.httpRequestDuration.labels(method, route, status.toString()).observe(duration);
    this.httpRequestCount.labels(method, route, status.toString()).inc();
  }

  getMetrics() {
    return client.register.metrics();
  }
}