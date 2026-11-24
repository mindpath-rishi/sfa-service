import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LiveLocationController } from './live-location.controller';
import { LiveLocationService } from './live-location.service';
import { LiveLocationGateway } from './live-location.gateway';
import { LocationPointsStore } from './location-points.store';
import { RoadSnapService } from './road-snap.service';
import { DayRouteService } from './day-route.service';
import { TrackingSettingsService } from './tracking-settings.service';
import { jwtConfig } from 'src/core/config/jwt.config';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        ...jwtConfig,
      }),
    }),
  ],
  controllers: [LiveLocationController],
  providers: [
    LiveLocationService,
    LiveLocationGateway,
    LocationPointsStore,
    RoadSnapService,
    DayRouteService,
    TrackingSettingsService,
  ],
  exports: [LiveLocationService, TrackingSettingsService],
})
export class LiveLocationModule {}
