import { Module } from '@nestjs/common';
import { CountryModule } from '../country/country.module';
import { ProvinceModule } from '../province/province.module';
import { PositionModule } from '../position/position.module';
import { CustomerCategoryModule } from '../customer-category/customer-category.module';
import { ChannelModule } from '../channel/channel.module';
import { OutletTypeModule } from '../outlet-type/outlet-type.module';
import { MarketModule } from '../market/market.module';
import { ProductCategoryModule } from '../product-category/product-category.module';
import { SegmentationModule } from '../segmentation/segmentation.module';
import { MasterBulkController } from './master-bulk.controller';
import { MasterBulkService } from './master-bulk.service';
import { RoleModule } from '../role/role.module';

@Module({
  imports: [CountryModule, ProvinceModule, PositionModule, CustomerCategoryModule, ChannelModule, OutletTypeModule, MarketModule, ProductCategoryModule, SegmentationModule, RoleModule],
  controllers: [MasterBulkController],
  providers: [MasterBulkService],
})
export class MasterBulkModule {}
