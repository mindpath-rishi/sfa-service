import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Scheme,
  SchemeSchema,
} from 'src/core/database/mongo/schema/scheme.schema';
import { SchemeController } from './scheme.controller';
import { SchemeService } from './scheme.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Scheme.name, schema: SchemeSchema }]),
  ],
  controllers: [SchemeController],
  providers: [SchemeService],
  exports: [SchemeService],
})
export class SchemeModule {}
