import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(MetricsMiddleware)
      .exclude({ path: 'metrics', method: RequestMethod.GET })
      // The global "api" prefix is added to middleware routes automatically;
      // the old 'api/*path' became /api/api/* and never matched anything.
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
