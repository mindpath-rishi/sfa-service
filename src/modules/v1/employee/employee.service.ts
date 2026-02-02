import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import {
  Employee,
  EmployeeSchema,
} from 'src/core/database/mongo/schema/employee.schema';
import { UserStatus, Agent } from 'src/modules/v1/user/user.enum';

import { UserService } from 'src/modules/v1/user/user.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { EMPLOYEE } from './employee.constants';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

type FindAllEmployeesQuery = {
  status?: string;
  searchText?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class EmployeeService extends MongoRepository<Employee> {
  constructor(
    mongo: MongoService,
    private readonly userService: UserService,
  ) {
    super(mongo.getModel(Employee.name, EmployeeSchema));
  }

  /**
   * Creates an employee profile and linked user account in a single transaction.
   *
   * Behavior:
   * - If active employee exists (same mobile/email) -> conflict
   * - If soft-deleted employee exists -> restore employee + restore user
   * - Otherwise -> create new employee + create new user
   */
  async create(payload: CreateEmployeeDto) {
    return this.withTransaction(async (session) => {
      // Lookup existing employee (including deleted)
      const existingEmployee: Employee | any = await this.findOne(
        {
          $or: [{ mobile: payload.mobile }, { email: payload.email }],
        },
        { session, includeDeleted: true },
      );

      // Active employee already exists
      if (existingEmployee && !existingEmployee.isDeleted) {
        throw new ConflictException(EMPLOYEE.DUPLICATE);
      }

      // Restore soft-deleted employee
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
          },
          session,
        );

        return {
          statusCode: HttpStatus.OK,
          message: EMPLOYEE.CREATED,
          data: { employeeId: existingEmployee.employeeId },
        };
      }

      // Generate unique employeeId
      const MAX_TRIES = 10;
      let employeeId = '';

      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        employeeId = IdGenerator.generate('EID', 8);

        const exists = await this.exists({ employeeId }, session);
        if (!exists) break;

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

      // Create linked user account
      await this.userService.createUser(
        {
          profileId: employeeId,
          mobile: payload.mobile,
          email: payload.email,
          password: payload.password,
          agent: Agent.BACK_OFFICE,
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
   * Returns paginated list of employees with optional status filter and search.
   */
  async findAll(query: FindAllEmployeesQuery = {}) {
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
   * Returns employee details by employeeId.
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
   * Updates employee profile.
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
   * Soft-deletes employee profile and linked user account inside a transaction.
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

      // Linked user delete (profileId = employeeId)
      await this.userService.delete(employeeId, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: EMPLOYEE.DELETED,
      data: deletedEmployee,
    };
  }
}
