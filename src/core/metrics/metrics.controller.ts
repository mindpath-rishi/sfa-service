import {
  Controller,
  Get,
  Headers,
  Res,
  UnauthorizedException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import type { Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { Public } from '../decorators/public.decorator';
import { FeatureFlag } from '../decorators/feature-flag.decorator';
import { MetricsService } from './metrics.service';

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Prometheus scrape endpoint at /metrics (outside the /api prefix).
 * Not behind user login, so Prometheus can reach it; when METRICS_TOKEN is
 * set (do this in production) it requires `Authorization: Bearer <token>`.
 */
@Public()
@FeatureFlag('ENABLE_METRICS_MODULE')
@Controller({ path: 'metrics', version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(
    @Res() res: Response,
    @Headers('authorization') authorization?: string,
  ) {
    const token = process.env.METRICS_TOKEN;
    if (token && !sameSecret(authorization ?? '', `Bearer ${token}`)) {
      throw new UnauthorizedException('Metrics token required');
    }
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(await this.metrics.getMetrics());
  }
}
