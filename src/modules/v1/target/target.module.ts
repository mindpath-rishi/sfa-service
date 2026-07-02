import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Target,
  TargetSchema,
} from 'src/core/database/mongo/schema/target.schema';
import { TargetController } from './target.controller';
import { TargetService } from './target.service';
import {
  FocusedPackTarget,
  FocusedPackTargetSchema,
} from 'src/core/database/mongo/schema/focused-pack-target.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Target.name, schema: TargetSchema },
      { name: FocusedPackTarget.name, schema: FocusedPackTargetSchema },
    ]),
  ],
  controllers: [TargetController],
  providers: [TargetService],
  exports: [TargetService],
})
export class TargetModule {}
