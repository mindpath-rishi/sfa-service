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
import { InventoryModule } from './modules/v1/inventory/inventory.module';
import { InventoryTransactionModule } from './modules/v1/inventory-transaction/inventory-transaction.module';

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
    InventoryModule,
    InventoryTransactionModule,],
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
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
  exports: [MongoService, RedisRepository],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
