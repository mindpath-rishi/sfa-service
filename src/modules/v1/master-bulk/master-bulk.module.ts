import { Module } from '@nestjs/common';
import { CountryModule } from '../country/country.module';
import { ProvinceModule } from '../province/province.module';
import { DesignationModule } from '../designation/designation.module';
import { CustomerCategoryModule } from '../customer-category/customer-category.module';
import { ChannelModule } from '../channel/channel.module';
import { OutletTypeModule } from '../outlet-type/outlet-type.module';
import { MarketModule } from '../market/market.module';
import { ProductCategoryModule } from '../product-category/product-category.module';
import { MasterBulkController } from './master-bulk.controller';
import { MasterBulkService } from './master-bulk.service';

@Module({
  imports: [CountryModule, ProvinceModule, DesignationModule, CustomerCategoryModule, ChannelModule, OutletTypeModule, MarketModule, ProductCategoryModule],
  controllers: [MasterBulkController],
  providers: [MasterBulkService],
})
export class MasterBulkModule {}
