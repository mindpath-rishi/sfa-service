import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClientSession, Model } from 'mongoose';
import { RequestContextStore } from 'src/core/context/request-context';
import { FilterQuery } from 'src/core/database/mongo/mongo.interface';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import {
  Customer,
  CustomerSchema,
} from 'src/core/database/mongo/schema/customer.schema';
import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import {
  OutletVerification,
  OutletVerificationSchema,
} from 'src/core/database/mongo/schema/outlet-verification.schema';
import { CustomerStatus } from 'src/shared/enums/customer.enums';
import { OutletVerificationStatus } from 'src/shared/enums/outlet-verification.enums';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { NotificationService } from '../notification/notification.service';
import { CreateOutletVerificationDto } from './dto/create-outlet-verification.dto';
import { OutletVerificationQueryDto } from './dto/outlet-verification-query.dto';
import { UpdateOutletVerificationDto } from './dto/update-outlet-verification.dto';
import { OUTLET_VERIFICATION } from './outlet-verification.constants';

@Injectable()
export class OutletVerificationService extends MongoRepository<OutletVerification> {
  private readonly customerModel: Model<Customer>;
  private readonly employeeModel: Model<Employee>;

  constructor(
    mongo: MongoService,
    private readonly notificationService: NotificationService,
  ) {
    super(mongo.getModel(OutletVerification.name, OutletVerificationSchema));
    this.customerModel = mongo.getModel(Customer.name, CustomerSchema);
    this.employeeModel = mongo.getModel(Employee.name, EmployeeSchema);
  }

  async create(payload: CreateOutletVerificationDto) {
    const requestedByEmployeeId = String(
      RequestContextStore.getStore()?.userId ?? '',
    );
    const verification = await this.createForOutlet(
      payload.customerId,
      requestedByEmployeeId,
    );
    return this.response(
      HttpStatus.CREATED,
      OUTLET_VERIFICATION.CREATED,
      verification,
    );
  }

  async createForOutlet(
    customerId: string,
    requestedByEmployeeId: string,
    session?: ClientSession,
  ) {
    if (!requestedByEmployeeId) {
      throw new BadRequestException('Requesting employee is required');
    }
    const [customer, employee, existing] = await Promise.all([
      this.customerModel.findOne({ customerId, isDeleted: false }).session(session || null),
      this.employeeModel
        .findOne({ employeeId: requestedByEmployeeId, isDeleted: false })
        .session(session || null),
      this.findOne(
        { customerId, status: OutletVerificationStatus.PENDING },
        { session },
      ),
    ]);
    if (!customer) throw new NotFoundException('Outlet not found');
    if (existing) throw new ConflictException(OUTLET_VERIFICATION.DUPLICATE);

    return this.save(
      {
        outletVerificationId: IdGenerator.generate('OVR', 8),
        customerId,
        requestedByEmployeeId,
        requestedByEmployeeName: employee?.name,
        assignedReviewerId: employee?.reportingEmployeeId,
        status: OutletVerificationStatus.PENDING,
      },
      { session },
    );
  }

  async findAll(query: OutletVerificationQueryDto) {
    const { page = 1, limit = 20, ...filters } = query;
    const filter: FilterQuery<OutletVerification> = {};
    Object.assign(filter, filters);
    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });
    return {
      statusCode: HttpStatus.OK,
      message: OUTLET_VERIFICATION.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByOutletId(outletVerificationId: string) {
    const record = await this.findOne({ outletVerificationId }, { lean: true });
    if (!record) throw new NotFoundException(OUTLET_VERIFICATION.NOT_FOUND);
    return this.response(HttpStatus.OK, OUTLET_VERIFICATION.FETCHED, record);
  }

  async update(
    outletVerificationId: string,
    payload: UpdateOutletVerificationDto,
  ) {
    const record = await this.getPending(outletVerificationId);
    const updated = await this.updateOne(
      { outletVerificationId: record.outletVerificationId },
      payload,
      { new: true },
    );
    return this.response(HttpStatus.OK, OUTLET_VERIFICATION.UPDATED, updated);
  }

  async review(
    outletVerificationId: string,
    approve: boolean,
    reason?: string,
  ) {
    const reviewerId = String(RequestContextStore.getStore()?.userId ?? '');
    const record = await this.getPending(outletVerificationId);
    if (!reviewerId || record.assignedReviewerId !== reviewerId) {
      throw new ForbiddenException('Only the assigned reviewer can verify this outlet');
    }

    const verificationStatus = approve
      ? OutletVerificationStatus.APPROVED
      : OutletVerificationStatus.REJECTED;
    const customerStatus = approve
      ? CustomerStatus.ACTIVE
      : CustomerStatus.REJECTED;
    const rejectionReason = approve
      ? undefined
      : reason || 'Rejected by reporting manager';

    await this.customerModel.updateOne(
      { customerId: record.customerId, status: CustomerStatus.VERIFICATION_PENDING },
      { $set: { status: customerStatus } },
    );
    const updated = await this.updateOne(
      { outletVerificationId },
      {
        status: verificationStatus,
        reviewedByEmployeeId: reviewerId,
        reviewedAt: new Date(),
        reason: rejectionReason,
      },
      { new: true },
    );
    await this.notificationService.markOutletApprovalResolved(
      record.customerId,
      customerStatus,
    );
    await this.notificationService.create({
      recipientId: record.requestedByEmployeeId,
      title: approve ? 'Outlet approved' : 'Outlet rejected',
      body: `Your outlet has been ${approve ? 'approved' : 'rejected'}`,
      category: 'outlet_approval_result',
      data: {
        category: 'outlet_approval_result',
        action: customerStatus,
        customerId: record.customerId,
        outletVerificationId,
        status: customerStatus,
        reason: rejectionReason,
        route: '/route',
      },
    });
    return this.response(
      HttpStatus.OK,
      `Outlet ${approve ? 'approved' : 'rejected'}`,
      updated,
    );
  }

  async reviewByCustomerId(customerId: string, approve: boolean, reason?: string) {
    const record = await this.findOne({
      customerId,
      status: OutletVerificationStatus.PENDING,
    });
    if (!record) throw new NotFoundException(OUTLET_VERIFICATION.NOT_FOUND);
    return this.review(record.outletVerificationId, approve, reason);
  }

  async delete(outletVerificationId: string) {
    const record = await this.findOne({ outletVerificationId });
    if (!record) throw new NotFoundException(OUTLET_VERIFICATION.NOT_FOUND);
    await this.softDelete({ outletVerificationId });
    return this.response(HttpStatus.OK, OUTLET_VERIFICATION.DELETED, record);
  }

  private async getPending(outletVerificationId: string) {
    const record = await this.findOne({ outletVerificationId });
    if (!record) throw new NotFoundException(OUTLET_VERIFICATION.NOT_FOUND);
    if (record.status !== OutletVerificationStatus.PENDING) {
      throw new BadRequestException('Outlet verification is already resolved');
    }
    return record;
  }

  private response(statusCode: number, message: string, data: unknown) {
    return { statusCode, message, data };
  }
}
