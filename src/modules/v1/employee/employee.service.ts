/**
 * Employee Service
 * ----------------
 * Purpose : Handles business logic for employee lifecycle management
 * Used by : EmployeeController
 *
 * Responsibilities:
 * - Create employee profiles and linked auth users
 * - Restore soft-deleted employees
 * - Fetch employee lists with filters and pagination
 * - Retrieve single employee profiles
 * - Update employee information
 * - Soft-delete employees and linked users
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Employee and User records are tightly coupled
 * - Soft deletes are used to preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { UserStatus } from 'src/modules/v1/user/user.enum';

import { UserService } from 'src/modules/v1/user/user.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EmployeeQueryDto } from './dto/employee.query.dto';
import { EMPLOYEE } from './employee.constants';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';
import { InjectModel } from '@nestjs/mongoose';
import { Sale } from 'src/core/database/mongo/schema/sale.schema';
import { Payment } from 'src/core/database/mongo/schema/payment.schema';
import { Model } from 'mongoose';
import { ShopVisit } from 'src/core/database/mongo/schema/shop-visit.schema';
import { ShopVisitStatus } from 'src/shared/enums/shop-visit.enums';

@Injectable()
export class EmployeeService extends MongoRepository<Employee> {
  constructor(
    mongo: MongoService,
    private readonly userService: UserService,
    @InjectModel(Sale.name)
    private readonly saleModal: Model<Sale>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<Payment>,
    @InjectModel(ShopVisit.name)
    private readonly shopVisitModel: Model<ShopVisit>,
  ) {
    super(mongo.getModel(Employee.name, EmployeeSchema));
  }

  /**
   * Create Employee
   * ---------------
   * Purpose : Create a new employee profile and linked authentication user
   *
   * Flow:
   * - Check for existing employee (including soft-deleted)
   * - Restore soft-deleted employee if found
   * - Generate unique employeeId
   * - Create employee profile
   * - Create linked auth user
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active employees
   */
  async create(payload: CreateEmployeeDto) {
    return this.withTransaction(async (session) => {
      // Check existing employee (including soft-deleted)
      const existingEmployee = await this.findOne(
        {
          $or: [{ mobile: payload.mobile }, { email: payload.email }],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active employees
      if (existingEmployee && !existingEmployee.isDeleted) {
        throw new ConflictException(EMPLOYEE.DUPLICATE);
      }

      // Restore soft-deleted employee and linked user
      if (existingEmployee?.isDeleted) {
        await this.updateById(
          existingEmployee._id.toString(),
          {
            name: payload.name,
            roleId: payload.roleId,
            permissionOverrides: payload.permissionOverrides
              ? {
                  allow: payload.permissionOverrides.allow || [],
                  deny: payload.permissionOverrides.deny || [],
                }
              : undefined,
            status: UserStatus.ACTIVE,
            isDeleted: false,
          },
          { session },
        );

        await this.userService.restoreUser(
          {
            profileId: existingEmployee.employeeId,
            mobile: payload.mobile,
            email: payload.email,
            password: payload.password,
            isDeleted: false,
            status: UserStatus.ACTIVE,
            loginId: payload.loginId,
          },
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: EMPLOYEE.CREATED,
          data: { employeeId: existingEmployee.employeeId },
        };
      }

      // Generate unique business employeeId
      const MAX_TRIES = 10;
      let employeeId = '';

      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        employeeId = IdGenerator.generate('EID', 8);
        if (!(await this.exists({ employeeId }, session))) break;

        if (attempt === MAX_TRIES) {
          throw new ConflictException(
            'Unable to generate unique employeeId. Try again.',
          );
        }
      }

      // Create employee profile
      const employee = await this.save(
        {
          employeeId,
          mobile: payload.mobile,
          name: payload.name,
          email: payload.email,
          roleId: payload.roleId,
          permissionOverrides: payload.permissionOverrides
            ? {
                allow: payload.permissionOverrides.allow || [],
                deny: payload.permissionOverrides.deny || [],
              }
            : undefined,
          status: UserStatus.ACTIVE,
        },
        { session },
      );

      // Create linked authentication user
      await this.userService.createUser(
        {
          profileId: employeeId,
          mobile: payload.mobile,
          email: payload.email,
          password: payload.password,
          loginId: payload.loginId,
        },
        session,
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: EMPLOYEE.CREATED,
        data: employee,
      };
    });
  }

  /**
   * Get Employees (List)
   * -------------------
   * Purpose : Retrieve employees with filtering and pagination
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Pagination & sorting
   */
  async findAll(query: EmployeeQueryDto) {
    const { status, searchText, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

    if (status) {
      filter.status = status;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { employeeId: regex },
        { name: regex },
        { mobile: regex },
        { email: regex },
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
      message: EMPLOYEE.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Employee by ID
   * ------------------
   * Purpose : Retrieve a single employee profile
   *
   * Throws:
   * - NotFoundException if employee does not exist
   */
  async findByEmployeeId(employeeId: string) {
    const employee = await this.findOne({ employeeId }, { lean: true });

    if (!employee) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.FETCHED,
      data: employee,
    };
  }

  /**
   * Update Employee
   * ---------------
   * Purpose : Update editable employee profile fields
   *
   * Notes:
   * - Identity fields remain unchanged
   */
  async update(employeeId: string, dto: UpdateEmployeeDto) {
    const employee = await this.updateOne({ employeeId }, dto);

    if (!employee) {
      throw new NotFoundException(EMPLOYEE.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.UPDATED,
      data: employee,
    };
  }

  /**
   * Delete Employee (Soft Delete)
   * -----------------------------
   * Purpose : Deactivate employee and linked authentication user
   *
   * Flow:
   * - Soft-delete employee record
   * - Soft-delete linked auth user
   *
   * Notes:
   * - Operation is transactional
   * - Records remain for audit purposes
   */
  async delete(employeeId: string) {
    const deletedEmployee = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { employeeId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(EMPLOYEE.NOT_FOUND);
      }

      await this.softDelete({ employeeId }, { session });
      await this.userService.delete(employeeId, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.DELETED,
      data: deletedEmployee,
    };
  }

  async getEmployeeStats(employeeId: string) {
    // 📅 Get start & end of today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const dateFilter = {
      createdAt: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    };

    const [visitData, salesData, collectionData] = await Promise.all([
      // 🏪 Shop Visits (Today)
      this.shopVisitModel.aggregate([
        {
          $match: {
            employeeId,
            ...dateFilter,
            status: ShopVisitStatus.COMPLETED,
          },
        },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: 1 },
          },
        },
      ]),

      // 🧾 Sales Orders (Today)
      this.saleModal.aggregate([
        { $match: { employeeId, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalOrderValue: { $sum: '$totalValue' },
          },
        },
      ]),

      // 💰 Payment Collections (Today)
      this.paymentModel.aggregate([
        { $match: { employeeId, ...dateFilter } },
        {
          $group: {
            _id: null,
            totalCollections: { $sum: 1 },
            totalCollectionValue: { $sum: '$amount' },
          },
        },
      ]),
    ]);

    return {
      statusCode: 200,
      message: 'Today employee stats fetched successfully',
      data: {
        visits: visitData[0]?.totalVisits || 0,

        orders: {
          count: salesData[0]?.totalOrders || 0,
          value: salesData[0]?.totalOrderValue || 0,
        },

        collections: {
          count: collectionData[0]?.totalCollections || 0,
          value: collectionData[0]?.totalCollectionValue || 0,
        },
      },
    };
  }
}
