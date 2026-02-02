import { Controller, Get, Res, Version, VERSION_NEUTRAL } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service';
import { FeatureFlag } from '../decorators/feature-flag.decorator';

@FeatureFlag('ENABLE_METRICS_MODULE')
@Controller({
  path: 'metrics',
  version: VERSION_NEUTRAL, // ⬅ IMPORTANT
})
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/plain');
    res.send(await this.metrics.getMetrics());
  }
}
