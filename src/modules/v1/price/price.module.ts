import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Price,
  PriceSchema,
} from 'src/core/database/mongo/schema/price.schema';
import { PriceController } from './price.controller';
import { PriceService } from './price.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Price.name, schema: PriceSchema }]),
  ],
  controllers: [PriceController],
  providers: [PriceService],
  exports: [PriceService],
})
export class PriceModule {}
