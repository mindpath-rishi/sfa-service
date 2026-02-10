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
    const { searchText, status, page = 1, limit = 20 } = query;

    const filter: Record<string, any> = {};

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

  /**
   * Get Van by ID
   * -------------
   * Purpose : Retrieve a single van record
   *
   * Throws:
   * - NotFoundException if van does not exist
   */
  async findByVanId(vanId: string) {
    const van = await this.findOne({ vanId }, { lean: true });

    if (!van) {
      throw new NotFoundException(VAN.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: VAN.FETCHED,
      data: van,
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
}
