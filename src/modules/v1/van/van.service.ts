/**
 * Van Service
 * -----------
 * Purpose : Handles business logic for van lifecycle management
 * Used by : VanController
 *
 * Responsibilities:
 * - Create van master records
 * - Restore soft-deleted vans
 * - Fetch vans with filters and pagination
 * - Retrieve single van details
 * - Update van information
 * - Soft-delete vans
 *
 * Notes:
 * - All write operations are transaction-safe
 * - Van master acts as source of truth
 * - Soft deletes preserve audit history
 */

import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';

import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';

import { Van, VanSchema } from 'src/core/database/mongo/schema/van.schema';
import { CreateVanDto } from './dto/create-van.dto';
import { UpdateVanDto } from './dto/update-van.dto';
import { VanQueryDto } from './dto/van-query.dto';
import { VAN } from './van.constants';
import { RequestContextStore } from 'src/core/context/request-context';
import { VanStatus } from 'src/shared/enums/van.enums';

@Injectable()
export class VanService extends MongoRepository<Van> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Van.name, VanSchema));
  }

  /**
   * Create Van
   * ----------
   * Purpose : Create new van or restore soft-deleted van
   *
   * Flow:
   * - Check for existing van (including soft-deleted)
   * - Restore soft-deleted van if found
   * - Create new van if not exists
   *
   * Notes:
   * - Operation is fully transactional
   * - Prevents duplicate active vans
   */
  async create(payload: CreateVanDto) {
    return this.withTransaction(async (session) => {
      // Check existing van (including soft-deleted)
      const existing = await this.findOne(
        {
          $or: [{ vanId: payload.vanId }, { vanNumber: payload.vanNumber }],
        },
        { session, includeDeleted: true },
      );

      // Prevent duplicate active van
      if (existing && !existing.isDeleted) {
        throw new ConflictException(VAN.DUPLICATE);
      }

      // Restore soft-deleted van
      if (existing?.isDeleted) {
        await this.updateById(
          existing._id.toString(),
          {
            ...payload,
            status: 'ACTIVE',
            isDeleted: false,
          },
          { session },
        );

        return {
          statusCode: HttpStatus.OK,
          message: VAN.CREATED,
          data: { vanId: existing.vanId },
        };
      }

      // Create new van
      const van = await this.save(
        {
          ...payload,
        },
        { session },
      );

      return {
        statusCode: HttpStatus.CREATED,
        message: VAN.CREATED,
        data: van,
      };
    });
  }

  /**
   * Get Vans (List)
   * --------------
   * Purpose : Retrieve vans with filtering and pagination
   *
   * Supports:
   * - Status-based filtering
   * - Free-text search
   * - Pagination & sorting
   */
  async findAll(query: VanQueryDto) {
    const cxt = RequestContextStore.getStore();
    const userId = cxt?.userId;

    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {
      associatedUsers: { $in: [userId] },
    };

    if (status) {
      filter.status = status;
    }

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [{ vanId: regex }, { name: regex }, { vanNumber: regex }];
    }

    const result = await this.paginate(filter, {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  async findByVanId(vanId: string) {
    const today = new Date();

    const pipeline: any[] = [
      { $match: { vanId } },

      {
        $unwind: {
          path: '$associatedRoutes',
          preserveNullAndEmptyArrays: true,
        },
      },

      /**
       * ✅ lookup route
       */
      {
        $lookup: {
          from: 'route_master',
          let: { routeId: '$associatedRoutes.routeId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$routeId', '$$routeId'] },
              },
            },
            {
              $project: {
                _id: 0,
                routeId: 1,
                name: 1,
                day: 1,
                distance: 1,
                status: 1,
              },
            },
          ],
          as: 'route',
        },
      },

      {
        $addFields: {
          route: { $arrayElemAt: ['$route', 0] },
        },
      },

      /**
       * ✅ active flag
       */
      {
        $addFields: {
          isActive: {
            $and: [
              { $lte: ['$associatedRoutes.fromDate', today] },
              { $gte: ['$associatedRoutes.toDate', today] },
            ],
          },
        },
      },

      /**
       * 🚀 REMOVE DUPLICATES HERE (KEY FIX)
       */
      {
        $group: {
          _id: {
            vanId: '$vanId',
            routeId: '$associatedRoutes.routeId',
          },

          vanId: { $first: '$vanId' },
          name: { $first: '$name' },
          vanNumber: { $first: '$vanNumber' },
          capacity: { $first: '$capacity' },
          madeYear: { $first: '$madeYear' },
          associatedUsers: { $first: '$associatedUsers' },
          status: { $first: '$status' },

          routeData: {
            $first: {
              routeId: '$associatedRoutes.routeId',
              fromDate: '$associatedRoutes.fromDate',
              toDate: '$associatedRoutes.toDate',
              isActive: '$isActive',
              route: '$route',
            },
          },
        },
      },

      /**
       * ✅ regroup by van
       */
      {
        $group: {
          _id: '$vanId',
          vanId: { $first: '$vanId' },
          name: { $first: '$name' },
          vanNumber: { $first: '$vanNumber' },
          capacity: { $first: '$capacity' },
          madeYear: { $first: '$madeYear' },
          associatedUsers: { $first: '$associatedUsers' },
          status: { $first: '$status' },

          routes: {
            $push: '$routeData',
          },
        },
      },

      /**
       * ✅ active route
       */
      {
        $addFields: {
          activeRoute: {
            $first: {
              $filter: {
                input: '$routes',
                as: 'r',
                cond: { $eq: ['$$r.isActive', true] },
              },
            },
          },
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);
    const doc = result?.[0];

    if (!doc) {
      throw new NotFoundException(VAN.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: doc,
    };
  }

  /**
   * Update Van
   * ----------
   * Purpose : Update editable van master fields
   *
   * Notes:
   * - Identity fields remain unchanged
   */
  async update(vanId: string, dto: UpdateVanDto) {
    const van = await this.updateOne({ vanId }, dto);

    if (!van) {
      throw new NotFoundException(VAN.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN.UPDATED,
      data: van,
    };
  }

  /**
   * Delete Van (Soft Delete)
   * -----------------------
   * Purpose : Soft delete van
   *
   * Flow:
   * - Validate existing van
   * - Mark van as deleted
   *
   * Notes:
   * - Records remain for audit purposes
   */
  async delete(vanId: string) {
    const deletedVan = await this.withTransaction(async (session) => {
      const existing = await this.findOne(
        { vanId, isDeleted: false },
        { session },
      );

      if (!existing) {
        throw new NotFoundException(VAN.NOT_FOUND);
      }

      await this.softDelete({ vanId }, { session });

      return existing;
    });

    return {
      statusCode: HttpStatus.OK,
      message: VAN.DELETED,
      data: deletedVan,
    };
  }

  async getVanMappedRoutes() {
    const ctx: any = RequestContextStore.getStore();
    const userId = ctx?.userId;

    const today = new Date();

    const pipeline: any[] = [
      /**
       * ✅ Match vans for logged-in user
       */
      {
        $match: {
          associatedUsers: { $in: [userId] },
          status: VanStatus.ACTIVE,
        },
      },

      /**
       * ✅ Unwind routes
       */
      {
        $unwind: {
          path: '$associatedRoutes',
          preserveNullAndEmptyArrays: false,
        },
      },

      /**
       * ✅ Lookup route details
       */
      {
        $lookup: {
          from: 'route_master',
          localField: 'associatedRoutes.routeId',
          foreignField: 'routeId',
          as: 'route',
        },
      },

      /**
       * ✅ Convert route array → object
       */
      {
        $addFields: {
          route: { $arrayElemAt: ['$route', 0] },
        },
      },

      /**
       * ✅ Calculate active flag
       */
      {
        $addFields: {
          isActive: {
            $and: [
              { $lte: ['$associatedRoutes.fromDate', today] },
              { $gte: ['$associatedRoutes.toDate', today] },
            ],
          },
        },
      },

      /**
       * ✅ Shape flat structure before grouping
       */
      {
        $project: {
          _id: 0,
          vanId: '$vanId',
          vanName: '$name',
          vanNumber: '$vanNumber',
          status: '$status',
          routeId: '$associatedRoutes.routeId',
          fromDate: '$associatedRoutes.fromDate',
          toDate: '$associatedRoutes.toDate',
          isActive: 1,
          route: {
            routeId: '$route.routeId',
            name: '$route.name',
            distance: '$route.distance',
            day: '$route.day',
            status: '$route.status',
            associatedUsers: '$associatedUsers',
          },
        },
      },

      /**
       * 🚀 Group by van (MAIN FIX)
       */
      {
        $group: {
          _id: '$vanId',
          vanName: { $first: '$vanName' },
          vanId: { $first: '$vanId' },
          vanNumber: { $first: '$vanNumber' },
          status: { $first: '$status' },
          routes: {
            $push: {
              routeId: '$routeId',
              fromDate: '$fromDate',
              toDate: '$toDate',
              isActive: '$isActive',
              route: '$route',
            },
          },
        },
      },

      /**
       * ✅ Final response shape
       */
      {
        $project: {
          _id: 0,
          vanName: 1,
          vanId: 1,
          vanNumber: 1,
          status: 1,
          routes: 1,
          associatedUsers: '$associatedUsers',
        },
      },
    ];

    const result = await this.model.aggregate(pipeline);

    if (!result || result.length === 0) {
      throw new NotFoundException(VAN.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: result[0],
    };
  }
}
