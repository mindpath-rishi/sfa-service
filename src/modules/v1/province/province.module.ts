
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { Province, ProvinceSchema } from 'src/core/database/mongo/schema/province.schema';
import { ProvinceController } from './province.controller';
import { ProvinceService } from './province.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Province.name, schema: ProvinceSchema }]),
  ],
  controllers: [ProvinceController],
  providers: [ProvinceService],
  exports: [ProvinceService],
})
export class ProvinceModule {}
