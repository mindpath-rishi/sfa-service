
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CustomerCategory, CustomerCategorySchema } from 'src/core/database/mongo/schema/customer-category.schema';
import { CustomerCategoryController } from './customer-category.controller';
import { CustomerCategoryService } from './customer-category.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerCategory.name, schema: CustomerCategorySchema }]),
  ],
  controllers: [CustomerCategoryController],
  providers: [CustomerCategoryService],
  exports: [CustomerCategoryService],
})
export class CustomerCategoryModule {}
