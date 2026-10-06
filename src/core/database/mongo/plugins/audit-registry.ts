/**
 * Audited Modules
 * ---------------
 * Every main business module whose changes are written to `audit_logs`.
 * Add a module here to audit it; the plugin is attached at connection start.
 *
 * Deliberately NOT audited (high-volume ledgers / telemetry / derived data):
 * live location, interaction logs, notifications, devices, media, inventory
 * transactions, van inventory, van daily stock, sale items, top-up items,
 * stock count items, shop visits, work / route sessions, activities,
 * productivity reports, permissions (seeded), audit logs themselves.
 */

import type { Schema } from 'mongoose';
import type { AuditPluginOptions } from './audit-logs.plugin';

import { BeatSchema } from '../schema/beat.schema';
import { ChannelSchema } from '../schema/channel.schema';
import { CountrySchema } from '../schema/country.schema';
import { CustomerCategorySchema } from '../schema/customer-category.schema';
import { CustomerSchema } from '../schema/customer.schema';
import { EmployeeSchema } from '../schema/employee.schema';
import { FocusedPackTargetSchema } from '../schema/focused-pack-target.schema';
import { LeaveSchema } from '../schema/leave.schema';
import { MarketSchema } from '../schema/market.schema';
import { NonSaleSchema } from '../schema/non-sale.schema';
import { OutletTypeSchema } from '../schema/outlet-type.schema';
import { OutletVerificationSchema } from '../schema/outlet-verification.schema';
import { PaymentSchema } from '../schema/payment.schema';
import { PositionSchema } from '../schema/position.schema';
import { PriceSchema } from '../schema/price.schema';
import { ProductCategorySchema } from '../schema/product-category';
import { ProductSchema } from '../schema/product.schema';
import { ProvinceSchema } from '../schema/province.schema';
import { RoleSchema } from '../schema/role.schema';
import { RouteChangeRequestSchema } from '../schema/route-change-request.schema';
import { RouteCustomerMappingSchema } from '../schema/route-customer-mapping.schema';
import { RouteSchema } from '../schema/route.schema';
import { SaleSchema } from '../schema/sale.schema';
import { SchemeSchema } from '../schema/scheme.schema';
import { SegmentationSchema } from '../schema/segmentation.schema';
import { StockCountSchema } from '../schema/stock-count.schema';
import { StockUnloadRequestSchema } from '../schema/stock-unload-request.schema';
import { TargetSchema } from '../schema/target.schema';
import { UserSchema } from '../schema/user.schema';
import { VanChangeRequestSchema } from '../schema/van-change-request.schema';
import { VanInventoryTopupSchema } from '../schema/van-inventory-topup.schema';
import { VanSchema } from '../schema/van.schema';

export type AuditedModule = AuditPluginOptions & {
  schema: Schema;
  /** Display name for the admin audit log */
  label: string;
};

export const AUDITED_MODULES: AuditedModule[] = [
  /* ---------- Geography & masters ---------- */
  { schema: CountrySchema, entity: 'countries', idField: 'countryId', label: 'Countries' },
  { schema: ProvinceSchema, entity: 'provinces', idField: 'provinceId', label: 'Provinces' },
  { schema: MarketSchema, entity: 'markets', idField: 'marketId', label: 'Markets' },
  { schema: BeatSchema, entity: 'beats', idField: 'beatId', label: 'Beats' },
  { schema: ChannelSchema, entity: 'channels', idField: 'channelId', label: 'Channels' },
  { schema: SegmentationSchema, entity: 'segmentations', idField: 'segmentationId', label: 'Segmentations' },
  { schema: OutletTypeSchema, entity: 'outlet-types', idField: 'outletTypeId', label: 'Outlet Types' },
  { schema: CustomerCategorySchema, entity: 'customer-categories', idField: 'customerCategoryId', label: 'Customer Categories' },

  /* ---------- Products, pricing, schemes ---------- */
  { schema: ProductCategorySchema, entity: 'product-categories', idField: 'categoryId', label: 'Product Categories' },
  { schema: ProductSchema, entity: 'products', idField: 'productId', label: 'Products' },
  { schema: PriceSchema, entity: 'prices', idField: 'priceId', label: 'Prices' },
  { schema: SchemeSchema, entity: 'schemes', idField: 'schemeId', label: 'Schemes' },

  /* ---------- Organisation & access ---------- */
  { schema: RoleSchema, entity: 'roles', idField: 'roleId', label: 'Roles' },
  { schema: PositionSchema, entity: 'positions', idField: 'positionId', label: 'Positions' },
  { schema: EmployeeSchema, entity: 'employees', idField: 'employeeId', label: 'Employees' },
  { schema: UserSchema, entity: 'users', idField: 'profileId', label: 'User Logins' },
  { schema: VanSchema, entity: 'vans', idField: 'vanId', label: 'Vans' },

  /* ---------- Outlets & routes ---------- */
  { schema: CustomerSchema, entity: 'customers', idField: 'customerId', label: 'Outlets' },
  { schema: OutletVerificationSchema, entity: 'outlet-verifications', idField: 'outletVerificationId', label: 'Outlet Verifications' },
  { schema: RouteSchema, entity: 'routes', idField: 'routeId', label: 'Routes' },
  { schema: RouteCustomerMappingSchema, entity: 'route-outlets', idField: 'mappingId', label: 'Route Outlets' },

  /* ---------- Transactions ---------- */
  { schema: SaleSchema, entity: 'sales', idField: 'saleId', label: 'Sales' },
  { schema: PaymentSchema, entity: 'payments', idField: 'paymentId', label: 'Payments' },
  { schema: NonSaleSchema, entity: 'non-sales', idField: 'nonSaleId', label: 'Non-Sales' },
  { schema: VanInventoryTopupSchema, entity: 'topups', idField: 'vanInventoryTopupId', label: 'Top-ups' },
  { schema: StockCountSchema, entity: 'stock-counts', idField: 'stockCountId', label: 'Stock Counts' },
  { schema: StockUnloadRequestSchema, entity: 'stock-unloads', idField: 'unloadRequestId', label: 'Stock Unloads' },

  /* ---------- Requests & targets ---------- */
  { schema: VanChangeRequestSchema, entity: 'van-change-requests', idField: 'vanChangeRequestId', label: 'Van Change Requests' },
  { schema: RouteChangeRequestSchema, entity: 'route-change-requests', idField: 'routeChangeRequestId', label: 'Route Change Requests' },
  { schema: LeaveSchema, entity: 'leaves', idField: 'leaveId', label: 'Leaves' },
  { schema: TargetSchema, entity: 'targets', label: 'Targets' },
  { schema: FocusedPackTargetSchema, entity: 'focused-pack-targets', label: 'Focused Pack Targets' },
];
