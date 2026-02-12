
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Beat, BeatSchema } from 'src/core/database/mongo/schema/beat.schema';
import { BeatController } from './beat.controller';
import { BeatService } from './beat.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Beat.name, schema: BeatSchema }]),
  ],
  controllers: [BeatController],
  providers: [BeatService],
  exports: [BeatService],
})
export class BeatModule {}
