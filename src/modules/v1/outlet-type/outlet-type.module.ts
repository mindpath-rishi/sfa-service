
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { OutletType, OutletTypeSchema } from 'src/core/database/mongo/schema/outlet-type.schema';
import { OutletTypeController } from './outlet-type.controller';
import { OutletTypeService } from './outlet-type.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: OutletType.name, schema: OutletTypeSchema }]),
  ],
  controllers: [OutletTypeController],
  providers: [OutletTypeService],
  exports: [OutletTypeService],
})
export class OutletTypeModule {}
