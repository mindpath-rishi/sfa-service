/**
 * Media Service
 * -------------
 * Purpose : Handles all business logic related to media management
 * Used by : MediaController
 *
 * Responsibilities:
 * - Media creation & updates
 * - File upload & replacement
 * - Duplicate detection using checksum
 * - Upload limit enforcement
 * - Storage cleanup (hard delete / replace)
 *
 * Notes:
 * - This service owns all business rules
 * - MediaUtil is used for reusable, stateless helpers
 * - Storage operations are centralized here
 */

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  HttpStatus,
  Inject,
} from '@nestjs/common';

import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { IdGenerator } from 'src/shared/utils/id-generator.utils';

import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaQueryDto } from './dto/media-query.dto';
import { UploadMediaDto } from './dto/upload-media.dto';

import {
  Media,
  MediaSchema,
} from 'src/core/database/mongo/schema/media.schema';

import {
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

import { ChecksumUtil } from 'src/shared/utils/checksum.utils';

import { STORAGE_PROVIDER } from 'src/core/storage/storage.module';
import type { StorageProvider } from 'src/core/storage/storage.interface';
import { MediaUtil } from './dto/media.utils';
import { MEDIA } from './media.constants';

@Injectable()
export class MediaService extends MongoRepository<Media> {
  constructor(
    mongo: MongoService,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {
    super(mongo.getModel(Media.name, MediaSchema));
  }

  /**
   * Create Media Record
   * -------------------
   * Purpose : Persist media metadata in database
   *
   * Handles:
   * - Primary media enforcement (only one primary per group)
   * - Media ID generation
   *
   * Notes:
   * - Called after successful file upload
   */
  async create(dto: any, user?: any) {
    if (dto.isPrimary) {
      await this.updateMany(
        {
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          subOwnerId: dto.subOwnerId ?? null,
          purpose: dto.purpose ?? MEDIA_PURPOSE.OTHER,
          isDeleted: false,
          isPrimary: true,
        },
        { isPrimary: false },
      );
    }

    const media = await this.save({
      mediaId: IdGenerator.generate('MID'),
      ...dto,
      isDeleted: false,
      createdById: user?.userId ?? null,
    });

    return {
      statusCode: HttpStatus.CREATED,
      message: MEDIA.CREATED,
      data: media,
    };
  }

  /**
   * Upload File + Create Media
   * --------------------------
   * Purpose : Handle full media upload flow
   *
   * Flow:
   * - Calculate checksum
   * - Detect duplicate media
   * - Enforce upload limits
   * - Upload file to storage
   * - Create DB record
   *
   * Notes:
   * - Duplicate detection is checksum-based
   * - Limits depend on owner + purpose + type
   */
  async uploadAndCreate(
    file: Express.Multer.File,
    body: UploadMediaDto,
    user?: any,
  ) {
    const ownerType = body.ownerType;
    const ownerId = body.ownerId;
    const subOwnerId = body.subOwnerId ?? null;

    const mediaType = body.mediaType ?? MEDIA_TYPE.IMAGE;
    const purpose = body.purpose ?? MEDIA_PURPOSE.OTHER;
    const isPrimary = MediaUtil.parseIsPrimary(body.isPrimary);

    // checksum
    const checksum = ChecksumUtil.fromFile(file);

    // duplicate check
    const duplicate = await this.findDuplicateByChecksum({
      ownerType,
      ownerId,
      subOwnerId,
      mediaType,
      purpose,
      checksum,
    });

    if (duplicate) {
      throw new BadRequestException({
        message: MEDIA.DUPLICATE,
        data: duplicate,
      });
    }

    // limit validation
    await MediaUtil.validateLimit({
      mediaService: this,
      ownerType,
      ownerId,
      subOwnerId,
      purpose,
      mediaType,
    });

    // upload to storage
    const uploaded = await this.storage.upload({
      file,
      folder: MediaUtil.buildFolder(ownerType),
      generateVariants: MediaUtil.shouldGenerateVariants(ownerType, mediaType),
      mediaType,
    });

    return this.create(
      {
        ...body,
        mediaType,
        purpose,
        isPrimary,
        storageKey: uploaded.storageKey,
        url: uploaded.url,
        urls: uploaded.urls,
        meta: {
          ...(uploaded.meta || {}),
          checksum,
        },
      },
      user,
    );
  }

  /**
   * Get Media List
   * --------------
   * Purpose : Fetch paginated media records
   *
   * Supports:
   * - Pagination
   * - Search by text
   * - Owner / type / purpose filtering
   */
  async findAll(query: MediaQueryDto) {
    const { page = 1, limit = 20, searchText, ...rest } = query;

    const filter: any = { isDeleted: false, ...rest };

    if (searchText) {
      const regex = new RegExp(searchText, 'i');
      filter.$or = [
        { mediaId: regex },
        { storageKey: regex },
        { url: regex },
        { 'meta.fileName': regex },
      ];
    }

    const result = await this.paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { isPrimary: -1, sortOrder: 1 },
      lean: true,
    });

    return {
      statusCode: HttpStatus.OK,
      message: MEDIA.FETCHED,
      data: result.items,
      meta: result.meta,
    };
  }

  /**
   * Get Media by ID
   * ---------------
   * Purpose : Fetch single media record
   */
  async findByMediaId(mediaId: string) {
    const media = await this.findOne(
      { mediaId, isDeleted: false },
      { lean: true },
    );

    if (!media) throw new NotFoundException(MEDIA.NOT_FOUND);

    return {
      statusCode: HttpStatus.OK,
      message: MEDIA.FETCHED,
      data: media,
    };
  }

  /**
   * Update Media
   * ------------
   * Purpose : Update metadata and optionally replace file
   *
   * Handles:
   * - Group limit validation
   * - File replacement with checksum check
   * - Metadata updates
   */
  async updateMedia(
    mediaId: string,
    dto: UpdateMediaDto,
    file?: Express.Multer.File,
    user?: any,
  ) {
    const existing = await this.findOne(
      { mediaId, isDeleted: false },
      { lean: true },
    );

    if (!existing) throw new NotFoundException(MEDIA.NOT_FOUND);

    const nextMediaType = dto.mediaType ?? existing.mediaType;
    const nextPurpose = dto.purpose ?? existing.purpose;

    await MediaUtil.validateLimit({
      mediaService: this,
      ownerType: existing.ownerType,
      ownerId: existing.ownerId,
      subOwnerId: existing.subOwnerId ?? null,
      purpose: nextPurpose,
      mediaType: nextMediaType,
      ignoreMediaId: mediaId,
    });

    const payload: any = {
      ...dto,
      mediaType: nextMediaType,
      purpose: nextPurpose,
      updatedById: user?.userId ?? null,
    };

    if (file) {
      await this.replaceFile(
        existing,
        file,
        nextMediaType,
        nextPurpose,
        mediaId,
      );

      payload.storageKey = existing.storageKey;
      payload.url = existing.url;
      payload.urls = existing.urls;
      payload.meta = existing.meta;
    }

    return this.updateOne({ mediaId }, payload, user);
  }

  /**
   * Hard Delete Media
   * -----------------
   * Purpose : Permanently remove media from DB and storage
   */
  async hardDelete(mediaId: string) {
    const media = await this.findOne(
      { mediaId, isDeleted: false },
      { lean: true },
    );

    if (!media) throw new NotFoundException(MEDIA.NOT_FOUND);

    await this.deleteFromStorage(media);
    await this.deleteDocument({ mediaId });

    return {
      statusCode: HttpStatus.OK,
      message: 'Media deleted successfully',
    };
  }

  /**
   * Delete Files from Storage
   * -------------------------
   * Purpose : Remove original file and variants
   *
   * Notes:
   * - Errors are swallowed to avoid blocking DB cleanup
   */
  private async deleteFromStorage(media: any) {
    try {
      if (media.storageKey) {
        await this.storage.delete({ storageKey: media.storageKey });
      }

      if (media.urls) {
        for (const url of Object.values(media.urls)) {
          const key = String(url).replace('/uploads/', '');
          await this.storage.delete({ storageKey: key });
        }
      }
    } catch {}
  }

  /**
   * Find Duplicate Media by Checksum
   * --------------------------------
   * Purpose : Prevent duplicate file uploads
   */
  async findDuplicateByChecksum(params: any) {
    const { checksum, ...rest } = params;

    return this.findOne(
      {
        ...rest,
        isDeleted: false,
        'meta.checksum': checksum,
      },
      { lean: true },
    );
  }

  /**
   * Replace Media File
   * ------------------
   * Purpose : Replace existing file with a new one
   *
   * Flow:
   * - Calculate checksum
   * - Detect duplicates
   * - Delete old storage files
   * - Upload new file
   * - Update in-memory media object
   */
  private async replaceFile(
    media: any,
    file: Express.Multer.File,
    mediaType: string,
    purpose: string,
    mediaId: string,
  ) {
    const { ownerType, ownerId, subOwnerId = null } = media;

    const checksum = ChecksumUtil.fromFile(file);

    const duplicate = await this.findDuplicateByChecksum({
      ownerType,
      ownerId,
      subOwnerId,
      mediaType,
      purpose,
      checksum,
      mediaId,
    });

    if (duplicate) {
      throw new BadRequestException(MEDIA.DUPLICATE_CHECKSUM);
    }

    await this.deleteFromStorage(media);

    const uploaded = await this.storage.upload({
      file,
      folder: MediaUtil.buildFolder(ownerType),
      generateVariants: MediaUtil.shouldGenerateVariants(ownerType, mediaType),
      mediaType,
    });

    media.storageKey = uploaded.storageKey;
    media.url = uploaded.url;
    media.urls = uploaded.urls;
    media.meta = {
      ...(uploaded.meta || {}),
      checksum,
    };
  }
}
