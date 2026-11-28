import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: () => void) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      // Label by route pattern (/api/v1/sale/:id), never the raw URL: IDs in
      // labels create a new time series per record and swamp Prometheus.
      const route = req.route?.path
        ? `${req.baseUrl ?? ''}${req.route.path}`
        : 'unmatched';
      this.metrics.recordRequest(req.method, route, res.statusCode, duration);
    });

    next();
  }
}
