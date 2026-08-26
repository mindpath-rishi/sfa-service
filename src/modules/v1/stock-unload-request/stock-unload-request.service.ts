import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession, Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import {
  Product,
  ProductSchema,
} from 'src/core/database/mongo/schema/product.schema';
import {
  StockUnloadRequest,
  StockUnloadRequestSchema,
} from 'src/core/database/mongo/schema/stock-unload-request.schema';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { NotificationPlatform } from 'src/shared/enums/notification.enums';
import { StockUnloadRequestStatus } from 'src/shared/enums/stock-unload-request.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { InventoryTransactionService } from '../inventory-transaction/inventory-transaction.service';
import { NotificationService } from '../notification/notification.service';
import { VanInventoryService } from '../van-inventory/van-inventory.service';
import { StockUnloadRequestQueryDto } from './dto/stock-unload-request-query.dto';

type CreateFromDayEndInput = {
  workSessionId: string;
  vanId: string;
  employeeId: string;
  warehouseId?: string;
  totalQuantity?: number;
  totalCases?: number;
  totalPieces?: number;
  totalValue?: number;
  items?: Array<{
    productId: string;
    productName?: string;
    quantity?: number;
    cases?: number;
    pieces?: number;
    value?: number;
    unitQtyInCase?: number;
  }>;
};

@Injectable()
export class StockUnloadRequestService extends MongoRepository<StockUnloadRequest> {
  private readonly employeeModel: Model<Employee>;
  private readonly productModel: Model<Product>;

  constructor(
    mongo: MongoService,
    private readonly inventoryService: VanInventoryService,
    private readonly inventoryTransactionService: InventoryTransactionService,
    private readonly notificationService: NotificationService,
  ) {
    super(mongo.getModel(StockUnloadRequest.name, StockUnloadRequestSchema));
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
    this.productModel = mongo.getModel(Product.name, ProductSchema);
  }

  async createFromDayEnd(
    input: CreateFromDayEndInput,
    session?: ClientSession,
  ) {
    const existing = await this.findOne(
      { workSessionId: input.workSessionId },
      { session, includeDeleted: true },
    );
    if (existing) return existing;

    const employeeQuery = this.employeeModel
      .findOne({ employeeId: input.employeeId, isDeleted: { $ne: true } })
      .select('employeeId name hierarchyPath')
      .lean();
    if (session) employeeQuery.session(session);
    const employee = await employeeQuery;
    const hierarchyPath = employee?.hierarchyPath || [];
    const managerId = hierarchyPath[hierarchyPath.length - 1];

    const request = await this.save(
      {
        unloadRequestId: IdGenerator.generate('UNLOAD', 10),
        workSessionId: input.workSessionId,
        vanId: input.vanId,
        employeeId: input.employeeId,
        employeeName: employee?.name,
        managerId,
        warehouseId: input.warehouseId || 'WH-001',
        totalQuantity: input.totalQuantity || 0,
        totalCases: input.totalCases || 0,
        totalPieces: input.totalPieces || 0,
        totalValue: input.totalValue || 0,
        items: (input.items || []).map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity || 0,
          cases: item.cases || 0,
          pieces: item.pieces || 0,
          value: item.value || 0,
          unitQtyInCase: item.unitQtyInCase || 0,
        })),
        status: StockUnloadRequestStatus.PENDING,
      },
      { session },
    );

    const hierarchyRecipients = [...new Set(hierarchyPath.filter(Boolean))];
    await Promise.all(
      hierarchyRecipients.map((recipientId) =>
        this.notificationService.create({
          recipientId,
          title: 'Stock Unload Approval Required',
          body: `${employee?.name || input.employeeId} requested to unload all stock from van ${input.vanId}.`,
          category: 'stock_unload',
          platform: NotificationPlatform.ANDROID,
          data: {
            category: 'stock_unload',
            action: 'APPROVAL_REQUIRED',
            status: StockUnloadRequestStatus.PENDING,
            unloadRequestId: request.unloadRequestId,
            workSessionId: input.workSessionId,
            vanId: input.vanId,
            employeeId: input.employeeId,
            employeeName: employee?.name,
            totalQuantity: input.totalQuantity || 0,
            totalCases: input.totalCases || 0,
            totalPieces: input.totalPieces || 0,
            totalValue: input.totalValue || 0,
            route: `/stock-unload-detail?unloadRequestId=${request.unloadRequestId}`,
          },
        }),
      ),
    );

    return request;
  }

  async findAll(query: StockUnloadRequestQueryDto) {
    const { page = 1, limit = 20, searchText, ...requestedFilters } = query;
    const ctx = RequestContextStore.getStore();

    const isAdmin = String(ctx?.roleId || '')
      .toUpperCase()
      .includes('ADMIN');
    const filter: Record<string, any> = Object.fromEntries(
      Object.entries(requestedFilters).filter(([, value]) => value),
    );

    if (!isAdmin) {
      filter.managerId = ctx?.userId;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { unloadRequestId: regex },
        { employeeId: regex },
        { employeeName: regex },
        { vanId: regex },
      ];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Stock unload requests fetched successfully',
      data: result.items,
      meta: result.meta,
    };
  }

  async findMyPending() {
    const employeeId = RequestContextStore.getStore()?.userId;
    const request = employeeId
      ? await this.findOne(
          {
            employeeId,
            status: StockUnloadRequestStatus.PENDING,
          },
          { sort: { createdAt: -1 } },
        )
      : null;

    return {
      statusCode: HttpStatus.OK,
      message: request
        ? 'Pending stock unload request fetched successfully'
        : 'No pending stock unload request found',
      data: request,
    };
  }

  async findDetail(unloadRequestId: string) {
    const request = await this.findOne({ unloadRequestId });
    if (!request) {
      throw new NotFoundException('Stock unload request not found');
    }

    const ctx = RequestContextStore.getStore();
    const isAdmin = String(ctx?.roleId || '')
      .toUpperCase()
      .includes('ADMIN');
    const canView =
      isAdmin ||
      request.managerId === ctx?.userId ||
      request.employeeId === ctx?.userId;

    if (!canView) {
      throw new ForbiddenException(
        'You are not allowed to view this stock unload request',
      );
    }

    let data: any = request;
    if (
      request.status === StockUnloadRequestStatus.PENDING &&
      !request.items?.length
    ) {
      const inventories = await this.inventoryService.find({
        vanId: request.vanId,
        quantity: { $gt: 0 },
      });
      const products = await this.productModel
        .find({
          productId: { $in: inventories.map((item) => item.productId) },
          isDeleted: { $ne: true },
        })
        .select('productId name piecePrice unitQtyInCase')
        .lean();
      const productsById = new Map(
        products.map((product) => [product.productId, product]),
      );

      data = {
        ...request.toObject(),
        items: inventories.map((inventory) => {
          const product = productsById.get(inventory.productId);
          const unitQtyInCase = Number(product?.unitQtyInCase || 0);
          const quantity = Number(inventory.quantity || 0);
          return {
            productId: inventory.productId,
            productName: product?.name,
            quantity,
            cases: unitQtyInCase > 0 ? Math.floor(quantity / unitQtyInCase) : 0,
            pieces: unitQtyInCase > 0 ? quantity % unitQtyInCase : quantity,
            value: quantity * Number(product?.piecePrice || 0),
            unitQtyInCase,
          };
        }),
      };
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Stock unload request details fetched successfully',
      data,
    };
  }

  async approve(unloadRequestId: string) {
    const request = await this.getPending(unloadRequestId);
    this.assertApprover(request);
    const ctx = RequestContextStore.getStore();

    const updated = await this.withTransaction(async (session) => {
      const claimed = await this.updateOne(
        {
          unloadRequestId,
          status: StockUnloadRequestStatus.PENDING,
        },
        {
          status: StockUnloadRequestStatus.APPROVED,
          resolvedBy: ctx?.userId,
          resolvedAt: new Date(),
        },
        { session, new: true },
      );
      if (!claimed) {
        throw new BadRequestException(
          'Stock unload request is already resolved',
        );
      }

      const inventories = await this.inventoryService.find(
        { vanId: request.vanId, quantity: { $gt: 0 } },
        { session },
      );
      const transactions = inventories.map((inventory) => ({
        transactionId: IdGenerator.generate('INVENTORY_TRANSACTION', 12),
        productId: inventory.productId,
        vanId: inventory.vanId,
        employeeId: request.employeeId,
        warehouseId: request.warehouseId || 'WH-001',
        transactionType: 'UNLOAD',
        direction: 'OUT',
        quantity: inventory.quantity,
        cases: 0,
        pieces: 0,
        referenceNo: request.unloadRequestId,
        remark: 'Manager approved day-end stock unload',
        transactionDate: new Date(),
        status: 'POSTED',
      }));

      if (transactions.length) {
        await this.inventoryTransactionService.bulkCreate(transactions as any, {
          session,
        });
      }

      await this.inventoryService.updateMany(
        { vanId: request.vanId },
        {
          $set: {
            quantity: 0,
            reservedQuantity: 0,
            settlementDate: new Date(),
            updatedAt: new Date(),
          },
        },
        { session },
      );

      return claimed;
    });

    await this.resolveNotifications(request, StockUnloadRequestStatus.APPROVED);
    return {
      statusCode: HttpStatus.OK,
      message: 'Stock unload request approved and van stock reset',
      data: updated,
    };
  }

  async reject(unloadRequestId: string) {
    const request = await this.getPending(unloadRequestId);
    this.assertApprover(request);
    const updated = await this.updateOne(
      {
        unloadRequestId,
        status: StockUnloadRequestStatus.PENDING,
      },
      {
        status: StockUnloadRequestStatus.REJECTED,
        resolvedBy: RequestContextStore.getStore()?.userId,
        resolvedAt: new Date(),
      },
      { new: true },
    );

    if (!updated) {
      throw new BadRequestException('Stock unload request is already resolved');
    }

    await this.resolveNotifications(request, StockUnloadRequestStatus.REJECTED);
    return {
      statusCode: HttpStatus.OK,
      message: 'Stock unload request rejected; van stock was not changed',
      data: updated,
    };
  }

  private async getPending(unloadRequestId: string) {
    const request = await this.findOne({ unloadRequestId });
    if (!request) {
      throw new NotFoundException('Stock unload request not found');
    }
    if (request.status !== StockUnloadRequestStatus.PENDING) {
      throw new BadRequestException('Stock unload request is already resolved');
    }
    return request;
  }

  private assertApprover(request: StockUnloadRequest) {
    const ctx = RequestContextStore.getStore();
    const isAdmin = String(ctx?.roleId || '')
      .toUpperCase()
      .includes('ADMIN');

    if (!isAdmin && request.managerId !== ctx?.userId) {
      throw new ForbiddenException(
        'Only the reporting manager or an admin can resolve this request',
      );
    }
  }

  private async resolveNotifications(
    request: StockUnloadRequest,
    status:
      | StockUnloadRequestStatus.APPROVED
      | StockUnloadRequestStatus.REJECTED,
  ) {
    await this.notificationService.markStockUnloadRequestResolved(
      request.unloadRequestId,
      status,
    );
    await this.notificationService.create({
      recipientId: request.employeeId,
      title:
        status === StockUnloadRequestStatus.APPROVED
          ? 'Stock Unload Approved'
          : 'Stock Unload Rejected',
      body:
        status === StockUnloadRequestStatus.APPROVED
          ? `Your unload request for van ${request.vanId} was approved and its stock was reset.`
          : `Your unload request for van ${request.vanId} was rejected. Its stock was not changed.`,
      category: 'stock_unload',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'stock_unload',
        action: status,
        status,
        unloadRequestId: request.unloadRequestId,
        workSessionId: request.workSessionId,
        vanId: request.vanId,
        route: '/notifications',
      },
    });
  }
}
