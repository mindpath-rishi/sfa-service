
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Channel, ChannelSchema } from 'src/core/database/mongo/schema/channel.schema';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Channel.name, schema: ChannelSchema }]),
  ],
  controllers: [ChannelController],
  providers: [ChannelService],
  exports: [ChannelService],
})
export class ChannelModule {}
