import { CountryModule } from './modules/v1/country/country.module';
import { Module, MiddlewareConsumer, NestModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { envValidationSchema } from './core/config/env.validation';
import { mongoConfig } from './core/config/mongo.config';
import { CustomerCategoryModule } from './modules/v1/customer-category/customer-category.module';
import { AppLoggerModule } from './core/logger/logger.module';
import { LoggerService } from './core/logger/logger.service';
import { MetricsModule } from './core/metrics/metrics.module';
import { HealthModule } from './modules/v1/health/health.service';
import { SessionMiddleware } from './core/middlewares/session.middleware';
import { MongoService } from './core/database/mongo/mongo.service';
import { RedisRepository } from './core/database/radis/radis.repository';
import { AppControlService } from './core/config/app-control.service';
import { AppControlGuard } from './core/guards/app-control.guard';
import { JwtAuthGuard } from './core/guards/jwt.guard';
import { THROTTLE_LIMIT, THROTTLE_TTL } from './shared/constants/app.constants';
import { AuditLogsModule } from './modules/v1/audit-logs/audit-logs.module';
import { PermissionsGuard } from './core/guards/permission.guard';
import { SeedsModule } from './core/seeds/seeds.module';
import { PermissionModule } from './modules/v1/permission/permission.module';
import { MediaModule } from './modules/v1/media/media.module';
import { RoleModule } from './modules/v1/role/role.module';
import { EmployeeModule } from './modules/v1/employee/employee.module';
import { NotificationModule } from './modules/v1/notification/notification.module';
import { ProductModule } from './modules/v1/product/product.module';
import { ProductCategoryModule } from './modules/v1/product-category/product-category.module';
import { VanModule } from './modules/v1/van/van.module';
import { MarketModule } from './modules/v1/market/market.module';
import { ProvinceModule } from './modules/v1/province/province.module';
import { OutletTypeModule } from './modules/v1/outlet-type/outlet-type.module';
import { BeatModule } from './modules/v1/beat/beat.module';
import { RouteModule } from './modules/v1/route/route.module';
import { CustomerModule } from './modules/v1/customer/customer.module';
import { InventoryTransactionModule } from './modules/v1/inventory-transaction/inventory-transaction.module';
import { StockCountModule } from './modules/v1/stock-count/stock-count.module';
import { StockCountItemModule } from './modules/v1/stock-count-item/stock-count-item.module';
import { StockSalesModule } from './modules/v1/stock-sales/stock-sales.module';
import { StockSalesItemModule } from './modules/v1/stock-sales-item/stock-sales-item.module';
import { VanInventoryModule } from './modules/v1/van-inventory/van-inventory.module';
import { VanDailyStockModule } from './modules/v1/van-daily-stock/van-daily-stock.module';
import { VanInventoryTopupModule } from './modules/v1/van-inventory-topup/van-inventory-topup.module';
import { VanInventoryTopupItemModule } from './modules/v1/van-inventory-topup-item/van-inventory-topup-item.module';
import { ActivityModule } from './modules/v1/activity/activity.module';
import { WorkSessionModule } from './modules/v1/work-session/work-session.module';
import { RouteSessionModule } from './modules/v1/route-session/route-session.module';
import { ShopVisitModule } from './modules/v1/shop-visit/shop-visit.module';
import { RouteCustomerMappingModule } from './modules/v1/route-customer-mapping/route-customer-mapping.module';
import { NonSaleModule } from './modules/v1/non-sale/non-sale.module';
import { PaymentModule } from './modules/v1/payment/payment.module';
import { SaleModule } from './modules/v1/sale/sale.module';
import { SaleItemModule } from './modules/v1/sale-item/sale-item.module';

@Global()
@Module({
  imports: [
    CountryModule,
    /* ================= CONFIG ================= */
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV}`],
      validationSchema: envValidationSchema,
    }),

    /* ================= LOGGER ================= */
    AppLoggerModule,

    /* ================= DATABASE ================= */
    MongooseModule.forRootAsync({
      imports: [AppLoggerModule],
      inject: [ConfigService, LoggerService],
      useFactory: (config: ConfigService, logger: LoggerService) =>
        mongoConfig(config.get('MONGO_URI')!, logger),
    }),

    /* ================= RATE LIMITING ================= */
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: THROTTLE_TTL, limit: THROTTLE_LIMIT }],
    }),

    /* ================= FEATURE MODULES ================= */
    MetricsModule,
    HealthModule,
    AuditLogsModule,
    RoleModule,
    SeedsModule,
    PermissionModule,
    MediaModule,
    EmployeeModule,
    NotificationModule,
    ProductModule,
    ProductCategoryModule,
    VanModule,
    MarketModule,
    ProvinceModule,
    CustomerCategoryModule,
    OutletTypeModule,
    BeatModule,
    RouteModule,
    CustomerModule,
    InventoryTransactionModule,
    StockCountModule,
    StockCountItemModule,
    StockSalesModule,
    StockSalesItemModule,
    VanInventoryModule,
    VanDailyStockModule,
    VanInventoryTopupModule,
    VanInventoryTopupItemModule,
    ActivityModule,
    WorkSessionModule,
    RouteSessionModule,
    ShopVisitModule,
    RouteCustomerMappingModule,
    NonSaleModule,
    PaymentModule,
    SaleModule,
    SaleItemModule,
  ],
  providers: [
    AppControlService,
    MongoService,
    RedisRepository,

    /* ===== GLOBAL FEATURE FLAG GUARD ===== */
    {
      provide: APP_GUARD,
      useClass: AppControlGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // {
    //   provide: APP_GUARD,
    //   useClass: PermissionsGuard,
    // },
  ],
  exports: [MongoService, RedisRepository],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
