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
  RouteChangeRequest,
  RouteChangeRequestSchema,
} from 'src/core/database/mongo/schema/route-change-request.schema';
import { NotificationPlatform } from 'src/shared/enums/notification.enums';
import { RouteChangeRequestStatus } from 'src/shared/enums/route-change-request.enums';
import { RouteSessionStatus } from 'src/shared/enums/route-session.enums';
import { WorkSessionStatus } from 'src/shared/enums/work-session.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { NotificationService } from '../notification/notification.service';
import { RouteService } from '../route/route.service';
import { RouteSessionService } from '../route-session/route-session.service';
import { VanService } from '../van/van.service';
import { WorkSessionService } from '../work-session/work-session.service';
import { CreateRouteChangeRequestDto } from './dto/create-route-change-request.dto';
import { ROUTE_CHANGE_REQUEST } from './route-change-request.constants';

@Injectable()
export class RouteChangeRequestService extends MongoRepository<RouteChangeRequest> {
  private readonly employeeModel: Model<Employee>;

  constructor(
    mongo: MongoService,
    private readonly workSessionService: WorkSessionService,
    private readonly routeSessionService: RouteSessionService,
    private readonly routeService: RouteService,
    private readonly vanService: VanService,
    private readonly notificationService: NotificationService,
  ) {
    super(mongo.getModel(RouteChangeRequest.name, RouteChangeRequestSchema));
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
  }

  async create(payload: CreateRouteChangeRequestDto) {
    const ctx = RequestContextStore.getStore();
    const workSession = await this.workSessionService.findOne({
      workSessionId: payload.workSessionId,
    });

    if (!workSession) throw new NotFoundException('Work session not found');
    if (workSession.userId !== ctx?.userId) {
      throw new BadRequestException(
        'You can only request a route change for your own session',
      );
    }
    if (workSession.status !== WorkSessionStatus.ACTIVE) {
      throw new BadRequestException('No active work session found');
    }

    const currentRoute = await this.routeSessionService.findOne({
      workSessionId: workSession.workSessionId,
      userId: workSession.userId,
      status: RouteSessionStatus.ACTIVE,
    });

    if (!currentRoute) {
      throw new BadRequestException('No active route found');
    }
    if (currentRoute.routeId === payload.routeId) {
      throw new BadRequestException('Requested route is already active');
    }

    const pending = await this.findOne({
      workSessionId: workSession.workSessionId,
      status: RouteChangeRequestStatus.PENDING,
    });
    if (pending) throw new ConflictException(ROUTE_CHANGE_REQUEST.DUPLICATE);

    const employee = await this.employeeModel
      .findOne({ employeeId: workSession.userId })
      .lean();
    const hierarchyPath = employee?.hierarchyPath || [];
    const managerId = hierarchyPath[hierarchyPath.length - 1];

    if (!managerId) {
      throw new BadRequestException('Reporting manager not found');
    }

    const requestedRoute = await this.routeService.findOne({
      routeId: payload.routeId,
      isDeleted: false,
    } as any);
    if (!requestedRoute) {
      throw new BadRequestException('Requested route not found');
    }

    const van = await this.vanService.findOne({
      vanId: workSession.vanId,
      'associatedRoutes.routeId': payload.routeId,
      isDeleted: false,
    } as any);
    if (!van) {
      throw new BadRequestException(
        'Requested route is not mapped to your assigned van',
      );
    }

    try {
      const request = await this.save({
        routeChangeRequestId: IdGenerator.generate('RCR', 8),
        workSessionId: workSession.workSessionId,
        userId: workSession.userId,
        userName: workSession.userName,
        managerId,
        currentRouteId: currentRoute.routeId,
        currentRouteName: currentRoute.routeName,
        currentRouteSessionId: currentRoute.routeSessionId,
        requestedRouteId: requestedRoute.routeId,
        requestedRouteName: (requestedRoute as any).name || payload.routeName,
        totalShops:
          Number((requestedRoute as any).outletCount) ||
          Number(payload.totalShops) ||
          0,
        vanId: workSession.vanId,
        vanName: workSession.vanName || (van as any).name,
        customerCategoryId:
          (requestedRoute as any).customerCategoryId ||
          payload.customerCategoryId,
        reason: payload.reason,
        status: RouteChangeRequestStatus.PENDING,
      });

      await this.notifyManager(request);

      return {
        statusCode: HttpStatus.CREATED,
        message: ROUTE_CHANGE_REQUEST.CREATED,
        data: request,
      };
    } catch (error: any) {
      if (error?.code === 11000 || error?.code === 11001) {
        throw new ConflictException(ROUTE_CHANGE_REQUEST.DUPLICATE);
      }
      throw error;
    }
  }

  async approve(routeChangeRequestId: string) {
    const request = await this.getPendingForManager(routeChangeRequestId);
    const workSession = await this.workSessionService.findOne({
      workSessionId: request.workSessionId,
      userId: request.userId,
      status: WorkSessionStatus.ACTIVE,
    });
    if (!workSession) {
      throw new BadRequestException(
        'The salesman work session is no longer active',
      );
    }

    const activeRoute = await this.routeSessionService.findOne({
      workSessionId: request.workSessionId,
      userId: request.userId,
      status: RouteSessionStatus.ACTIVE,
    });
    if (!activeRoute || activeRoute.routeId !== request.currentRouteId) {
      throw new ConflictException(
        'The active route changed after this request was submitted',
      );
    }

    const routeSessionResponse =
      await this.routeSessionService.activateApprovedRoute(
        {
          workSessionId: request.workSessionId,
          routeId: request.requestedRouteId,
          routeName: request.requestedRouteName,
          customerCategoryId: request.customerCategoryId,
          totalShops: request.totalShops,
          vanId: request.vanId,
          vanName: request.vanName,
        },
        { userId: request.userId, userName: request.userName },
      );

    const approvedRouteSessionId = (routeSessionResponse?.data as any)
      ?.routeSessionId;
    const updated = await this.resolve(
      request,
      RouteChangeRequestStatus.APPROVED,
      approvedRouteSessionId,
    );

    await this.notificationService.create({
      recipientId: request.userId,
      title: 'Route Change Approved',
      body: `Your route has been changed to ${request.requestedRouteName || request.requestedRouteId}.`,
      category: 'route_change',
      platforms: [
        NotificationPlatform.ANDROID,
        NotificationPlatform.IOS,
        NotificationPlatform.WEB,
      ],
      data: {
        category: 'route_change',
        action: 'APPROVED',
        status: 'APPROVED',
        routeChangeRequestId,
        workSessionId: request.workSessionId,
        routeId: request.requestedRouteId,
        routeName: request.requestedRouteName,
        routeSessionId: approvedRouteSessionId,
        route: '/route',
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Route change request approved',
      data: updated,
    };
  }

  async reject(routeChangeRequestId: string) {
    const request = await this.getPendingForManager(routeChangeRequestId);
    const updated = await this.resolve(
      request,
      RouteChangeRequestStatus.REJECTED,
    );

    await this.notificationService.create({
      recipientId: request.userId,
      title: 'Route Change Rejected',
      body: `Your request to change to ${request.requestedRouteName || request.requestedRouteId} was rejected.`,
      category: 'route_change',
      platforms: [
        NotificationPlatform.ANDROID,
        NotificationPlatform.IOS,
        NotificationPlatform.WEB,
      ],
      data: {
        category: 'route_change',
        action: 'REJECTED',
        status: 'REJECTED',
        routeChangeRequestId,
        workSessionId: request.workSessionId,
        currentRouteId: request.currentRouteId,
        requestedRouteId: request.requestedRouteId,
        requestedRouteName: request.requestedRouteName,
        route: '/(drawer)/(tabs)/home',
      },
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Route change request rejected',
      data: updated,
    };
  }

  private async getPendingForManager(routeChangeRequestId: string) {
    const request = await this.findOne({ routeChangeRequestId });
    if (!request) {
      throw new NotFoundException(ROUTE_CHANGE_REQUEST.NOT_FOUND);
    }
    if (request.status !== RouteChangeRequestStatus.PENDING) {
      throw new BadRequestException('Route change request is already resolved');
    }
    if (request.managerId !== RequestContextStore.getStore()?.userId) {
      throw new BadRequestException(
        'Only the reporting manager can resolve this request',
      );
    }
    return request;
  }

  private async resolve(
    request: RouteChangeRequest,
    status:
      | RouteChangeRequestStatus.APPROVED
      | RouteChangeRequestStatus.REJECTED,
    approvedRouteSessionId?: string,
  ) {
    const updated = await this.updateOne(
      { routeChangeRequestId: request.routeChangeRequestId },
      {
        status,
        approvedRouteSessionId,
        resolvedBy: RequestContextStore.getStore()?.userId,
        resolvedAt: new Date(),
      },
      { new: true },
    );

    await this.notificationService.markRouteChangeRequestResolved(
      request.routeChangeRequestId,
      status,
    );
    return updated;
  }

  private async notifyManager(request: RouteChangeRequest) {
    await this.notificationService.create({
      recipientId: request.managerId,
      title: 'Route Change Approval Required',
      body: `${request.userName || 'Salesman'} requested a change from ${request.currentRouteName || request.currentRouteId} to ${request.requestedRouteName || request.requestedRouteId}.`,
      category: 'route_change',
      platforms: [
        NotificationPlatform.ANDROID,
        NotificationPlatform.IOS,
        NotificationPlatform.WEB,
      ],
      data: {
        category: 'route_change',
        action: 'APPROVAL_REQUIRED',
        status: 'PENDING',
        routeChangeRequestId: request.routeChangeRequestId,
        workSessionId: request.workSessionId,
        salesmanId: request.userId,
        salesmanName: request.userName,
        currentRouteId: request.currentRouteId,
        currentRouteName: request.currentRouteName,
        requestedRouteId: request.requestedRouteId,
        requestedRouteName: request.requestedRouteName,
        reason: request.reason,
        route: '/notifications',
      },
    });
  }
}
