// import { Module } from '@nestjs/common';
// import { MongooseModule } from '@nestjs/mongoose';

// import {
//   Customer,
//   CustomerSchema,
// } from 'src/core/database/mongo/schema/customer.schema';
// import { RouteCustomerMappingModule } from '../route-customer-mapping/route-customer-mapping.module';
// import { CustomerController } from './customer.controller';
// import { CustomerService } from './customer.service';
// import {
//   ShopVisit,
//   ShopVisitSchema,
// } from 'src/core/database/mongo/schema/shop-visit.schema';
// import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';

// @Module({
//   imports: [
//     MongooseModule.forFeature([
//       { name: Customer.name, schema: CustomerSchema },
//       { name: ShopVisit.name, schema: ShopVisitSchema },
//       { name: Sale.name, schema: SaleSchema },
//     ]),
//     RouteCustomerMappingModule,
//   ],
//   controllers: [CustomerController],
//   providers: [CustomerService],
//   exports: [CustomerService],
// })
// export class CustomerModule {}

import { Module } from '@nestjs/common';

import { MongooseModule } from '@nestjs/mongoose';

import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';

import {
  ShopVisit,
  ShopVisitSchema,
} from 'src/core/database/mongo/schema/shop-visit.schema';

import { Sale, SaleSchema } from 'src/core/database/mongo/schema/sale.schema';

import {
  Country,
  CountrySchema,
} from 'src/core/database/mongo/schema/country.schema';

import {
  Province,
  ProvinceSchema,
} from 'src/core/database/mongo/schema/province.schema';

import {
  Market,
  MarketSchema,
} from 'src/core/database/mongo/schema/market.schema';

import {
  Route,
  RouteSchema,
} from 'src/core/database/mongo/schema/route.schema';

import {
  RouteCustomerMapping,
  RouteCustomerMappingSchema,
} from 'src/core/database/mongo/schema/route-customer-mapping.schema';

import { RouteCustomerMappingModule } from '../route-customer-mapping/route-customer-mapping.module';

import { CustomerController } from './customer.controller';

import { CustomerService } from './customer.service';
import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      /* ======================================================
       * CUSTOMER
       * ====================================================== */

      {
        name: Customer.name,
        schema: CustomerSchema,
      },

      /* ======================================================
       * SHOP VISIT
       * ====================================================== */

      {
        name: ShopVisit.name,
        schema: ShopVisitSchema,
      },

      /* ======================================================
       * SALE
       * ====================================================== */

      {
        name: Sale.name,
        schema: SaleSchema,
      },

      /* ======================================================
       * COUNTRY
       * ====================================================== */

      {
        name: Country.name,
        schema: CountrySchema,
      },

      /* ======================================================
       * PROVINCE
       * ====================================================== */

      {
        name: Province.name,
        schema: ProvinceSchema,
      },

      /* ======================================================
       * MARKET
       * ====================================================== */

      {
        name: Market.name,
        schema: MarketSchema,
      },

      /* ======================================================
       * ROUTE
       * ====================================================== */

      {
        name: Route.name,
        schema: RouteSchema,
      },

      {
        name: Van.name,
        schema: VanSchema,
      },

      /* ======================================================
       * ROUTE CUSTOMER MAPPING
       * ====================================================== */

      {
        name: RouteCustomerMapping.name,
        schema: RouteCustomerMappingSchema,
      },
    ]),

    RouteCustomerMappingModule,
  ],

  controllers: [CustomerController],

  providers: [CustomerService],

  exports: [CustomerService],
})
export class CustomerModule {}
