import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Segmentation, SegmentationSchema } from 'src/core/database/mongo/schema/segmentation.schema';
import { SegmentationController } from './segmentation.controller';
import { SegmentationService } from './segmentation.service';

@Module({
  imports: [MongooseModule.forFeature([{ name: Segmentation.name, schema: SegmentationSchema }])],
  controllers: [SegmentationController],
  providers: [SegmentationService],
  exports: [SegmentationService],
})
export class SegmentationModule {}
