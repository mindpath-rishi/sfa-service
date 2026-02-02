import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Media,
  MediaSchema,
} from 'src/core/database/mongo/schema/media.schema';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageModule } from 'src/core/storage/storage.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Media.name, schema: MediaSchema }]),
    StorageModule
  ],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
