import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: () => void) {
    const start = process.hrtime();

    res.on('finish', () => {
      const diff = process.hrtime(start);
      const duration = diff[0] + diff[1] / 1e9;

      this.metrics.recordRequest(
        req.method,
        req.route?.path || req.originalUrl,
        res.statusCode,
        duration,
      );
    });

    next();
  }
}
