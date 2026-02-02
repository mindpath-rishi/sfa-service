import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';

import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaQueryDto } from './dto/media-query.dto';
import {
  Media,
  MediaSchema,
} from 'src/core/database/mongo/schema/media.schema';

@Injectable()
export class MediaService extends MongoRepository<Media> {
  constructor(mongo: MongoService) {
    super(mongo.getModel(Media.name, MediaSchema));
  }

  /* ================= CREATE ================= */

  async create(dto: any, user?: any) {
    // ✅ Ensure only one primary for same scope
    if (dto.isPrimary) {
      await this.updateMany(
        {
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          subOwnerId: dto.subOwnerId ?? null,
          purpose: dto.purpose ?? 'OTHER',
          isDeleted: false,
          isPrimary: true,
        },
        { isPrimary: false },
      );
    }

    const media = await this.save({
      mediaId: IdGenerator.generate('MID'),

      ownerType: dto.ownerType,
      ownerId: dto.ownerId,
      subOwnerId: dto.subOwnerId ?? null,

      mediaType: dto.mediaType ?? 'IMAGE',
      purpose: dto.purpose ?? 'OTHER',

      storageKey: dto.storageKey,
      url: dto.url,

      urls: dto.urls ?? {},
      sortOrder: dto.sortOrder ?? 1,
      isPrimary: dto.isPrimary ?? false,

      meta: dto.meta ?? {},
      isDeleted: false,

      createdById: user?.userId ?? null,
      updatedById: user?.userId ?? null,
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: 'Media created successfully',
      data: media,
    };
  }

  /* ================= GET ALL ================= */

  async findAll(query: MediaQueryDto) {
    const {
      page = 1,
      limit = 20,
      ownerType,
      ownerId,
      subOwnerId,
      purpose,
      mediaType,
      searchText,
    } = query;

    const filter: any = { isDeleted: false };

    if (ownerType) filter.ownerType = ownerType;
    if (ownerId) filter.ownerId = ownerId;
    if (subOwnerId) filter.subOwnerId = subOwnerId;
    if (purpose) filter.purpose = purpose;
    if (mediaType) filter.mediaType = mediaType;

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { mediaId: regex },
        { storageKey: regex },
        { url: regex },
        { 'meta.fileName': regex },
        { 'meta.mimeType': regex },
      ];
    }

    const result = await this.paginate(filter, {
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      sort: { isPrimary: -1, sortOrder: 1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: 'Media fetched successfully',
      data: result.items,
      meta: result.meta,
    };
  }

  /* ================= GET ONE ================= */

  async findByMediaId(mediaId: string) {
    const media = await this.findOne(
      { mediaId, isDeleted: false },
      { lean: true },
    );

    if (!media) throw new NotFoundException('Media not found');

    return {
      statusCode: HttpStatus.OK,
      message: 'Media fetched successfully',
      data: media,
    };
  }

  /* ================= UPDATE ================= */

  async update(mediaId: string, dto: UpdateMediaDto, user?: any) {
    const existing = await this.findOne(
      { mediaId, isDeleted: false },
      { lean: true },
    );

    if (!existing) throw new NotFoundException('Media not found');

    // ✅ Ensure only one primary after update
    if (dto.isPrimary === 'true') {
      await this.updateMany(
        {
          ownerType: existing.ownerType,
          ownerId: existing.ownerId,
          subOwnerId: existing.subOwnerId ?? null,
          purpose: dto.purpose ?? existing.purpose,
          isDeleted: false,
          isPrimary: true,
          mediaId: { $ne: mediaId },
        } as any,
        { isPrimary: false },
      );
    }

    const updated = await this.updateOne({ mediaId }, {
      ...dto,
      updatedById: user?.userId ?? null,
    } as any);

    if (!updated) throw new NotFoundException('Media not found');

    return {
      statusCode: HttpStatus.OK,
      message: 'Media updated successfully',
      data: updated,
    };
  }

  /* ================= DELETE (SOFT) ================= */

  async delete(mediaId: string, user?: any) {
    const success = await this.deleteDocument({ mediaId });

    if (!success) throw new NotFoundException('Media not found');

    return {
      statusCode: HttpStatus.OK,
      message: 'Media deleted successfully',
    };
  }

  async findDuplicateByChecksum(params: {
    ownerType: string;
    ownerId: string;
    subOwnerId?: string | null;
    mediaType: string;
    purpose?: string;
    checksum: string;
  }) {
    const {
      ownerType,
      ownerId,
      subOwnerId = null,
      mediaType,
      purpose,
      checksum,
    } = params;

    return this.findOne(
      {
        ownerType,
        ownerId,
        subOwnerId,
        mediaType,
        ...(purpose ? { purpose } : {}),
        isDeleted: false,
        'meta.checksum': checksum,
      },
      { lean: true },
    );
  }
}
