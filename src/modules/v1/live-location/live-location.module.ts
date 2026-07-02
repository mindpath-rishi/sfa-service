import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  LiveLocation,
  LiveLocationSchema,
} from 'src/core/database/mongo/schema/live-location.schema';
import { LiveLocationController } from './live-location.controller';
import { LiveLocationService } from './live-location.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LiveLocation.name, schema: LiveLocationSchema },
    ]),
  ],
  controllers: [LiveLocationController],
  providers: [LiveLocationService],
  exports: [LiveLocationService],
})
export class LiveLocationModule {}
