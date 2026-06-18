import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  VanErpClosing,
  VanErpClosingSchema,
} from 'src/core/database/mongo/schema/van-erp-closing.schema';
import { VanErpClosingController } from './van-erp-closing.controller';
import { VanErpClosingService } from './van-erp-closing.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: VanErpClosing.name, schema: VanErpClosingSchema },
    ]),
  ],
  controllers: [VanErpClosingController],
  providers: [VanErpClosingService],
  exports: [VanErpClosingService],
})
export class VanErpClosingModule {}
