import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import { VanService } from './van.service';
import { VanController } from './van.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Van.name, schema: VanSchema }])],
  providers: [VanService],
  controllers: [VanController],
  exports: [VanService],
})
export class VanModule {}
