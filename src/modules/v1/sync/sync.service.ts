

// import { Injectable } from '@nestjs/common';
// import { InjectConnection } from '@nestjs/mongoose';
// import { Connection, Types } from 'mongoose';

// import { SyncOperationDto } from './dto/sync.dto';
// import { IdGenerator } from 'src/shared/utils/id-generator.utils';
// import { NotificationService } from '../notification/notification.service';

// const COLLECTIONS = {
//   customers: 'customer_master',
//   outlets: 'customer_master',
//   products: 'product_master',
//   categories: 'productcategories',
//   customerCategories: 'customer_category_master',
//   channels: 'channel_master',
//   outletTypes: 'outlet_type_master',
//   segmentations: 'segmentation_master',
//   priceLists: 'price_master',
//   vans: 'vans',
//   routes: 'route_master',
//   routeSessions: 'route_sessions',
//   salesmen: 'employees',
//   stock: 'inventories',
//   promotions: 'promotions',
//   orders: 'sales',
//   orderItems: 'sale_items',
//   collections: 'payments',
//   attendance: 'work_sessions',
//   activities: 'activities',
//   visits: 'shop_visits',
//   interactions: 'interaction_logs',
//   nonSales: 'non_sale',
//   leaves: 'leaves',
//   surveys: 'surveys',
//   expenses: 'expenses',
//   returns: 'returns',
//   complaints: 'complaints',
//   targets: 'targets',
//   vanDailyStock: 'van_daily_stock',
//   vanErpClosing: 'van_erp_closing',
//   inventoryTransactions: 'inventory_transactions',
// } as const;

// const ENTITY_ID_FIELDS: Record<keyof typeof COLLECTIONS, string> = {
//   customers: 'customerId',
//   outlets: 'customerId',
//   products: 'productId',
//   categories: 'categoryId',
//   customerCategories: 'customerCategoryId',
//   channels: 'channelId',
//   outletTypes: 'outletTypeId',
//   segmentations: 'segmentationId',
//   priceLists: 'priceId',
//   vans: 'vanId',
//   routes: 'routeId',
//   routeSessions: 'routeSessionId',
//   salesmen: 'employeeId',
//   stock: 'inventoryId',
//   promotions: 'promotionId',
//   orders: 'saleId',
//   orderItems: 'saleItemId',
//   collections: 'paymentId',
//   attendance: 'workSessionId',
//   activities: 'activityId',
//   visits: 'visitId',
//   interactions: 'interactionId',
//   nonSales: 'nonSaleId',
//   leaves: 'leaveId',
//   surveys: 'surveyId',
//   expenses: 'expenseId',
//   returns: 'returnId',
//   complaints: 'complaintId',
//   targets: '_id',
//   vanDailyStock: 'vanDailyStockId',
//   vanErpClosing: 'stockId',
//   inventoryTransactions: 'transactionId',
// };

// const MASTER_ENTITIES = new Set([
//   'products',
//   'categories',
//   'customerCategories',
//   'channels',
//   'outletTypes',
//   'segmentations',
//   'priceLists',
//   'vans',
//   'routes',
//   'salesmen',
//   'stock',
//   'promotions',
//   'targets',
//   'vanErpClosing',
// ]);

// const WRITABLE_ENTITIES = new Set([
//   'customers',
//   'outlets',
//   'orders',
//   'orderItems',
//   'collections',
//   'attendance',
//   'activities',
//   'visits',
//   'interactions',
//   'nonSales',
//   'leaves',
//   'surveys',
//   'expenses',
//   'returns',
//   'complaints',
//   'vanDailyStock',
//   'inventoryTransactions',
// ]);
// const GLOBAL_MASTER_ENTITIES = new Set([
//   'products',
//   'categories',
//   'customerCategories',
//   'channels',
//   'outletTypes',
//   'segmentations',
//   'priceLists',
//   'promotions',
// ]);

// const ENTITY_DATE_FIELDS: Partial<Record<keyof typeof COLLECTIONS, string[]>> =
//   {
//     orders: ['date'],
//     collections: ['date'],
//     attendance: ['dayStartTime', 'dayEndTime'],
//     activities: ['startTime', 'endTime'],
//     visits: ['checkInTime', 'checkOutTime'],
//     routeSessions: ['sessionDate', 'startTime', 'endTime'],
//     targets: ['startDate', 'endDate'],
//     vanDailyStock: ['date'],
//     vanErpClosing: ['date', 'closeDate', 'modifiedDate', 'createdDate'],
//     inventoryTransactions: ['transactionDate'],
//   };
// type SyncScope = {
//   vanId?: string;
//   routeIds: string[];
//   routeAssignments: Record<
//     string,
//     { day?: string; fromDate?: unknown; toDate?: unknown; isActive: boolean }
//   >;
//   customerIds: string[];
//   customerRouteIds: Record<string, string[]>;
//   saleIds: string[];
// };

// const cleanPayload = (payload: Record<string, unknown>) =>
//   Object.fromEntries(
//     Object.entries(payload).filter(
//       ([key]) =>
//         ![
//           '_id',
//           'uuid',
//           'version',
//           'ownerId',
//           'createdAt',
//           'updatedAt',
//           'deletedAt',
//           'syncStatus',
//           'serverId',
//         ].includes(key) &&
//         !key.startsWith('$') &&
//         !key.includes('.'),
//     ),
//   );

// const toFiniteNumber = (value: unknown, fallback = 0) => {
//   const number = Number(value);
//   return Number.isFinite(number) ? number : fallback;
// };

// const toFixed4 = (value: number) => Number((value || 0).toFixed(4));

// const calculateOfflineSaleItem = (value: unknown) => {
//   const item = { ...((value ?? {}) as Record<string, unknown>) };
//   const caseQty = toFiniteNumber(item.caseQty);
//   const pieceQty = toFiniteNumber(item.pieceQty);
//   const unitQtyInCase = Math.max(toFiniteNumber(item.unitQtyInCase, 1), 1);
//   const casePrice = toFiniteNumber(item.casePrice);
//   const piecePrice = toFiniteNumber(item.piecePrice, casePrice / unitQtyInCase);
//   const pieceNetWeight = toFiniteNumber(item.pieceNetWeight);
//   const quantity = caseQty * unitQtyInCase + pieceQty;

//   return {
//     ...item,
//     caseQty,
//     pieceQty,
//     unitQtyInCase,
//     casePrice: toFixed4(casePrice),
//     piecePrice: toFixed4(piecePrice),
//     quantity,
//     netCases: toFixed4(quantity / unitQtyInCase),
//     totalNetWeight: toFixed4(quantity * pieceNetWeight),
//     totalValue: toFixed4(caseQty * casePrice + pieceQty * piecePrice),
//   };
// };

// const normalizeOfflinePayload = (
//   entity: keyof typeof COLLECTIONS,
//   payload: Record<string, unknown>,
// ) => {
//   for (const field of ENTITY_DATE_FIELDS[entity] ?? []) {
//     const value = payload[field];
//     if (value === undefined || value === null || value instanceof Date)
//       continue;

//     const parsed = new Date(String(value));
//     if (!Number.isNaN(parsed.getTime())) payload[field] = parsed;
//   }

//   if (entity === 'orderItems') {
//     Object.assign(payload, calculateOfflineSaleItem(payload));
//   }

//   if (entity === 'orders') {
//     payload.status ??= 'COMPLETED';
//     const items = Array.isArray(payload.items)
//       ? payload.items.map(calculateOfflineSaleItem)
//       : [];

//     if (items.length) {
//       payload.totalCases = items.reduce(
//         (sum, item) => sum + toFiniteNumber(item.caseQty),
//         0,
//       );
//       payload.totalPieces = items.reduce(
//         (sum, item) => sum + toFiniteNumber(item.pieceQty),
//         0,
//       );
//       payload.totalQty = items.reduce(
//         (sum, item) => sum + toFiniteNumber(item.quantity),
//         0,
//       );
//       payload.totalWeight = toFixed4(
//         items.reduce(
//           (sum, item) => sum + toFiniteNumber(item.totalNetWeight),
//           0,
//         ),
//       );
//       payload.totalValue = toFixed4(
//         items.reduce((sum, item) => sum + toFiniteNumber(item.totalValue), 0),
//       );
//       payload.netCases = toFixed4(
//         items.reduce((sum, item) => sum + toFiniteNumber(item.netCases), 0),
//       );
//       const paidAmount = toFixed4(toFiniteNumber(payload.paidAmount));
//       const pendingAmount = toFixed4(
//         toFiniteNumber(payload.totalValue) - paidAmount,
//       );
//       payload.paidAmount = paidAmount;
//       payload.pendingAmount = pendingAmount;
//       payload.paymentStatus =
//         pendingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
//     }

//     // Line items belong in sale_items and are uploaded as orderItems.
//     delete payload.items;
//   }
//   if (entity === 'collections') payload.status ??= 'SUCCESS';
//   if (entity === 'visits') payload.status ??= 'COMPLETED';

//   return payload;
// };

// @Injectable()
// export class SyncService {
//   constructor(
//     @InjectConnection() private readonly connection: Connection,
//     private readonly notificationService: NotificationService,
//   ) {}

//   /**
//    * Apply an offline SALE ledger entry to the server stock snapshots.
//    *
//    * The transaction id is stored on each affected stock document in the same
//    * atomic update as the quantity change. This makes reconnect retries safe:
//    * the same queued transaction can never reduce stock twice.
//    */
//   private async applyOfflineInventoryTransaction(
//     payload: Record<string, unknown>,
//   ) {
//     if (payload.transactionType !== 'SALE' || payload.direction !== 'OUT')
//       return;

//     const transactionId = String(payload.transactionId ?? '');
//     const productId = String(payload.productId ?? '');
//     const vanId = String(payload.vanId ?? '');
//     const workSessionId = String(payload.workSessionId ?? '');
//     const quantity = toFiniteNumber(payload.quantity);

//     if (!transactionId || !productId || !vanId || quantity <= 0) {
//       throw new Error('Offline sale transaction has invalid stock details');
//     }

//     const inventories = this.connection.collection('inventories');
//     const inventoryResult = await inventories.updateOne(
//       {
//         productId,
//         vanId,
//         status: 'ACTIVE',
//         quantity: { $gte: quantity },
//         appliedOfflineTransactionIds: { $ne: transactionId },
//       },
//       {
//         $inc: { quantity: -quantity },
//         $addToSet: { appliedOfflineTransactionIds: transactionId },
//         $set: { updatedAt: new Date() },
//       },
//     );

//     if (!inventoryResult.matchedCount) {
//       const inventory = await inventories.findOne({
//         productId,
//         vanId,
//         status: 'ACTIVE',
//       });
//       const alreadyApplied =
//         Array.isArray(inventory?.appliedOfflineTransactionIds) &&
//         inventory.appliedOfflineTransactionIds.includes(transactionId);
//       if (!alreadyApplied) {
//         if (!inventory)
//           throw new Error(`Inventory not found for product: ${productId}`);
//         throw new Error(
//           `Insufficient stock for product ${productId}. Available: ${toFiniteNumber(inventory.quantity)}, Required: ${quantity}`,
//         );
//       }
//     }

//     const transactionDate = payload.transactionDate
//       ? new Date(String(payload.transactionDate))
//       : new Date();
//     if (Number.isNaN(transactionDate.getTime()))
//       throw new Error('Offline sale transaction has an invalid date');
//     const dayStart = new Date(transactionDate);
//     dayStart.setHours(0, 0, 0, 0);
//     const dayEnd = new Date(transactionDate);
//     dayEnd.setHours(23, 59, 59, 999);

//     const dailyStock = this.connection.collection('van_daily_stock');

//     /**
//      * Prefer workSessionId because VanDailyStock is unique by:
//      * date + vanId + productId + workSessionId.
//      *
//      * Legacy offline transactions may not have workSessionId, so the fallback
//      * still uses product + van + date.
//      */
//     const dailyStockFilter: Record<string, unknown> = {
//       productId,
//       vanId,
//       date: { $gte: dayStart, $lte: dayEnd },
//       appliedOfflineTransactionIds: { $ne: transactionId },
//     };

//     if (workSessionId) {
//       dailyStockFilter.workSessionId = workSessionId;
//     }

//     const dailyResult = await dailyStock.updateOne(dailyStockFilter, {
//       $inc: { outQty: quantity, closingQty: -quantity },
//       $addToSet: { appliedOfflineTransactionIds: transactionId },
//       $set: { updatedAt: new Date() },
//     });

//     if (!dailyResult.matchedCount) {
//       const existingDailyStock = await dailyStock.findOne(
//         workSessionId
//           ? { productId, vanId, workSessionId, date: { $gte: dayStart, $lte: dayEnd } }
//           : { productId, vanId, date: { $gte: dayStart, $lte: dayEnd } },
//       );

//       const alreadyApplied =
//         Array.isArray(existingDailyStock?.appliedOfflineTransactionIds) &&
//         existingDailyStock.appliedOfflineTransactionIds.includes(transactionId);

//       if (!alreadyApplied) {
//         throw new Error(
//           workSessionId
//             ? `Daily stock not initialized for product: ${productId}, workSession: ${workSessionId}`
//             : `Daily stock not initialized for product: ${productId}`,
//         );
//       }
//     }
//   }

//   async hasOfflineAccess(employeeId: string) {
//     const employee = await this.connection
//       .collection('employees')
//       .findOne(
//         { employeeId, isDeleted: { $ne: true } },
//         { projection: { offlineAccessAllowed: 1, status: 1 } },
//       );
//     return (
//       employee?.status === 'ACTIVE' && employee.offlineAccessAllowed === true
//     );
//   }

//   private async notifyManagerOfOfflineOutlet(
//     payload: Record<string, unknown>,
//     ownerId: string,
//   ) {
//     const creator = await this.connection
//       .collection('employees')
//       .findOne({ employeeId: ownerId, isDeleted: { $ne: true } });
//     const recipientId = String(creator?.reportingEmployeeId ?? '');
//     const customerId = String(payload.customerId ?? '');
//     if (!recipientId || !customerId) return;
//     await this.notificationService.create({
//       recipientId,
//       title: 'New outlet awaiting approval',
//       body: `${String(creator?.name ?? 'An executive')} created ${String(payload.name ?? 'a new outlet')}`,
//       category: 'outlet_approval',
//       data: {
//         category: 'outlet_approval',
//         action: 'APPROVAL_REQUIRED',
//         status: 'PENDING',
//         customerId,
//         outletName: payload.name,
//         ownerName: payload.ownerName,
//         phoneNumber: payload.phoneNumber,
//         address: payload.address,
//         geoTag: payload.geoTag,
//         createdByEmployeeId: ownerId,
//         createdByName: creator?.name,
//         route: '/notifications',
//       },
//     });
//   }

//   private async syncCustomerRouteMapping(
//     customerIdValue: unknown,
//     routeIdValue: unknown,
//     remove = false,
//   ) {
//     const customerId = String(customerIdValue ?? '');
//     const routeId = String(routeIdValue ?? '');
//     if (!customerId || (!routeId && !remove)) return;

//     const mappings = this.connection.collection('route_customer_mappings');
//     const current = await mappings.findOne(
//       {
//         customerId,
//         status: 'ACTIVE',
//         isDeleted: { $ne: true },
//       },
//       { sort: { effectiveFrom: -1 } },
//     );

//     if (!remove && current?.routeId === routeId) return;

//     const now = new Date();
//     if (current) {
//       await mappings.updateMany(
//         {
//           customerId,
//           status: 'ACTIVE',
//           isDeleted: { $ne: true },
//         },
//         {
//           $set: {
//             status: 'INACTIVE',
//             effectiveTo: now,
//             updatedAt: now,
//           },
//         },
//       );
//     }

//     if (!remove) {
//       const lastMapping = await mappings.findOne(
//         { routeId, status: 'ACTIVE', isDeleted: { $ne: true } },
//         { sort: { sequence: -1 }, projection: { sequence: 1 } },
//       );

//       await mappings.insertOne({
//         mappingId: IdGenerator.generate('ROUT', 8),
//         routeId,
//         customerId,
//         sequence: Number(lastMapping?.sequence ?? 0) + 1,
//         status: 'ACTIVE',
//         effectiveFrom: now,
//         effectiveTo: null,
//         isDeleted: false,
//         createdAt: now,
//         updatedAt: now,
//       });
//     }

//     // Important for strict incremental offline sync:
//     // route/customer membership can change without the route or customer body
//     // changing, so touch updatedAt on the affected documents. Otherwise the
//     // next offline download using updatedAt > lastSync will not receive them.
//     await this.connection
//       .collection('customer_master')
//       .updateOne({ customerId }, { $set: { updatedAt: now } });

//     const affectedRouteIds = new Set(
//       [String(current?.routeId ?? ''), routeId].filter(Boolean),
//     );
//     for (const affectedRouteId of affectedRouteIds) {
//       const outletCount = await mappings.countDocuments({
//         routeId: affectedRouteId,
//         status: 'ACTIVE',
//         isDeleted: { $ne: true },
//       });
//       await this.connection
//         .collection('route_master')
//         .updateOne(
//           { routeId: affectedRouteId },
//           { $set: { outletCount, updatedAt: now } },
//         );
//     }
//   }

//   private async getScope(
//     ownerId: string,
//     requestedVanId?: string,
//   ): Promise<SyncScope> {
//     const vans = this.connection.collection('vans');
//     let van = requestedVanId
//       ? await vans.findOne({
//           vanId: requestedVanId,
//           associatedUsers: ownerId,
//           isDeleted: { $ne: true },
//         })
//       : null;

//     // The token may contain the van that was assigned when the user logged in.
//     // Fall back to the latest current assignment when that token value is stale.
//     van ??= await vans.findOne(
//       { associatedUsers: ownerId, isDeleted: { $ne: true } },
//       { sort: { updatedAt: -1 } },
//     );

//     const vanId = String(van?.vanId ?? '') || undefined;
//     const associatedRoutes: Array<{
//       routeId?: unknown;
//       day?: string;
//       fromDate?: unknown;
//       toDate?: unknown;
//     }> = Array.isArray(van?.associatedRoutes) ? van.associatedRoutes : [];
//     const routeIds = Array.from(
//       new Set(
//         associatedRoutes
//           .map((route) => String(route?.routeId ?? ''))
//           .filter(Boolean),
//       ),
//     );
//     const now = Date.now();
//     const routeAssignments = Object.fromEntries(
//       associatedRoutes
//         .filter((route) => route.routeId)
//         .map((route) => {
//           const fromTime = route.fromDate
//             ? new Date(String(route.fromDate)).getTime()
//             : 0;
//           const toTime = route.toDate
//             ? new Date(String(route.toDate)).getTime()
//             : Number.POSITIVE_INFINITY;
//           return [
//             String(route.routeId),
//             {
//               day: route.day,
//               fromDate: route.fromDate,
//               toDate: route.toDate,
//               isActive: fromTime <= now && toTime >= now,
//             },
//           ];
//         }),
//     );
//     const mappings = routeIds.length
//       ? await this.connection
//           .collection('route_customer_mappings')
//           .find({ routeId: { $in: routeIds }, status: { $ne: 'INACTIVE' } })
//           .project({ customerId: 1, routeId: 1 })
//           .toArray()
//       : [];
//     const customerIds = Array.from(
//       new Set(
//         mappings
//           .map((mapping) => String(mapping.customerId ?? ''))
//           .filter(Boolean),
//       ),
//     );
//     const customerRouteIds = mappings.reduce<Record<string, string[]>>(
//       (result, mapping) => {
//         const customerId = String(mapping.customerId ?? '');
//         const routeId = String(mapping.routeId ?? '');
//         if (!customerId || !routeId) return result;
//         result[customerId] ??= [];
//         if (!result[customerId].includes(routeId))
//           result[customerId].push(routeId);
//         return result;
//       },
//       {},
//     );
//     const threeMonthsAgo = new Date();
//     threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
//     threeMonthsAgo.setHours(0, 0, 0, 0);
//     const sales = await this.connection
//       .collection('sales')
//       .find({
//         $or: [{ employeeId: ownerId }, { 'employees.employeeId': ownerId }],
//         date: { $gte: threeMonthsAgo },
//       })
//       .project({ saleId: 1 })
//       .toArray();
//     const saleIds = sales
//       .map((sale) => String(sale.saleId ?? ''))
//       .filter(Boolean);

//     return {
//       vanId,
//       routeIds,
//       routeAssignments,
//       customerIds,
//       customerRouteIds,
//       saleIds,
//     };
//   }

//   private ownershipFilter(entity: string, ownerId: string, scope: SyncScope) {
//     if (GLOBAL_MASTER_ENTITIES.has(entity)) return {};

//     switch (entity) {
//       case 'customers':
//       case 'outlets':
//         return { customerId: { $in: scope.customerIds } };
//       case 'routes':
//         return { routeId: { $in: scope.routeIds } };
//       case 'vans':
//         return scope.vanId
//           ? { vanId: scope.vanId, associatedUsers: ownerId }
//           : { _id: { $in: [] } };
//       case 'routeSessions':
//       case 'leaves':
//         return {
//           userId: ownerId,
//           ...this.lastThreeMonthsFilter(
//             entity === 'routeSessions' ? 'sessionDate' : 'createdAt',
//           ),
//         };
//       case 'activities':
//         return {
//           userId: ownerId,
//           ...this.lastThreeMonthsFilter('startTime'),
//         };
//       case 'nonSales':
//         return { employeeId: ownerId };
//       case 'salesmen':
//         return { employeeId: ownerId };
//       case 'stock':
//         return scope.vanId ? { vanId: scope.vanId } : { _id: { $in: [] } };
//       case 'orders':
//         return {
//           $or: [{ employeeId: ownerId }, { 'employees.employeeId': ownerId }],
//           ...this.lastThreeMonthsFilter('date'),
//         };
//       case 'orderItems':
//         return { saleId: { $in: scope.saleIds } };
//       case 'collections':
//         return {
//           employeeId: ownerId,
//           ...this.lastThreeMonthsFilter('date'),
//         };
//       case 'inventoryTransactions':
//         return {
//           employeeId: ownerId,
//           ...this.lastThreeMonthsFilter('transactionDate'),
//         };
//       case 'attendance':
//         return {
//           userId: ownerId,
//           ...this.lastThreeMonthsFilter('dayStartTime'),
//         };
//       case 'visits':
//         return {
//           employeeId: ownerId,
//           ...this.lastThreeMonthsFilter('checkInTime'),
//         };
//       case 'targets': {
//         const { start, end } = this.lastThreeMonthsRange();
//         return {
//           userId: ownerId,
//           startDate: { $lte: end },
//           endDate: { $gte: start },
//         };
//       }
//       case 'vanDailyStock':
//         return {
//           employeeId: ownerId,
//           ...this.lastThreeMonthsFilter('date'),
//         };
//       case 'vanErpClosing':
//         return scope.vanId
//           ? {
//               vanId: scope.vanId,
//               ...this.lastThreeMonthsFilter('date'),
//             }
//           : { _id: { $in: [] } };
//       default:
//         return {
//           $or: [
//             { employeeId: ownerId },
//             { userId: ownerId },
//             { createdBy: ownerId },
//             { salesmanId: ownerId },
//           ],
//         };
//     }
//   }

//   private lastThreeMonthsRange() {
//     const end = new Date();
//     end.setHours(23, 59, 59, 999);
//     const start = new Date(end);
//     start.setMonth(start.getMonth() - 3);
//     start.setHours(0, 0, 0, 0);
//     return { start, end };
//   }

//   private lastThreeMonthsFilter(field: string) {
//     const { start, end } = this.lastThreeMonthsRange();
//     return {
//       $expr: {
//         $and: [
//           {
//             $gte: [
//               {
//                 $convert: {
//                   input: `$${field}`,
//                   to: 'date',
//                   onError: '$createdAt',
//                   onNull: '$createdAt',
//                 },
//               },
//               start,
//             ],
//           },
//           {
//             $lte: [
//               {
//                 $convert: {
//                   input: `$${field}`,
//                   to: 'date',
//                   onError: '$createdAt',
//                   onNull: '$createdAt',
//                 },
//               },
//               end,
//             ],
//           },
//         ],
//       },
//     };
//   }

//   private uploadOwnershipFilter(entity: string, ownerId: string) {
//     if (
//       ['attendance', 'activities', 'routeSessions', 'leaves'].includes(entity)
//     ) {
//       return { userId: ownerId };
//     }
//     if (
//       ['visits', 'nonSales', 'collections', 'inventoryTransactions'].includes(
//         entity,
//       )
//     ) {
//       return { employeeId: ownerId };
//     }
//     if (entity === 'orders') {
//       return {
//         $or: [{ employeeId: ownerId }, { 'employees.employeeId': ownerId }],
//       };
//     }
//     return {
//       $or: [
//         { userId: ownerId },
//         { employeeId: ownerId },
//         { createdBy: ownerId },
//         { salesmanId: ownerId },
//       ],
//     };
//   }


//   private resolveConflict(
//     existing: Record<string, unknown>,
//     payload: Record<string, unknown>,
//     operation: SyncOperationDto,
//   ) {
//     const serverVersion = Number(existing.version ?? 1);
//     const clientVersion = Number(operation.payload.version ?? 0);
//     const isConflict = clientVersion > 0 && serverVersion > clientVersion;

//     if (!isConflict) {
//       return {
//         hasConflict: false,
//         resolvedPayload: payload,
//         version: serverVersion + 1,
//         conflictResolved: false,
//       };
//     }

//     if (operation.operation === 'DELETE') {
//       return {
//         hasConflict: true,
//         resolvedPayload: null,
//         version: serverVersion,
//         conflictResolved: false,
//         error: 'VERSION_CONFLICT',
//       };
//     }

//     return {
//       hasConflict: false,
//       resolvedPayload: {
//         ...payload,
//         uuid: existing.uuid ?? operation.localId,
//         version: serverVersion + 1,
//         isDeleted: false,
//         deletedAt: null,
//         lastSyncSource: 'OFFLINE',
//         lastSyncedAt: new Date(),
//         updatedAt: new Date(),
//       },
//       version: serverVersion + 1,
//       conflictResolved: true,
//     };
//   }

//   async upload(operations: SyncOperationDto[], ownerId: string) {
//     const results = [] as Record<string, unknown>[];
//     for (const operation of operations) {
//       try {
//         const collectionName =
//           COLLECTIONS[operation.entity as keyof typeof COLLECTIONS];
//         if (!collectionName)
//           throw new Error(`Unsupported sync entity: ${operation.entity}`);
//         if (MASTER_ENTITIES.has(operation.entity))
//           throw new Error('Master data is read-only');
//         const collection = this.connection.collection(collectionName);
//         const payload = normalizeOfflinePayload(
//           operation.entity as keyof typeof COLLECTIONS,
//           cleanPayload(operation.payload),
//         );
//         const legacyLocationField = ['background', 'Locations'].join('');
//         const offlineLocations =
//           operation.entity === 'attendance' &&
//           Array.isArray(payload[legacyLocationField])
//             ? (payload[legacyLocationField] as Record<string, unknown>[])
//             : [];
//         // High-frequency points belong exclusively to live_location_tracking.
//         delete payload[legacyLocationField];
//         const idField =
//           ENTITY_ID_FIELDS[operation.entity as keyof typeof COLLECTIONS];
//         if (idField && !payload[idField]) payload[idField] = operation.localId;
//         const isCustomerOperation = ['customers', 'outlets'].includes(
//           operation.entity,
//         );
//         if (isCustomerOperation) {
//           payload.customerId = String(payload.customerId ?? operation.localId);
//           payload.createdByEmployeeId ??= ownerId;
//         }
//         if (
//           ['attendance', 'activities', 'routeSessions', 'leaves'].includes(
//             operation.entity,
//           )
//         ) {
//           payload.userId = ownerId;
//         }
//         if (
//           [
//             'visits',
//             'nonSales',
//             'collections',
//             'inventoryTransactions',
//           ].includes(operation.entity) &&
//           !payload.employeeId
//         ) {
//           payload.employeeId = ownerId;
//         }
//         if (operation.entity === 'orders') {
//           // Dashboard queries use the canonical top-level employeeId, while
//           // older sales records use the employees array. Persist both so an
//           // offline-created order is visible through either API path.
//           payload.employeeId = ownerId;
//           const employees = Array.isArray(payload.employees)
//             ? payload.employees
//             : [];
//           if (
//             !employees.some(
//               (employee) =>
//                 String(
//                   (employee as Record<string, unknown>)?.employeeId ?? '',
//                 ) === ownerId,
//             )
//           ) {
//             employees.push({ employeeId: ownerId });
//           }
//           payload.employees = employees;
//         }
//         const businessId = idField
//           ? (payload[idField] ?? operation.localId)
//           : operation.localId;
//         const persistOfflineLocations = async () => {
//           if (!offlineLocations.length) return;
//           const now = new Date();
//           await this.connection.collection('live_location_tracking').insertMany(
//             offlineLocations.map((location) => ({
//               locationId: IdGenerator.generate('LOC', 10),
//               userId: ownerId,
//               workSessionId: String(businessId),
//               vanId: payload.vanId,
//               source: 'OFFLINE',
//               ...location,
//               capturedAt: location.capturedAt
//                 ? new Date(String(location.capturedAt))
//                 : now,
//               isDeleted: false,
//               createdAt: now,
//               updatedAt: now,
//             })),
//           );
//         };
//         const serverId = String(operation.payload.serverId ?? '');
//         const serverObjectId = Types.ObjectId.isValid(serverId)
//           ? new Types.ObjectId(serverId)
//           : null;
//         const existing = await collection.findOne({
//           $or: [
//             ...(serverObjectId
//               ? [
//                   {
//                     _id: serverObjectId,
//                     ...this.uploadOwnershipFilter(operation.entity, ownerId),
//                   },
//                 ]
//               : []),
//             {
//               $and: [
//                 { uuid: operation.localId },
//                 this.uploadOwnershipFilter(operation.entity, ownerId),
//               ],
//             },
//             ...(operation.entity === 'attendance'
//               ? [{ workSessionId: businessId, userId: ownerId }]
//               : []),
//             ...(operation.entity === 'activities'
//               ? [{ activityId: businessId, userId: ownerId }]
//               : []),
//             ...(operation.entity === 'routeSessions'
//               ? [{ routeSessionId: businessId, userId: ownerId }]
//               : []),
//           ],
//         });
//         const clientVersion = Number(operation.payload.version ?? 0);

//         if (operation.operation === 'CREATE') {
//           if (existing) {
//             const wasCreatedByOfflineSync =
//               existing.createdOffline === true ||
//               existing.uuid === operation.localId;
//             const shouldMergeOfflineChanges =
//               operation.entity === 'attendance' || wasCreatedByOfflineSync;
//             const existingRecordChanges = shouldMergeOfflineChanges
//               ? payload
//               : {};
//             const existingVersion = Number(existing.version ?? 1);
//             const nextVersion = shouldMergeOfflineChanges
//               ? existingVersion + 1
//               : existingVersion;

//             await collection.updateOne(
//               { _id: existing._id },
//               {
//                 $set: {
//                   ...existingRecordChanges,
//                   ...(operation.entity === 'attendance'
//                     ? { userId: ownerId }
//                     : {}),
//                   uuid: existing.uuid ?? operation.localId,
//                   isDeleted: false,
//                   deletedAt: null,
//                   ...(wasCreatedByOfflineSync
//                     ? {
//                         createdOffline: true,
//                         syncSource: 'OFFLINE',
//                       }
//                     : {}),
//                   lastSyncSource: 'OFFLINE',
//                   lastSyncedAt: new Date(),
//                   updatedAt: new Date(),
//                   version: nextVersion,
//                 },
//                 $unset: { ownerId: '' },
//               },
//             );
//             if (operation.entity === 'inventoryTransactions')
//               await this.applyOfflineInventoryTransaction(payload);
//             await persistOfflineLocations();
//             if (isCustomerOperation) {
//               await this.syncCustomerRouteMapping(
//                 existing.customerId ?? businessId,
//                 payload.routeId,
//               );
//             }
//             results.push({
//               queueId: operation.queueId,
//               localId: operation.localId,
//               success: true,
//               serverId: String(existing._id),
//               version: nextVersion,
//             });
//             continue;
//           }
//           const now = new Date();
//           if (operation.entity === 'routeSessions') {
//             await collection.updateMany(
//               { userId: ownerId, status: 'ACTIVE' },
//               {
//                 $set: {
//                   status: 'COMPLETED',
//                   isActive: false,
//                   endTime: now,
//                   updatedAt: now,
//                 },
//               },
//             );
//           }
//           const inserted = await collection.insertOne({
//             ...payload,
//             uuid: operation.localId,
//             version: 1,
//             isDeleted: false,
//             createdOffline: true,
//             syncSource: 'OFFLINE',
//             syncedAt: now,
//             lastSyncSource: 'OFFLINE',
//             lastSyncedAt: now,
//             createdAt: now,
//             updatedAt: now,
//             deletedAt: null,
//           });
//           if (operation.entity === 'inventoryTransactions')
//             await this.applyOfflineInventoryTransaction(payload);
//           await persistOfflineLocations();

//           if (isCustomerOperation) {
//             await this.syncCustomerRouteMapping(
//               payload.customerId,
//               payload.routeId,
//             );
//             await this.notifyManagerOfOfflineOutlet(payload, ownerId);
//           }

//           // Older app versions queued only the work-session record for an
//           // offline Day Start. Recreate the activity/route side effects that
//           // the normal WorkSession endpoint performs, unless this upload batch
//           // already contains their dedicated local operations.
//           if (operation.entity === 'attendance') {
//             const workSessionId = String(
//               payload.workSessionId ?? operation.localId,
//             );
//             const hasActivityOperation = operations.some(
//               (item) =>
//                 item.entity === 'activities' &&
//                 String(item.payload?.workSessionId ?? '') === workSessionId,
//             );
//             const hasRouteOperation = operations.some(
//               (item) =>
//                 item.entity === 'routeSessions' &&
//                 String(item.payload?.workSessionId ?? '') === workSessionId,
//             );

//             if (payload.activityName && !hasActivityOperation) {
//               await this.connection.collection('activities').insertOne({
//                 activityId: IdGenerator.generate('ACTI', 8),
//                 userId: ownerId,
//                 userName: payload.userName,
//                 vanId: payload.vanId,
//                 vanName: payload.vanName,
//                 name: payload.activityName,
//                 description: payload.description ?? '',
//                 workSessionId,
//                 startTime: payload.startTime ?? payload.dayStartTime ?? now,
//                 status: 'ACTIVE',
//                 createdOffline: true,
//                 syncSource: 'OFFLINE',
//                 syncedAt: now,
//                 lastSyncSource: 'OFFLINE',
//                 lastSyncedAt: now,
//                 createdAt: now,
//                 updatedAt: now,
//                 isDeleted: false,
//               });
//             }

//             if (payload.routeId && !hasRouteOperation) {
//               await this.connection.collection('route_sessions').insertOne({
//                 routeSessionId: IdGenerator.generate('ROUT', 8),
//                 workSessionId,
//                 userId: ownerId,
//                 userName: payload.userName,
//                 vanId: payload.vanId,
//                 vanName: payload.vanName,
//                 routeId: payload.routeId,
//                 routeName: payload.routeName,
//                 customerCategoryId: payload.customerCategoryId,
//                 totalShops: Number(payload.totalShops ?? 0),
//                 visitedShops: 0,
//                 status: 'ACTIVE',
//                 isActive: true,
//                 createdOffline: true,
//                 syncSource: 'OFFLINE',
//                 syncedAt: now,
//                 lastSyncSource: 'OFFLINE',
//                 lastSyncedAt: now,
//                 startTime: payload.startTime ?? payload.dayStartTime ?? now,
//                 sessionDate: now,
//                 createdAt: now,
//                 updatedAt: now,
//                 isDeleted: false,
//               });
//             }
//           }
//           results.push({
//             queueId: operation.queueId,
//             localId: operation.localId,
//             success: true,
//             serverId: String(inserted.insertedId),
//             version: 1,
//           });
//           continue;
//         }

//         if (
//           !existing &&
//           ['attendance', 'activities'].includes(operation.entity)
//         ) {
//           // A locally cached session/activity can be changed before it has a
//           // stable server mapping. Recover the orphaned UPDATE as an insert so
//           // activity CREATE and UPDATE queues cannot remain permanently stuck.
//           const now = new Date();
//           const inserted = await collection.insertOne({
//             ...payload,
//             ...(idField ? { [idField]: businessId } : {}),
//             userId: ownerId,
//             uuid: operation.localId,
//             version: 1,
//             isDeleted: false,
//             createdOffline: true,
//             syncSource: 'OFFLINE',
//             syncedAt: now,
//             lastSyncSource: 'OFFLINE',
//             lastSyncedAt: now,
//             createdAt: now,
//             updatedAt: now,
//             deletedAt: null,
//           });
//           await persistOfflineLocations();
//           results.push({
//             queueId: operation.queueId,
//             localId: operation.localId,
//             success: true,
//             serverId: String(inserted.insertedId),
//             version: 1,
//           });
//           continue;
//         }

//         if (!existing) throw new Error('Server record not found');

//         const conflictResult = this.resolveConflict(existing, payload, operation);

//         if (conflictResult.hasConflict) {
//           results.push({
//             queueId: operation.queueId,
//             localId: operation.localId,
//             success: false,
//             conflict: true,
//             error: conflictResult.error || 'VERSION_CONFLICT',
//             serverId: String(existing._id),
//             version: Number(existing.version ?? 1),
//           });
//           continue;
//         }

//         const version = conflictResult.version;
//         const changes =
//           operation.operation === 'DELETE'
//             ? {
//                 isDeleted: true,
//                 deletedAt: new Date(),
//                 lastSyncSource: 'OFFLINE',
//                 lastSyncedAt: new Date(),
//                 updatedAt: new Date(),
//                 version,
//               }
//             : {
//                 ...(conflictResult.resolvedPayload || payload),
//                 isDeleted: false,
//                 deletedAt: null,
//                 lastSyncSource: 'OFFLINE',
//                 lastSyncedAt: new Date(),
//                 updatedAt: new Date(),
//                 version,
//               };
//         await collection.updateOne(
//           { _id: existing._id },
//           { $set: changes, $unset: { ownerId: '' } },
//         );
//         if (operation.operation !== 'DELETE') await persistOfflineLocations();
//         if (isCustomerOperation) {
//           await this.syncCustomerRouteMapping(
//             existing.customerId ?? businessId,
//             payload.routeId,
//             operation.operation === 'DELETE',
//           );
//         }
//         results.push({
//           queueId: operation.queueId,
//           localId: operation.localId,
//           success: true,
//           serverId: String(existing._id),
//           version,
//           conflictResolved: conflictResult.conflictResolved,
//         });
//       } catch (error) {
//         results.push({
//           queueId: operation.queueId,
//           localId: operation.localId,
//           success: false,
//           error:
//             error instanceof Error ? error.message : 'Sync operation failed',
//         });
//       }
//     }
//     return { results };
//   }

//   private async repairDownloadMetadata(
//     entity: string,
//     collection: ReturnType<Connection['collection']>,
//     ownership: Record<string, unknown>,
//   ) {
//     /**
//      * Important:
//      * Do not bump updatedAt during download repairs.
//      * If updatedAt is touched here, the same records look new and keep
//      * downloading even when no business document changed.
//      */
//     if (!GLOBAL_MASTER_ENTITIES.has(entity)) {
//       await collection.updateMany(
//         { ...ownership, ownerId: { $exists: true } },
//         { $unset: { ownerId: '' } },
//       );
//     }

//     await collection.updateMany(
//       { ...ownership, isDeleted: { $exists: false } },
//       [
//         {
//           $set: {
//             isDeleted: false,
//             updatedAt: {
//               $ifNull: ['$updatedAt', { $ifNull: ['$createdAt', new Date(0)] }],
//             },
//           },
//         },
//       ],
//     );

//     await collection.updateMany(
//       { ...ownership, updatedAt: { $exists: false } },
//       [
//         {
//           $set: {
//             updatedAt: { $ifNull: ['$createdAt', new Date(0)] },
//           },
//         },
//       ],
//     );
//   }

//   async download(
//     ownerId: string,
//     lastSync?: string,
//     cursor?: string,
//     vanId?: string,
//   ) {
//     const since = lastSync ? new Date(lastSync) : new Date(0);
//     const entries = Object.entries(COLLECTIONS);
//     const scope = await this.getScope(ownerId, vanId);
//     const [rawIndex, rawOffset] = (cursor ?? '0:0').split(':');
//     let entityIndex = Math.max(0, Number(rawIndex));
//     let offset = Math.max(0, Number(rawOffset));
//     const pageSize = 500;

//     while (entityIndex < entries.length) {
//       const [entity, collectionName] = entries[entityIndex];
//       const ownership = this.ownershipFilter(entity, ownerId, scope);
//       const collection = this.connection.collection(collectionName);

//       await this.repairDownloadMetadata(entity, collection, ownership);

//       // Strict incremental sync:
//       // After the first full download, every entity must be returned only when
//       // its updatedAt is newer than the client's last successful sync time.
//       // If route/customer/assignment membership changes, the write operation
//       // that changes the mapping must also touch updatedAt on the affected
//       // route/customer documents.
//       const changed = lastSync ? { updatedAt: { $gt: since } } : {};

//       const documents =
//         entity === 'priceLists'
//           ? await collection
//               .aggregate([
//                 { $match: ownership },
//                 {
//                   $addFields: {
//                     _effectiveDateForSort: {
//                       $convert: {
//                         input: '$effectiveDate',
//                         to: 'date',
//                         onError: new Date(0),
//                         onNull: new Date(0),
//                       },
//                     },
//                     _updatedAtForSort: {
//                       $convert: {
//                         input: '$updatedAt',
//                         to: 'date',
//                         onError: new Date(0),
//                         onNull: new Date(0),
//                       },
//                     },
//                   },
//                 },
//                 {
//                   $sort: {
//                     productId: 1,
//                     categoryId: 1,
//                     customerCategoryId: 1,
//                     categoryCode: 1,
//                     _effectiveDateForSort: -1,
//                     _updatedAtForSort: -1,
//                     _id: -1,
//                   },
//                 },
//                 {
//                   $group: {
//                     _id: {
//                       productId: '$productId',
//                       categoryId: '$categoryId',
//                       customerCategoryId: '$customerCategoryId',
//                       categoryCode: '$categoryCode',
//                     },
//                     document: { $first: '$$ROOT' },
//                   },
//                 },
//                 { $replaceRoot: { newRoot: '$document' } },
//                 ...(lastSync ? [{ $match: { updatedAt: { $gt: since } } }] : []),
//                 { $sort: { updatedAt: 1, _id: 1 } },
//                 { $skip: offset },
//                 { $limit: pageSize + 1 },
//                 { $project: { _effectiveDateForSort: 0, _updatedAtForSort: 0 } },
//               ])
//               .toArray()
//           : await collection
//               .find({ ...ownership, ...changed })
//               .sort({ updatedAt: 1, _id: 1 })
//               .skip(offset)
//               .limit(pageSize + 1)
//               .toArray();
//       const hasMoreInEntity = documents.length > pageSize;
//       const records = documents.slice(0, pageSize).map((document) => {
//         const {
//           _id,
//           uuid,
//           ownerId: _ownerId,
//           version,
//           updatedAt,
//           deletedAt,
//           isDeleted,
//           ...payload
//         } = document;
//         const idField = ENTITY_ID_FIELDS[entity as keyof typeof COLLECTIONS];
//         const businessId = document[idField];
//         const assignment =
//           entity === 'routes'
//             ? scope.routeAssignments[String(businessId ?? '')]
//             : undefined;
//         const routeIds =
//           entity === 'customers' || entity === 'outlets'
//             ? scope.customerRouteIds[String(businessId ?? '')]
//             : undefined;
//         const effectiveDeletedAt =
//           deletedAt ?? (isDeleted ? (updatedAt ?? new Date()) : null);
//         return {
//           entity,
//           uuid: String(uuid ?? businessId ?? _id),
//           id: String(_id),
//           version: version ?? 1,
//           updatedAt: updatedAt?.toISOString?.() ?? new Date().toISOString(),
//           deletedAt:
//             effectiveDeletedAt?.toISOString?.() ?? effectiveDeletedAt ?? null,
//           payload: {
//             ...payload,
//             [idField]: businessId,
//             isDeleted: Boolean(isDeleted),
//             ...(assignment ? { assignment } : {}),
//             ...(routeIds ? { routeIds } : {}),
//           },
//         };
//       });

//       if (records.length || hasMoreInEntity) {
//         const nextCursor = hasMoreInEntity
//           ? `${entityIndex}:${offset + pageSize}`
//           : entityIndex + 1 < entries.length
//             ? `${entityIndex + 1}:0`
//             : undefined;
//         return {
//           records,
//           hasMore: Boolean(nextCursor),
//           cursor: nextCursor,
//           serverTime: new Date().toISOString(),
//         };
//       }
//       entityIndex += 1;
//       offset = 0;
//     }
//     return {
//       records: [],
//       hasMore: false,
//       cursor: undefined,
//       serverTime: new Date().toISOString(),
//     };
//   }
// }



import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';

import { SyncOperationDto } from './dto/sync.dto';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { NotificationService } from '../notification/notification.service';

const COLLECTIONS = {
  customers: 'customer_master',
  outlets: 'customer_master',
  products: 'product_master',
  categories: 'productcategories',
  customerCategories: 'customer_category_master',
  channels: 'channel_master',
  outletTypes: 'outlet_type_master',
  segmentations: 'segmentation_master',
  priceLists: 'price_master',
  vans: 'vans',
  routes: 'route_master',
  routeSessions: 'route_sessions',
  salesmen: 'employees',
  stock: 'inventories',
  promotions: 'promotions',
  orders: 'sales',
  orderItems: 'sale_items',
  collections: 'payments',
  attendance: 'work_sessions',
  activities: 'activities',
  visits: 'shop_visits',
  interactions: 'interaction_logs',
  nonSales: 'non_sale',
  leaves: 'leaves',
  surveys: 'surveys',
  expenses: 'expenses',
  returns: 'returns',
  complaints: 'complaints',
  targets: 'targets',
  vanDailyStock: 'van_daily_stock',
  vanErpClosing: 'van_erp_closing',
  inventoryTransactions: 'inventory_transactions',
} as const;

const ENTITY_ID_FIELDS: Record<keyof typeof COLLECTIONS, string> = {
  customers: 'customerId',
  outlets: 'customerId',
  products: 'productId',
  categories: 'categoryId',
  customerCategories: 'customerCategoryId',
  channels: 'channelId',
  outletTypes: 'outletTypeId',
  segmentations: 'segmentationId',
  priceLists: 'priceId',
  vans: 'vanId',
  routes: 'routeId',
  routeSessions: 'routeSessionId',
  salesmen: 'employeeId',
  stock: 'inventoryId',
  promotions: 'promotionId',
  orders: 'saleId',
  orderItems: 'saleItemId',
  collections: 'paymentId',
  attendance: 'workSessionId',
  activities: 'activityId',
  visits: 'visitId',
  interactions: 'interactionId',
  nonSales: 'nonSaleId',
  leaves: 'leaveId',
  surveys: 'surveyId',
  expenses: 'expenseId',
  returns: 'returnId',
  complaints: 'complaintId',
  targets: '_id',
  vanDailyStock: 'vanDailyStockId',
  vanErpClosing: 'stockId',
  inventoryTransactions: 'transactionId',
};

const MASTER_ENTITIES = new Set([
  'products',
  'categories',
  'customerCategories',
  'channels',
  'outletTypes',
  'segmentations',
  'priceLists',
  'vans',
  'routes',
  'salesmen',
  'stock',
  'promotions',
  'targets',
  'vanErpClosing',
]);

const WRITABLE_ENTITIES = new Set([
  'customers',
  'outlets',
  'orders',
  'orderItems',
  'collections',
  'attendance',
  'activities',
  'visits',
  'interactions',
  'nonSales',
  'leaves',
  'surveys',
  'expenses',
  'returns',
  'complaints',
  'vanDailyStock',
  'inventoryTransactions',
]);
const GLOBAL_MASTER_ENTITIES = new Set([
  'products',
  'categories',
  'customerCategories',
  'channels',
  'outletTypes',
  'segmentations',
  'priceLists',
  'promotions',
]);

const ENTITY_DATE_FIELDS: Partial<Record<keyof typeof COLLECTIONS, string[]>> =
  {
    orders: ['date'],
    collections: ['date'],
    attendance: ['dayStartTime', 'dayEndTime'],
    activities: ['startTime', 'endTime'],
    visits: ['checkInTime', 'checkOutTime'],
    routeSessions: ['sessionDate', 'startTime', 'endTime'],
    targets: ['startDate', 'endDate'],
    vanDailyStock: ['date'],
    vanErpClosing: ['date', 'closeDate', 'modifiedDate', 'createdDate'],
    inventoryTransactions: ['transactionDate'],
  };
type SyncScope = {
  vanId?: string;
  routeIds: string[];
  routeAssignments: Record<
    string,
    { day?: string; fromDate?: unknown; toDate?: unknown; isActive: boolean }
  >;
  customerIds: string[];
  customerRouteIds: Record<string, string[]>;
  saleIds: string[];
};

const cleanPayload = (payload: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(payload).filter(
      ([key]) =>
        ![
          '_id',
          'uuid',
          'version',
          'ownerId',
          'createdAt',
          'updatedAt',
          'deletedAt',
          'syncStatus',
          'serverId',
        ].includes(key) &&
        !key.startsWith('$') &&
        !key.includes('.'),
    ),
  );

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toFixed4 = (value: number) => Number((value || 0).toFixed(4));

const calculateOfflineSaleItem = (value: unknown) => {
  const item = { ...((value ?? {}) as Record<string, unknown>) };
  const caseQty = toFiniteNumber(item.caseQty);
  const pieceQty = toFiniteNumber(item.pieceQty);
  const unitQtyInCase = Math.max(toFiniteNumber(item.unitQtyInCase, 1), 1);
  const casePrice = toFiniteNumber(item.casePrice);
  const piecePrice = toFiniteNumber(item.piecePrice, casePrice / unitQtyInCase);
  const pieceNetWeight = toFiniteNumber(item.pieceNetWeight);
  const quantity = caseQty * unitQtyInCase + pieceQty;

  return {
    ...item,
    caseQty,
    pieceQty,
    unitQtyInCase,
    casePrice: toFixed4(casePrice),
    piecePrice: toFixed4(piecePrice),
    quantity,
    netCases: toFixed4(quantity / unitQtyInCase),
    totalNetWeight: toFixed4(quantity * pieceNetWeight),
    totalValue: toFixed4(caseQty * casePrice + pieceQty * piecePrice),
  };
};

const normalizeOfflinePayload = (
  entity: keyof typeof COLLECTIONS,
  payload: Record<string, unknown>,
) => {
  for (const field of ENTITY_DATE_FIELDS[entity] ?? []) {
    const value = payload[field];
    if (value === undefined || value === null || value instanceof Date)
      continue;

    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.getTime())) payload[field] = parsed;
  }

  if (entity === 'orderItems') {
    Object.assign(payload, calculateOfflineSaleItem(payload));
  }

  if (entity === 'orders') {
    payload.status ??= 'COMPLETED';
    const items = Array.isArray(payload.items)
      ? payload.items.map(calculateOfflineSaleItem)
      : [];

    if (items.length) {
      payload.totalCases = items.reduce(
        (sum, item) => sum + toFiniteNumber(item.caseQty),
        0,
      );
      payload.totalPieces = items.reduce(
        (sum, item) => sum + toFiniteNumber(item.pieceQty),
        0,
      );
      payload.totalQty = items.reduce(
        (sum, item) => sum + toFiniteNumber(item.quantity),
        0,
      );
      payload.totalWeight = toFixed4(
        items.reduce(
          (sum, item) => sum + toFiniteNumber(item.totalNetWeight),
          0,
        ),
      );
      payload.totalValue = toFixed4(
        items.reduce((sum, item) => sum + toFiniteNumber(item.totalValue), 0),
      );
      payload.netCases = toFixed4(
        items.reduce((sum, item) => sum + toFiniteNumber(item.netCases), 0),
      );
      const paidAmount = toFixed4(toFiniteNumber(payload.paidAmount));
      const pendingAmount = toFixed4(
        toFiniteNumber(payload.totalValue) - paidAmount,
      );
      payload.paidAmount = paidAmount;
      payload.pendingAmount = pendingAmount;
      payload.paymentStatus =
        pendingAmount <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'UNPAID';
    }

    // Line items belong in sale_items and are uploaded as orderItems.
    delete payload.items;
  }
  if (entity === 'collections') payload.status ??= 'SUCCESS';
  if (entity === 'visits') payload.status ??= 'COMPLETED';

  return payload;
};

@Injectable()
export class SyncService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Apply an offline SALE ledger entry to the server stock snapshots.
   *
   * The transaction id is stored on each affected stock document in the same
   * atomic update as the quantity change. This makes reconnect retries safe:
   * the same queued transaction can never reduce stock twice.
   */
  private async applyOfflineInventoryTransaction(
    payload: Record<string, unknown>,
  ) {
    if (payload.transactionType !== 'SALE' || payload.direction !== 'OUT')
      return;

    const transactionId = String(payload.transactionId ?? '');
    const productId = String(payload.productId ?? '');
    const vanId = String(payload.vanId ?? '');
    const workSessionId = String(payload.workSessionId ?? '');
    const quantity = toFiniteNumber(payload.quantity);

    if (!transactionId || !productId || !vanId || quantity <= 0) {
      throw new Error('Offline sale transaction has invalid stock details');
    }

    const inventories = this.connection.collection('inventories');
    const inventoryResult = await inventories.updateOne(
      {
        productId,
        vanId,
        status: 'ACTIVE',
        quantity: { $gte: quantity },
        appliedOfflineTransactionIds: { $ne: transactionId },
      },
      {
        $inc: { quantity: -quantity },
        $addToSet: { appliedOfflineTransactionIds: transactionId },
        $set: { updatedAt: new Date() },
      },
    );

    if (!inventoryResult.matchedCount) {
      const inventory = await inventories.findOne({
        productId,
        vanId,
        status: 'ACTIVE',
      });
      const alreadyApplied =
        Array.isArray(inventory?.appliedOfflineTransactionIds) &&
        inventory.appliedOfflineTransactionIds.includes(transactionId);
      if (!alreadyApplied) {
        if (!inventory)
          throw new Error(`Inventory not found for product: ${productId}`);
        throw new Error(
          `Insufficient stock for product ${productId}. Available: ${toFiniteNumber(inventory.quantity)}, Required: ${quantity}`,
        );
      }
    }

    const transactionDate = payload.transactionDate
      ? new Date(String(payload.transactionDate))
      : new Date();
    if (Number.isNaN(transactionDate.getTime()))
      throw new Error('Offline sale transaction has an invalid date');
    const dayStart = new Date(transactionDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(transactionDate);
    dayEnd.setHours(23, 59, 59, 999);

    const dailyStock = this.connection.collection('van_daily_stock');

    /**
     * Prefer workSessionId because VanDailyStock is unique by:
     * date + vanId + productId + workSessionId.
     *
     * Legacy offline transactions may not have workSessionId, so the fallback
     * still uses product + van + date.
     */
    const dailyStockFilter: Record<string, unknown> = {
      productId,
      vanId,
      date: { $gte: dayStart, $lte: dayEnd },
      appliedOfflineTransactionIds: { $ne: transactionId },
    };

    if (workSessionId) {
      dailyStockFilter.workSessionId = workSessionId;
    }

    const dailyResult = await dailyStock.updateOne(dailyStockFilter, {
      $inc: { outQty: quantity, closingQty: -quantity },
      $addToSet: { appliedOfflineTransactionIds: transactionId },
      $set: { updatedAt: new Date() },
    });

    if (!dailyResult.matchedCount) {
      const existingDailyStock = await dailyStock.findOne(
        workSessionId
          ? { productId, vanId, workSessionId, date: { $gte: dayStart, $lte: dayEnd } }
          : { productId, vanId, date: { $gte: dayStart, $lte: dayEnd } },
      );

      const alreadyApplied =
        Array.isArray(existingDailyStock?.appliedOfflineTransactionIds) &&
        existingDailyStock.appliedOfflineTransactionIds.includes(transactionId);

      if (!alreadyApplied) {
        throw new Error(
          workSessionId
            ? `Daily stock not initialized for product: ${productId}, workSession: ${workSessionId}`
            : `Daily stock not initialized for product: ${productId}`,
        );
      }
    }
  }

  async hasOfflineAccess(employeeId: string) {
    const employee = await this.connection
      .collection('employees')
      .findOne(
        { employeeId, isDeleted: { $ne: true } },
        { projection: { offlineAccessAllowed: 1, status: 1 } },
      );
    return (
      employee?.status === 'ACTIVE' && employee.offlineAccessAllowed === true
    );
  }

  private async notifyManagerOfOfflineOutlet(
    payload: Record<string, unknown>,
    ownerId: string,
  ) {
    const creator = await this.connection
      .collection('employees')
      .findOne({ employeeId: ownerId, isDeleted: { $ne: true } });
    const recipientId = String(creator?.reportingEmployeeId ?? '');
    const customerId = String(payload.customerId ?? '');
    if (!recipientId || !customerId) return;
    await this.notificationService.create({
      recipientId,
      title: 'New outlet awaiting approval',
      body: `${String(creator?.name ?? 'An executive')} created ${String(payload.name ?? 'a new outlet')}`,
      category: 'outlet_approval',
      data: {
        category: 'outlet_approval',
        action: 'APPROVAL_REQUIRED',
        status: 'PENDING',
        customerId,
        outletName: payload.name,
        ownerName: payload.ownerName,
        phoneNumber: payload.phoneNumber,
        address: payload.address,
        geoTag: payload.geoTag,
        createdByEmployeeId: ownerId,
        createdByName: creator?.name,
        route: '/notifications',
      },
    });
  }

  private async syncCustomerRouteMapping(
    customerIdValue: unknown,
    routeIdValue: unknown,
    remove = false,
  ) {
    const customerId = String(customerIdValue ?? '');
    const routeId = String(routeIdValue ?? '');
    if (!customerId || (!routeId && !remove)) return;

    const mappings = this.connection.collection('route_customer_mappings');
    const current = await mappings.findOne(
      {
        customerId,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      },
      { sort: { effectiveFrom: -1 } },
    );

    if (!remove && current?.routeId === routeId) return;

    const now = new Date();
    if (current) {
      await mappings.updateMany(
        {
          customerId,
          status: 'ACTIVE',
          isDeleted: { $ne: true },
        },
        {
          $set: {
            status: 'INACTIVE',
            effectiveTo: now,
            updatedAt: now,
          },
        },
      );
    }

    if (!remove) {
      const lastMapping = await mappings.findOne(
        { routeId, status: 'ACTIVE', isDeleted: { $ne: true } },
        { sort: { sequence: -1 }, projection: { sequence: 1 } },
      );

      await mappings.insertOne({
        mappingId: IdGenerator.generate('ROUT', 8),
        routeId,
        customerId,
        sequence: Number(lastMapping?.sequence ?? 0) + 1,
        status: 'ACTIVE',
        effectiveFrom: now,
        effectiveTo: null,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Important for strict incremental offline sync:
    // route/customer membership can change without the route or customer body
    // changing, so touch updatedAt on the affected documents. Otherwise the
    // next offline download using updatedAt > lastSync will not receive them.
    await this.connection
      .collection('customer_master')
      .updateOne({ customerId }, { $set: { updatedAt: now } });

    const affectedRouteIds = new Set(
      [String(current?.routeId ?? ''), routeId].filter(Boolean),
    );
    for (const affectedRouteId of affectedRouteIds) {
      const outletCount = await mappings.countDocuments({
        routeId: affectedRouteId,
        status: 'ACTIVE',
        isDeleted: { $ne: true },
      });
      await this.connection
        .collection('route_master')
        .updateOne(
          { routeId: affectedRouteId },
          { $set: { outletCount, updatedAt: now } },
        );
    }
  }

  private async getScope(
    ownerId: string,
    requestedVanId?: string,
  ): Promise<SyncScope> {
    const vans = this.connection.collection('vans');
    let van = requestedVanId
      ? await vans.findOne({
          vanId: requestedVanId,
          associatedUsers: ownerId,
          isDeleted: { $ne: true },
        })
      : null;

    // The token may contain the van that was assigned when the user logged in.
    // Fall back to the latest current assignment when that token value is stale.
    van ??= await vans.findOne(
      { associatedUsers: ownerId, isDeleted: { $ne: true } },
      { sort: { updatedAt: -1 } },
    );

    const vanId = String(van?.vanId ?? '') || undefined;
    const associatedRoutes: Array<{
      routeId?: unknown;
      day?: string;
      fromDate?: unknown;
      toDate?: unknown;
    }> = Array.isArray(van?.associatedRoutes) ? van.associatedRoutes : [];
    const routeIds = Array.from(
      new Set(
        associatedRoutes
          .map((route) => String(route?.routeId ?? ''))
          .filter(Boolean),
      ),
    );
    const now = Date.now();
    const routeAssignments = Object.fromEntries(
      associatedRoutes
        .filter((route) => route.routeId)
        .map((route) => {
          const fromTime = route.fromDate
            ? new Date(String(route.fromDate)).getTime()
            : 0;
          const toTime = route.toDate
            ? new Date(String(route.toDate)).getTime()
            : Number.POSITIVE_INFINITY;
          return [
            String(route.routeId),
            {
              day: route.day,
              fromDate: route.fromDate,
              toDate: route.toDate,
              isActive: fromTime <= now && toTime >= now,
            },
          ];
        }),
    );
    const mappings = routeIds.length
      ? await this.connection
          .collection('route_customer_mappings')
          .find({ routeId: { $in: routeIds }, status: { $ne: 'INACTIVE' } })
          .project({ customerId: 1, routeId: 1 })
          .toArray()
      : [];
    const customerIds = Array.from(
      new Set(
        mappings
          .map((mapping) => String(mapping.customerId ?? ''))
          .filter(Boolean),
      ),
    );
    const customerRouteIds = mappings.reduce<Record<string, string[]>>(
      (result, mapping) => {
        const customerId = String(mapping.customerId ?? '');
        const routeId = String(mapping.routeId ?? '');
        if (!customerId || !routeId) return result;
        result[customerId] ??= [];
        if (!result[customerId].includes(routeId))
          result[customerId].push(routeId);
        return result;
      },
      {},
    );
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    threeMonthsAgo.setHours(0, 0, 0, 0);
    const sales = await this.connection
      .collection('sales')
      .find({
        $or: [{ employeeId: ownerId }, { 'employees.employeeId': ownerId }],
        date: { $gte: threeMonthsAgo },
      })
      .project({ saleId: 1 })
      .toArray();
    const saleIds = sales
      .map((sale) => String(sale.saleId ?? ''))
      .filter(Boolean);

    return {
      vanId,
      routeIds,
      routeAssignments,
      customerIds,
      customerRouteIds,
      saleIds,
    };
  }

  private ownershipFilter(entity: string, ownerId: string, scope: SyncScope) {
    if (GLOBAL_MASTER_ENTITIES.has(entity)) return {};

    switch (entity) {
      case 'customers':
      case 'outlets':
        return { customerId: { $in: scope.customerIds } };
      case 'routes':
        return { routeId: { $in: scope.routeIds } };
      case 'vans':
        return scope.vanId
          ? { vanId: scope.vanId, associatedUsers: ownerId }
          : { _id: { $in: [] } };
      case 'routeSessions':
      case 'leaves':
        return {
          userId: ownerId,
          ...this.lastThreeMonthsFilter(
            entity === 'routeSessions' ? 'sessionDate' : 'createdAt',
          ),
        };
      case 'activities':
        return {
          userId: ownerId,
          ...this.lastThreeMonthsFilter('startTime'),
        };
      case 'nonSales':
        return { employeeId: ownerId };
      case 'salesmen':
        return { employeeId: ownerId };
      case 'stock':
        return scope.vanId ? { vanId: scope.vanId } : { _id: { $in: [] } };
      case 'orders':
        return {
          $or: [{ employeeId: ownerId }, { 'employees.employeeId': ownerId }],
          ...this.lastThreeMonthsFilter('date'),
        };
      case 'orderItems':
        return { saleId: { $in: scope.saleIds } };
      case 'collections':
        return {
          employeeId: ownerId,
          ...this.lastThreeMonthsFilter('date'),
        };
      case 'inventoryTransactions':
        return {
          employeeId: ownerId,
          ...this.lastThreeMonthsFilter('transactionDate'),
        };
      case 'attendance':
        return {
          userId: ownerId,
          ...this.lastThreeMonthsFilter('dayStartTime'),
        };
      case 'visits':
        return {
          employeeId: ownerId,
          ...this.lastThreeMonthsFilter('checkInTime'),
        };
      case 'targets': {
        const { start, end } = this.lastThreeMonthsRange();
        return {
          userId: ownerId,
          startDate: { $lte: end },
          endDate: { $gte: start },
        };
      }
      case 'vanDailyStock':
        return {
          employeeId: ownerId,
          ...this.lastThreeMonthsFilter('date'),
        };
      case 'vanErpClosing':
        return scope.vanId
          ? {
              vanId: scope.vanId,
              ...this.lastThreeMonthsFilter('date'),
            }
          : { _id: { $in: [] } };
      default:
        return {
          $or: [
            { employeeId: ownerId },
            { userId: ownerId },
            { createdBy: ownerId },
            { salesmanId: ownerId },
          ],
        };
    }
  }

  private lastThreeMonthsRange() {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  private lastThreeMonthsFilter(field: string) {
    const { start, end } = this.lastThreeMonthsRange();
    return {
      $expr: {
        $and: [
          {
            $gte: [
              {
                $convert: {
                  input: `$${field}`,
                  to: 'date',
                  onError: '$createdAt',
                  onNull: '$createdAt',
                },
              },
              start,
            ],
          },
          {
            $lte: [
              {
                $convert: {
                  input: `$${field}`,
                  to: 'date',
                  onError: '$createdAt',
                  onNull: '$createdAt',
                },
              },
              end,
            ],
          },
        ],
      },
    };
  }

  private uploadOwnershipFilter(entity: string, ownerId: string) {
    if (
      ['attendance', 'activities', 'routeSessions', 'leaves'].includes(entity)
    ) {
      return { userId: ownerId };
    }
    if (
      ['visits', 'nonSales', 'collections', 'inventoryTransactions'].includes(
        entity,
      )
    ) {
      return { employeeId: ownerId };
    }
    if (entity === 'orders') {
      return {
        $or: [{ employeeId: ownerId }, { 'employees.employeeId': ownerId }],
      };
    }
    return {
      $or: [
        { userId: ownerId },
        { employeeId: ownerId },
        { createdBy: ownerId },
        { salesmanId: ownerId },
      ],
    };
  }



  private async createOfflineSyncAudit(params: {
    operation: SyncOperationDto;
    ownerId: string;
    businessId?: string;
    rawPayload: Record<string, unknown>;
    cleanedPayload?: Record<string, unknown> | null;
    before?: Record<string, unknown> | null;
  }) {
    const now = new Date();

    const inserted = await this.connection
      .collection('offline_sync_audit_logs')
      .insertOne({
        auditId: IdGenerator.generate('AUDT', 10),
        queueId: String(params.operation.queueId ?? ''),
        ownerId: params.ownerId,
        entity: params.operation.entity,
        operation: params.operation.operation,
        localId: params.operation.localId,
        businessId: params.businessId,
        rawPayload: params.rawPayload,
        cleanedPayload: params.cleanedPayload ?? null,
        before: params.before ?? null,
        status: 'PENDING',
        performedBy: {
          employeeId: params.ownerId,
        },
        metadata: {
          source: 'OFFLINE_SYNC',
          syncedAt: now,
        },
        createdAt: now,
        updatedAt: now,
      });

    return inserted.insertedId;
  }

  private async markOfflineSyncAuditSuccess(
    auditObjectId: unknown,
    params: {
      serverId?: string;
      version?: number;
      after?: Record<string, unknown> | null;
      result?: Record<string, unknown>;
    },
  ) {
    if (!auditObjectId) return;

    await this.connection.collection('offline_sync_audit_logs').updateOne(
      { _id: auditObjectId },
      {
        $set: {
          status: 'SUCCESS',
          serverId: params.serverId,
          version: params.version ?? 1,
          after: params.after ?? null,
          result: params.result,
          updatedAt: new Date(),
        },
      },
    );
  }

  private async markOfflineSyncAuditFailed(
    auditObjectId: unknown,
    error: string,
  ) {
    if (!auditObjectId) return;

    await this.connection.collection('offline_sync_audit_logs').updateOne(
      { _id: auditObjectId },
      {
        $set: {
          status: 'FAILED',
          error,
          updatedAt: new Date(),
        },
      },
    );
  }

  private resolveConflict(
    existing: Record<string, unknown>,
    payload: Record<string, unknown>,
    operation: SyncOperationDto,
  ) {
    const serverVersion = Number(existing.version ?? 1);
    const clientVersion = Number(operation.payload.version ?? 0);
    const isConflict = clientVersion > 0 && serverVersion > clientVersion;

    if (!isConflict) {
      return {
        hasConflict: false,
        resolvedPayload: payload,
        version: serverVersion + 1,
        conflictResolved: false,
      };
    }

    if (operation.operation === 'DELETE') {
      return {
        hasConflict: true,
        resolvedPayload: null,
        version: serverVersion,
        conflictResolved: false,
        error: 'VERSION_CONFLICT',
      };
    }

    return {
      hasConflict: false,
      resolvedPayload: {
        ...payload,
        uuid: existing.uuid ?? operation.localId,
        version: serverVersion + 1,
        isDeleted: false,
        deletedAt: null,
        lastSyncSource: 'OFFLINE',
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      },
      version: serverVersion + 1,
      conflictResolved: true,
    };
  }

  async upload(operations: SyncOperationDto[], ownerId: string) {
    const results = [] as Record<string, unknown>[];
    for (const operation of operations) {
      let auditObjectId: unknown | null = null;

      try {
        const collectionName =
          COLLECTIONS[operation.entity as keyof typeof COLLECTIONS];
        if (!collectionName)
          throw new Error(`Unsupported sync entity: ${operation.entity}`);
        if (MASTER_ENTITIES.has(operation.entity))
          throw new Error('Master data is read-only');
        if (!WRITABLE_ENTITIES.has(operation.entity))
          throw new Error(`Entity is not writable from offline sync: ${operation.entity}`);
        const collection = this.connection.collection(collectionName);
        const payload = normalizeOfflinePayload(
          operation.entity as keyof typeof COLLECTIONS,
          cleanPayload(operation.payload),
        );
        const legacyLocationField = ['background', 'Locations'].join('');
        const offlineLocations =
          operation.entity === 'attendance' &&
          Array.isArray(payload[legacyLocationField])
            ? (payload[legacyLocationField] as Record<string, unknown>[])
            : [];
        // High-frequency points belong exclusively to live_location_tracking.
        delete payload[legacyLocationField];
        const idField =
          ENTITY_ID_FIELDS[operation.entity as keyof typeof COLLECTIONS];
        if (idField && !payload[idField]) payload[idField] = operation.localId;
        const isCustomerOperation = ['customers', 'outlets'].includes(
          operation.entity,
        );
        if (isCustomerOperation) {
          payload.customerId = String(payload.customerId ?? operation.localId);
          payload.createdByEmployeeId ??= ownerId;
        }
        if (
          ['attendance', 'activities', 'routeSessions', 'leaves'].includes(
            operation.entity,
          )
        ) {
          payload.userId = ownerId;
        }
        if (
          [
            'visits',
            'nonSales',
            'collections',
            'inventoryTransactions',
          ].includes(operation.entity) &&
          !payload.employeeId
        ) {
          payload.employeeId = ownerId;
        }
        if (operation.entity === 'orders') {
          // Dashboard queries use the canonical top-level employeeId, while
          // older sales records use the employees array. Persist both so an
          // offline-created order is visible through either API path.
          payload.employeeId = ownerId;
          const employees = Array.isArray(payload.employees)
            ? payload.employees
            : [];
          if (
            !employees.some(
              (employee) =>
                String(
                  (employee as Record<string, unknown>)?.employeeId ?? '',
                ) === ownerId,
            )
          ) {
            employees.push({ employeeId: ownerId });
          }
          payload.employees = employees;
        }
        const businessId = idField
          ? (payload[idField] ?? operation.localId)
          : operation.localId;
        const persistOfflineLocations = async () => {
          if (!offlineLocations.length) return;
          const now = new Date();
          await this.connection.collection('live_location_tracking').insertMany(
            offlineLocations.map((location) => ({
              locationId: IdGenerator.generate('LOC', 10),
              userId: ownerId,
              workSessionId: String(businessId),
              vanId: payload.vanId,
              source: 'OFFLINE',
              ...location,
              capturedAt: location.capturedAt
                ? new Date(String(location.capturedAt))
                : now,
              isDeleted: false,
              createdAt: now,
              updatedAt: now,
            })),
          );
        };
        const serverId = String(operation.payload.serverId ?? '');
        const serverObjectId = Types.ObjectId.isValid(serverId)
          ? new Types.ObjectId(serverId)
          : null;
        const existing = await collection.findOne({
          $or: [
            ...(serverObjectId
              ? [
                  {
                    _id: serverObjectId,
                    ...this.uploadOwnershipFilter(operation.entity, ownerId),
                  },
                ]
              : []),
            {
              $and: [
                { uuid: operation.localId },
                this.uploadOwnershipFilter(operation.entity, ownerId),
              ],
            },
            ...(operation.entity === 'attendance'
              ? [{ workSessionId: businessId, userId: ownerId }]
              : []),
            ...(operation.entity === 'activities'
              ? [{ activityId: businessId, userId: ownerId }]
              : []),
            ...(operation.entity === 'routeSessions'
              ? [{ routeSessionId: businessId, userId: ownerId }]
              : []),
          ],
        });
        auditObjectId = await this.createOfflineSyncAudit({
          operation,
          ownerId,
          businessId: String(businessId),
          rawPayload: operation.payload,
          cleanedPayload: payload,
          before: existing ?? null,
        });

        const clientVersion = Number(operation.payload.version ?? 0);

        if (operation.operation === 'CREATE') {
          if (existing) {
            const wasCreatedByOfflineSync =
              existing.createdOffline === true ||
              existing.uuid === operation.localId;
            const shouldMergeOfflineChanges =
              operation.entity === 'attendance' || wasCreatedByOfflineSync;
            const existingRecordChanges = shouldMergeOfflineChanges
              ? payload
              : {};
            const existingVersion = Number(existing.version ?? 1);
            const nextVersion = shouldMergeOfflineChanges
              ? existingVersion + 1
              : existingVersion;

            await collection.updateOne(
              { _id: existing._id },
              {
                $set: {
                  ...existingRecordChanges,
                  ...(operation.entity === 'attendance'
                    ? { userId: ownerId }
                    : {}),
                  uuid: existing.uuid ?? operation.localId,
                  isDeleted: false,
                  deletedAt: null,
                  ...(wasCreatedByOfflineSync
                    ? {
                        createdOffline: true,
                        syncSource: 'OFFLINE',
                      }
                    : {}),
                  lastSyncSource: 'OFFLINE',
                  lastSyncedAt: new Date(),
                  updatedAt: new Date(),
                  version: nextVersion,
                },
                $unset: { ownerId: '' },
              },
            );
            if (operation.entity === 'inventoryTransactions')
              await this.applyOfflineInventoryTransaction(payload);
            await persistOfflineLocations();
            if (isCustomerOperation) {
              await this.syncCustomerRouteMapping(
                existing.customerId ?? businessId,
                payload.routeId,
              );
            }
            const result = {
              queueId: operation.queueId,
              localId: operation.localId,
              success: true,
              serverId: String(existing._id),
              version: nextVersion,
            };

            await this.markOfflineSyncAuditSuccess(auditObjectId, {
              serverId: String(existing._id),
              version: nextVersion,
              after: { ...payload, version: nextVersion },
              result,
            });

            results.push(result);
            continue;
          }
          const now = new Date();
          if (operation.entity === 'routeSessions') {
            await collection.updateMany(
              { userId: ownerId, status: 'ACTIVE' },
              {
                $set: {
                  status: 'COMPLETED',
                  isActive: false,
                  endTime: now,
                  updatedAt: now,
                },
              },
            );
          }
          const inserted = await collection.insertOne({
            ...payload,
            uuid: operation.localId,
            version: 1,
            isDeleted: false,
            createdOffline: true,
            syncSource: 'OFFLINE',
            syncedAt: now,
            lastSyncSource: 'OFFLINE',
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          if (operation.entity === 'inventoryTransactions')
            await this.applyOfflineInventoryTransaction(payload);
          await persistOfflineLocations();

          if (isCustomerOperation) {
            await this.syncCustomerRouteMapping(
              payload.customerId,
              payload.routeId,
            );
            await this.notifyManagerOfOfflineOutlet(payload, ownerId);
          }

          // Older app versions queued only the work-session record for an
          // offline Day Start. Recreate the activity/route side effects that
          // the normal WorkSession endpoint performs, unless this upload batch
          // already contains their dedicated local operations.
          if (operation.entity === 'attendance') {
            const workSessionId = String(
              payload.workSessionId ?? operation.localId,
            );
            const hasActivityOperation = operations.some(
              (item) =>
                item.entity === 'activities' &&
                String(item.payload?.workSessionId ?? '') === workSessionId,
            );
            const hasRouteOperation = operations.some(
              (item) =>
                item.entity === 'routeSessions' &&
                String(item.payload?.workSessionId ?? '') === workSessionId,
            );

            if (payload.activityName && !hasActivityOperation) {
              await this.connection.collection('activities').insertOne({
                activityId: IdGenerator.generate('ACTI', 8),
                userId: ownerId,
                userName: payload.userName,
                vanId: payload.vanId,
                vanName: payload.vanName,
                name: payload.activityName,
                description: payload.description ?? '',
                workSessionId,
                startTime: payload.startTime ?? payload.dayStartTime ?? now,
                status: 'ACTIVE',
                createdOffline: true,
                syncSource: 'OFFLINE',
                syncedAt: now,
                lastSyncSource: 'OFFLINE',
                lastSyncedAt: now,
                createdAt: now,
                updatedAt: now,
                isDeleted: false,
              });
            }

            if (payload.routeId && !hasRouteOperation) {
              await this.connection.collection('route_sessions').insertOne({
                routeSessionId: IdGenerator.generate('ROUT', 8),
                workSessionId,
                userId: ownerId,
                userName: payload.userName,
                vanId: payload.vanId,
                vanName: payload.vanName,
                routeId: payload.routeId,
                routeName: payload.routeName,
                customerCategoryId: payload.customerCategoryId,
                totalShops: Number(payload.totalShops ?? 0),
                visitedShops: 0,
                status: 'ACTIVE',
                isActive: true,
                createdOffline: true,
                syncSource: 'OFFLINE',
                syncedAt: now,
                lastSyncSource: 'OFFLINE',
                lastSyncedAt: now,
                startTime: payload.startTime ?? payload.dayStartTime ?? now,
                sessionDate: now,
                createdAt: now,
                updatedAt: now,
                isDeleted: false,
              });
            }
          }
          const result = {
            queueId: operation.queueId,
            localId: operation.localId,
            success: true,
            serverId: String(inserted.insertedId),
            version: 1,
          };

          await this.markOfflineSyncAuditSuccess(auditObjectId, {
            serverId: String(inserted.insertedId),
            version: 1,
            after: { ...payload, version: 1 },
            result,
          });

          results.push(result);
          continue;
        }

        if (
          !existing &&
          ['attendance', 'activities'].includes(operation.entity)
        ) {
          // A locally cached session/activity can be changed before it has a
          // stable server mapping. Recover the orphaned UPDATE as an insert so
          // activity CREATE and UPDATE queues cannot remain permanently stuck.
          const now = new Date();
          const inserted = await collection.insertOne({
            ...payload,
            ...(idField ? { [idField]: businessId } : {}),
            userId: ownerId,
            uuid: operation.localId,
            version: 1,
            isDeleted: false,
            createdOffline: true,
            syncSource: 'OFFLINE',
            syncedAt: now,
            lastSyncSource: 'OFFLINE',
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });
          await persistOfflineLocations();
          const result = {
            queueId: operation.queueId,
            localId: operation.localId,
            success: true,
            serverId: String(inserted.insertedId),
            version: 1,
          };

          await this.markOfflineSyncAuditSuccess(auditObjectId, {
            serverId: String(inserted.insertedId),
            version: 1,
            after: { ...payload, version: 1 },
            result,
          });

          results.push(result);
          continue;
        }

        if (!existing) throw new Error('Server record not found');

        const conflictResult = this.resolveConflict(existing, payload, operation);

        if (conflictResult.hasConflict) {
          const result = {
            queueId: operation.queueId,
            localId: operation.localId,
            success: false,
            conflict: true,
            error: conflictResult.error || 'VERSION_CONFLICT',
            serverId: String(existing._id),
            version: Number(existing.version ?? 1),
          };

          await this.markOfflineSyncAuditFailed(
            auditObjectId,
            result.error,
          );

          results.push(result);
          continue;
        }

        const version = conflictResult.version;
        const changes =
          operation.operation === 'DELETE'
            ? {
                isDeleted: true,
                deletedAt: new Date(),
                lastSyncSource: 'OFFLINE',
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
                version,
              }
            : {
                ...(conflictResult.resolvedPayload || payload),
                isDeleted: false,
                deletedAt: null,
                lastSyncSource: 'OFFLINE',
                lastSyncedAt: new Date(),
                updatedAt: new Date(),
                version,
              };
        await collection.updateOne(
          { _id: existing._id },
          { $set: changes, $unset: { ownerId: '' } },
        );
        if (operation.operation !== 'DELETE') await persistOfflineLocations();
        if (isCustomerOperation) {
          await this.syncCustomerRouteMapping(
            existing.customerId ?? businessId,
            payload.routeId,
            operation.operation === 'DELETE',
          );
        }
        const result = {
          queueId: operation.queueId,
          localId: operation.localId,
          success: true,
          serverId: String(existing._id),
          version,
          conflictResolved: conflictResult.conflictResolved,
        };

        await this.markOfflineSyncAuditSuccess(auditObjectId, {
          serverId: String(existing._id),
          version,
          after: changes,
          result,
        });

        results.push(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Sync operation failed';

        if (!auditObjectId) {
          auditObjectId = await this.createOfflineSyncAudit({
            operation,
            ownerId,
            businessId: operation.localId,
            rawPayload: operation.payload,
            cleanedPayload: null,
            before: null,
          }).catch(() => null);
        }

        await this.markOfflineSyncAuditFailed(auditObjectId, message).catch(
          () => null,
        );

        results.push({
          queueId: operation.queueId,
          localId: operation.localId,
          success: false,
          error: message,
        });
      }
    }
    return { results };
  }

  private async repairDownloadMetadata(
    entity: string,
    collection: ReturnType<Connection['collection']>,
    ownership: Record<string, unknown>,
  ) {
    /**
     * Important:
     * Do not bump updatedAt during download repairs.
     * If updatedAt is touched here, the same records look new and keep
     * downloading even when no business document changed.
     */
    if (!GLOBAL_MASTER_ENTITIES.has(entity)) {
      await collection.updateMany(
        { ...ownership, ownerId: { $exists: true } },
        { $unset: { ownerId: '' } },
      );
    }

    await collection.updateMany(
      { ...ownership, isDeleted: { $exists: false } },
      [
        {
          $set: {
            isDeleted: false,
            updatedAt: {
              $ifNull: ['$updatedAt', { $ifNull: ['$createdAt', new Date(0)] }],
            },
          },
        },
      ],
    );

    await collection.updateMany(
      { ...ownership, updatedAt: { $exists: false } },
      [
        {
          $set: {
            updatedAt: { $ifNull: ['$createdAt', new Date(0)] },
          },
        },
      ],
    );
  }

  async download(
    ownerId: string,
    lastSync?: string,
    cursor?: string,
    vanId?: string,
  ) {
    const since = lastSync ? new Date(lastSync) : new Date(0);
    const entries = Object.entries(COLLECTIONS);
    const scope = await this.getScope(ownerId, vanId);
    const [rawIndex, rawOffset] = (cursor ?? '0:0').split(':');
    let entityIndex = Math.max(0, Number(rawIndex));
    let offset = Math.max(0, Number(rawOffset));
    const pageSize = 500;

    while (entityIndex < entries.length) {
      const [entity, collectionName] = entries[entityIndex];
      const ownership = this.ownershipFilter(entity, ownerId, scope);
      const collection = this.connection.collection(collectionName);

      await this.repairDownloadMetadata(entity, collection, ownership);

      // Strict incremental sync:
      // After the first full download, every entity must be returned only when
      // its updatedAt is newer than the client's last successful sync time.
      // If route/customer/assignment membership changes, the write operation
      // that changes the mapping must also touch updatedAt on the affected
      // route/customer documents.
      const changed = lastSync ? { updatedAt: { $gt: since } } : {};

      const documents =
        entity === 'priceLists'
          ? await collection
              .aggregate([
                { $match: ownership },
                {
                  $addFields: {
                    _effectiveDateForSort: {
                      $convert: {
                        input: '$effectiveDate',
                        to: 'date',
                        onError: new Date(0),
                        onNull: new Date(0),
                      },
                    },
                    _updatedAtForSort: {
                      $convert: {
                        input: '$updatedAt',
                        to: 'date',
                        onError: new Date(0),
                        onNull: new Date(0),
                      },
                    },
                  },
                },
                {
                  $sort: {
                    productId: 1,
                    categoryId: 1,
                    customerCategoryId: 1,
                    categoryCode: 1,
                    _effectiveDateForSort: -1,
                    _updatedAtForSort: -1,
                    _id: -1,
                  },
                },
                {
                  $group: {
                    _id: {
                      productId: '$productId',
                      categoryId: '$categoryId',
                      customerCategoryId: '$customerCategoryId',
                      categoryCode: '$categoryCode',
                    },
                    document: { $first: '$$ROOT' },
                  },
                },
                { $replaceRoot: { newRoot: '$document' } },
                ...(lastSync ? [{ $match: { updatedAt: { $gt: since } } }] : []),
                { $sort: { updatedAt: 1, _id: 1 } },
                { $skip: offset },
                { $limit: pageSize + 1 },
                { $project: { _effectiveDateForSort: 0, _updatedAtForSort: 0 } },
              ])
              .toArray()
          : await collection
              .find({ ...ownership, ...changed })
              .sort({ updatedAt: 1, _id: 1 })
              .skip(offset)
              .limit(pageSize + 1)
              .toArray();
      const hasMoreInEntity = documents.length > pageSize;
      const records = documents.slice(0, pageSize).map((document) => {
        const {
          _id,
          uuid,
          ownerId: _ownerId,
          version,
          updatedAt,
          deletedAt,
          isDeleted,
          ...payload
        } = document;
        const idField = ENTITY_ID_FIELDS[entity as keyof typeof COLLECTIONS];
        const businessId = document[idField];
        const assignment =
          entity === 'routes'
            ? scope.routeAssignments[String(businessId ?? '')]
            : undefined;
        const routeIds =
          entity === 'customers' || entity === 'outlets'
            ? scope.customerRouteIds[String(businessId ?? '')]
            : undefined;
        const effectiveDeletedAt =
          deletedAt ?? (isDeleted ? (updatedAt ?? new Date()) : null);
        return {
          entity,
          uuid: String(uuid ?? businessId ?? _id),
          id: String(_id),
          version: version ?? 1,
          updatedAt: updatedAt?.toISOString?.() ?? new Date().toISOString(),
          deletedAt:
            effectiveDeletedAt?.toISOString?.() ?? effectiveDeletedAt ?? null,
          payload: {
            ...payload,
            [idField]: businessId,
            isDeleted: Boolean(isDeleted),
            ...(assignment ? { assignment } : {}),
            ...(routeIds ? { routeIds } : {}),
          },
        };
      });

      if (records.length || hasMoreInEntity) {
        const nextCursor = hasMoreInEntity
          ? `${entityIndex}:${offset + pageSize}`
          : entityIndex + 1 < entries.length
            ? `${entityIndex + 1}:0`
            : undefined;
        return {
          records,
          hasMore: Boolean(nextCursor),
          cursor: nextCursor,
          serverTime: new Date().toISOString(),
        };
      }
      entityIndex += 1;
      offset = 0;
    }
    return {
      records: [],
      hasMore: false,
      cursor: undefined,
      serverTime: new Date().toISOString(),
    };
  }
}