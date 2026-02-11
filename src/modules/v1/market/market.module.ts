
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Market, MarketSchema } from 'src/core/database/mongo/schema/market.schema';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Market.name, schema: MarketSchema }]),
  ],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}
