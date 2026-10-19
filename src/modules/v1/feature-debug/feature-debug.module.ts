import { Module } from '@nestjs/common';
import { SaleModule } from '../sale/sale.module';
import { SyncModule } from '../sync/sync.module';
import { VanInventoryTopupModule } from '../van-inventory-topup/van-inventory-topup.module';
import { FeatureDebugController } from './feature-debug.controller';
import { FeatureDebugService } from './feature-debug.service';
import { RepairsService } from './repairs.service';
import { SyncPreviewService } from './sync-preview.service';

@Module({
  imports: [SaleModule, VanInventoryTopupModule, SyncModule],
  controllers: [FeatureDebugController],
  providers: [FeatureDebugService, RepairsService, SyncPreviewService],
  exports: [FeatureDebugService],
})
export class FeatureDebugModule {}
