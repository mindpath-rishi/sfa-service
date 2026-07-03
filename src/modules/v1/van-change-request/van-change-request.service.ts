import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import {
  VanChangeRequest,
  VanChangeRequestSchema,
} from 'src/core/database/mongo/schema/van-change-request.schema';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import { NotificationPlatform } from 'src/shared/enums/notification.enums';
import { VanChangeRequestStatus } from 'src/shared/enums/van-change-request.enums';
import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { NotificationService } from '../notification/notification.service';
import { VanService } from '../van/van.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { CreateVanChangeRequestDto } from './dto/create-van-change-request.dto';
import { UpdateVanChangeRequestDto } from './dto/update-van-change-request.dto';
import { VanChangeRequestQueryDto } from './dto/van-change-request-query.dto';
import { VAN_CHANGE_REQUEST } from './van-change-request.constants';

@Injectable()
export class VanChangeRequestService extends MongoRepository<VanChangeRequest> {
  private readonly employeeModel: Model<Employee>;

  constructor(
    mongo: MongoService,
    private readonly workSessionService: WorkSessionService,
    private readonly vanService: VanService,
    private readonly notificationService: NotificationService,
  ) {
    super(mongo.getModel(VanChangeRequest.name, VanChangeRequestSchema));
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
  }

  async create(payload: CreateVanChangeRequestDto) {
    const ctx = RequestContextStore.getStore();
    const workSession = await this.workSessionService.findOne({
      workSessionId: payload.workSessionId,
    });

    if (!workSession) throw new NotFoundException('Work session not found');
    if (workSession.userId !== ctx?.userId) {
      throw new BadRequestException(
        'You can only request a van change for your own session',
      );
    }
    if (workSession.status !== WorkSessionStatus.ACTIVE) {
      throw new BadRequestException('No active work session found');
    }
    if (workSession.vanId === payload.requestedVanId) {
      throw new BadRequestException('Requested van is already assigned');
    }

    const pending = await this.findOne({
      workSessionId: payload.workSessionId,
      status: VanChangeRequestStatus.PENDING,
    });
    if (pending) throw new ConflictException(VAN_CHANGE_REQUEST.DUPLICATE);

    const requestedVan = await this.vanService.findOne({
      vanId: payload.requestedVanId,
    });
    if (!requestedVan) throw new BadRequestException('Requested van not found');

    try {
      const request = await this.save({
        vanChangeRequestId: IdGenerator.generate('VCR', 8),
        workSessionId: workSession.workSessionId,
        userId: workSession.userId,
        userName: workSession.userName,
        currentVanId: workSession.vanId,
        currentVanName: workSession.vanName,
        requestedVanId: payload.requestedVanId,
        requestedVanName:
          payload.requestedVanName ||
          (requestedVan as any).name ||
          (requestedVan as any).vanName,
        reason: payload.reason,
        status: VanChangeRequestStatus.PENDING,
      });

      await this.notifyManager(request);
      return {
        statusCode: HttpStatus.CREATED,
        message: VAN_CHANGE_REQUEST.CREATED,
        data: request,
      };
    } catch (error) {
      this.handleDuplicateError(error);
    }
  }

  async findAll(query: VanChangeRequestQueryDto) {
    const { page = 1, limit = 20, ...filters } = query;
    const filter: FilterQuery<VanChangeRequest> = {};
    Object.assign(filter, filters);
    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });
    return {
      statusCode: HttpStatus.OK,
      message: VAN_CHANGE_REQUEST.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByRequestId(vanChangeRequestId: string) {
    const request = await this.findOne({ vanChangeRequestId }, { lean: true });
    if (!request) throw new NotFoundException(VAN_CHANGE_REQUEST.NOT_FOUND);
    return {
      statusCode: HttpStatus.OK,
      message: VAN_CHANGE_REQUEST.FETCHED,
      data: request,
    };
  }

  async update(vanChangeRequestId: string, payload: UpdateVanChangeRequestDto) {
    const request = await this.getPending(vanChangeRequestId);
    if (request.userId !== RequestContextStore.getStore()?.userId) {
      throw new BadRequestException('You can only update your own request');
    }
    if (payload.requestedVanId) {
      if (payload.requestedVanId === request.currentVanId) {
        throw new BadRequestException('Requested van is already assigned');
      }
      const van = await this.vanService.findOne({
        vanId: payload.requestedVanId,
      });
      if (!van) throw new BadRequestException('Requested van not found');
      payload.requestedVanName =
        payload.requestedVanName || (van as any).name || (van as any).vanName;
    }
    const updated = await this.updateOne(
      { vanChangeRequestId: request.vanChangeRequestId },
      payload,
      { new: true },
    );
    return {
      statusCode: HttpStatus.OK,
      message: VAN_CHANGE_REQUEST.UPDATED,
      data: updated,
    };
  }

  async approve(vanChangeRequestId: string) {
    const request = await this.getPending(vanChangeRequestId);
    const ctx = RequestContextStore.getStore();

    await this.vanService.changeVan({
      oldVanId: request.currentVanId,
      employeeId: request.userId,
      vanId: request.requestedVanId,
    });
    await this.workSessionService.updateOne(
      { workSessionId: request.workSessionId },
      {
        vanId: request.requestedVanId,
        vanName: request.requestedVanName || request.currentVanName,
      },
    );
    const updated = await this.resolve(
      request,
      VanChangeRequestStatus.APPROVED,
      ctx?.userId,
    );

    await this.notificationService.create({
      recipientId: request.userId,
      title: 'Van Change Approved',
      body: 'Your manager approved the van change. Please select a route to start retailing.',
      category: 'van_change',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'van_change',
        action: 'APPROVED',
        vanChangeRequestId,
        workSessionId: request.workSessionId,
        vanId: request.requestedVanId,
        reason: request.reason,
        vanChangeReason: request.reason,
        route: '/(drawer)/(tabs)/home',
      },
    });
    return this.response('Van change request approved', updated);
  }

  async reject(vanChangeRequestId: string) {
    const request = await this.getPending(vanChangeRequestId);
    const updated = await this.resolve(
      request,
      VanChangeRequestStatus.REJECTED,
      RequestContextStore.getStore()?.userId,
    );
    await this.notificationService.create({
      recipientId: request.userId,
      title: 'Van Change Rejected',
      body: 'Your manager rejected the van change request. Continue with your currently mapped van.',
      category: 'van_change',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'van_change',
        action: 'REJECTED',
        vanChangeRequestId,
        workSessionId: request.workSessionId,
        reason: request.reason,
        vanChangeReason: request.reason,
        route: '/(drawer)/(tabs)/home',
      },
    });
    return this.response('Van change request rejected', updated);
  }

  async cancel(vanChangeRequestId: string) {
    const request = await this.getPending(vanChangeRequestId);
    if (request.userId !== RequestContextStore.getStore()?.userId) {
      throw new BadRequestException('You can only cancel your own request');
    }
    const updated = await this.resolve(
      request,
      VanChangeRequestStatus.CANCELLED,
      request.userId,
    );
    return this.response('Van change request cancelled', updated);
  }

  async delete(vanChangeRequestId: string) {
    const request = await this.findOne({ vanChangeRequestId });
    if (!request) throw new NotFoundException(VAN_CHANGE_REQUEST.NOT_FOUND);
    await this.softDelete({ vanChangeRequestId });
    return this.response(VAN_CHANGE_REQUEST.DELETED, request);
  }

  private async getPending(vanChangeRequestId: string) {
    const request = await this.findOne({ vanChangeRequestId });
    if (!request) throw new NotFoundException(VAN_CHANGE_REQUEST.NOT_FOUND);
    if (request.status !== VanChangeRequestStatus.PENDING) {
      throw new BadRequestException('Van change request is already resolved');
    }
    return request;
  }

  private async resolve(
    request: VanChangeRequest,
    status:
      | VanChangeRequestStatus.APPROVED
      | VanChangeRequestStatus.REJECTED
      | VanChangeRequestStatus.CANCELLED,
    resolvedBy?: string,
  ) {
    const updated = await this.updateOne(
      { vanChangeRequestId: request.vanChangeRequestId },
      { status, resolvedBy, resolvedAt: new Date() },
      { new: true },
    );
    await this.notificationService.markVanChangeRequestResolved(
      request.workSessionId,
      status,
    );
    return updated;
  }

  private async notifyManager(request: VanChangeRequest) {
    const employee = await this.employeeModel
      .findOne({ employeeId: request.userId })
      .lean();
    const hierarchyPath = employee?.hierarchyPath || [];
    const managerId =
      employee?.reportingEmployeeId || hierarchyPath[hierarchyPath.length - 1];
    if (!managerId) return;

    await this.notificationService.create({
      recipientId: managerId,
      title: 'Van Change Approval Required',
      body: `${request.userName || 'Salesman'} requested ${request.requestedVanName || request.requestedVanId} for today.`,
      category: 'van_change',
      platform: NotificationPlatform.ANDROID,
      data: {
        category: 'van_change',
        action: 'APPROVAL_REQUIRED',
        vanChangeRequestId: request.vanChangeRequestId,
        workSessionId: request.workSessionId,
        salesmanId: request.userId,
        salesmanName: request.userName,
        currentVanId: request.currentVanId,
        currentVan: request.currentVanName,
        oldVanId: request.currentVanId,
        oldVanName: request.currentVanName,
        requestedVanId: request.requestedVanId,
        requestedVan: request.requestedVanName,
        requestedVanName: request.requestedVanName,
        reason: request.reason,
        vanChangeReason: request.reason,
        route: '/notifications',
      },
    });
  }

  private response(message: string, data: unknown) {
    return { statusCode: HttpStatus.OK, message, data };
  }

  private handleDuplicateError(error: any): never {
    if (error?.code === 11000 || error?.code === 11001) {
      throw new ConflictException(VAN_CHANGE_REQUEST.DUPLICATE);
    }
    throw error;
  }
}
