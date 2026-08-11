import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LiveLocation,
  LiveLocationSchema,
} from 'src/core/database/mongo/schema/live-location.schema';
import { LiveLocationController } from './live-location.controller';
import { LiveLocationService } from './live-location.service';
import { LiveLocationGateway } from './live-location.gateway';
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
    MongooseModule.forFeature([
      { name: LiveLocation.name, schema: LiveLocationSchema },
    ]),
  ],
  controllers: [LiveLocationController],
  providers: [LiveLocationService, LiveLocationGateway],
  exports: [LiveLocationService],
})
export class LiveLocationModule {}
