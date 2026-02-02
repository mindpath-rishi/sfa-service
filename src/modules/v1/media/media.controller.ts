import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  UploadedFile,
  UseInterceptors,
  Inject,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { ApiInternalErrorResponse } from 'src/core/swagger/api-error.response.swagger';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';

import { MediaQueryDto } from './dto/media-query.dto';
import { UploadMediaDto } from './dto/upload-media.dto';
import { UpdateMediaDto } from './dto/update-media.dto';
import { MediaService } from './media.service';

import { STORAGE_PROVIDER } from 'src/core/storage/storage.module';
import type { StorageProvider } from 'src/core/storage/storage.interface';
import { Public } from 'src/core/decorators/public.decorator';

import {
  MEDIA_OWNER_TYPE,
  MEDIA_PURPOSE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

import { ChecksumUtil } from 'src/shared/utils/checksum.utils';
import { MediaLimitUtil } from 'src/shared/utils/media-limit.utils';

@Public()
@ApiTags('Media')
@FeatureFlag(API_MODULE_ENABLE_KEYS.MEDIA)
@ApiUnauthorizedResponse()
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@Controller({
  path: API_MODULE.MEDIA,
  version: V1,
})
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,

    @Inject(STORAGE_PROVIDER)
    private readonly storage: StorageProvider,
  ) {}

  /* ======================================================
   * UPLOAD FILE + CREATE MEDIA RECORD
   * - ✅ Duplicate check by checksum
   * - ✅ Enforce limit by (ownerType + ownerId + purpose + mediaType)
   * ====================================================== */

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload file and create media record' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadMediaDto })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadMediaDto,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const ownerType = body.ownerType;
    const ownerId = body.ownerId;
    const subOwnerId = body.subOwnerId ?? null;

    const mediaType = body.mediaType ?? MEDIA_TYPE.IMAGE;
    const purpose = body.purpose ?? MEDIA_PURPOSE.OTHER;

    const folder = `media/${String(ownerType).toLowerCase()}`;

    const isProductImage =
      mediaType === MEDIA_TYPE.IMAGE &&
      [
        MEDIA_OWNER_TYPE.PRODUCT,
        MEDIA_OWNER_TYPE.VARIANT,
        MEDIA_OWNER_TYPE.CATEGORY,
      ].includes(ownerType as any);

    const isPrimary = String(body.isPrimary).toLowerCase() === 'true';

    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof body.tags === 'string'
        ? body.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

    // ✅ checksum
    const checksum = ChecksumUtil.fromFile(file);

    // ✅ duplicate check
    const existingDuplicate = await this.mediaService.findDuplicateByChecksum({
      ownerType,
      ownerId,
      subOwnerId,
      mediaType,
      purpose,
      checksum,
    });

    if (existingDuplicate) {
      return {
        statusCode: HttpStatus.OK,
        message: 'Duplicate media found. Existing record returned.',
        data: existingDuplicate,
      };
    }

    // ✅ limit check
    const limit = MediaLimitUtil.getLimit({
      ownerType,
      purpose,
      mediaType,
    });

    const existingMediaList: any = await this.mediaService.findAll({
      ownerType,
      ownerId,
      subOwnerId,
      purpose,
      mediaType,
      isDeleted: false,
    } as any);

    if (existingMediaList?.data?.length >= limit) {
      throw new ForbiddenException(
        `Upload limit reached. Max allowed = ${limit} for ${ownerType} + ${purpose}. Please delete an existing media and retry.`,
      );
    }

    // ✅ upload
    const uploaded = await this.storage.upload({
      file,
      folder,
      generateVariants: isProductImage,
      mediaType
    });

    // ✅ create
    return this.mediaService.create(
      {
        ownerType,
        ownerId,
        subOwnerId,

        mediaType,
        purpose,

        title: body.title,
        description: body.description,
        altText: body.altText,
        navigationUrl: body.navigationUrl,
        tags,

        sortOrder: Number(body.sortOrder) || 1,
        isPrimary,

        storageKey: uploaded.storageKey,
        url: uploaded.url,
        urls: uploaded.urls,

        meta: {
          ...(uploaded.meta || {}),
          checksum,
        },
      } as any,
      req.user,
    );
  }

  /* ======================================================
   * GET MEDIA LIST
   * ====================================================== */

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get media records' })
  findAll(@Query() query: MediaQueryDto) {
    return this.mediaService.findAll({
      ...query,
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 20,
    } as any);
  }

  /* ======================================================
   * GET MEDIA BY ID
   * ====================================================== */

  @Get(':mediaId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get media by mediaId' })
  @ApiParam({ name: 'mediaId', example: 'MID-001' })
  findOne(@Param('mediaId') mediaId: string) {
    return this.mediaService.findByMediaId(mediaId);
  }

  /* ======================================================
   * UPDATE MEDIA (FIELDS + OPTIONAL FILE REPLACE)
   * - ✅ Can change purpose & mediaType
   * - ✅ If file upload: delete old file first then upload new
   * - ✅ Product-like image: generate variants urls
   * ====================================================== */

  @Patch(':mediaId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update media (fields + optional file replace)' })
  @ApiParam({ name: 'mediaId', example: 'MID-001' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateMediaDto })
  @UseInterceptors(FileInterceptor('file'))
  async update(
    @Param('mediaId') mediaId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UpdateMediaDto,
    @Req() req: any,
  ) {
    // ✅ 1) Load existing media
    const existing = await this.mediaService.findByMediaId(mediaId);
    const media = existing?.data;

    if (!media) {
      throw new BadRequestException('Media not found');
    }

    // ✅ normalize isPrimary
    const isPrimary =
      dto.isPrimary !== undefined
        ? String(dto.isPrimary).toLowerCase() === 'true'
        : undefined;

    // ✅ normalize tags
    const tags = Array.isArray(dto.tags)
      ? dto.tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof dto.tags === 'string'
        ? dto.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

    // ✅ next group values
    const nextMediaType = dto.mediaType ?? media.mediaType ?? MEDIA_TYPE.IMAGE;
    const nextPurpose = dto.purpose ?? media.purpose ?? MEDIA_PURPOSE.OTHER;

    const changingGroup =
      (dto.purpose && dto.purpose !== media.purpose) ||
      (dto.mediaType && dto.mediaType !== media.mediaType);

    // ✅ 2) If purpose/type changed → enforce target group limit
    if (changingGroup) {
      const limit = MediaLimitUtil.getLimit({
        ownerType: media.ownerType,
        purpose: nextPurpose,
        mediaType: nextMediaType,
      });

      const list: any[] = await this.mediaService.find(
        {
          ownerType: media.ownerType,
          ownerId: media.ownerId,
          subOwnerId: media.subOwnerId ?? null,
          purpose: nextPurpose,
          mediaType: nextMediaType,
          isDeleted: false,
        } as any,
        {
          sort: { sortOrder: 1, _id: 1 },
          lean: true,
          select: { mediaId: 1 },
        } as any,
      );

      const alreadyExistsOther = list.some((x) => x.mediaId !== mediaId);

      if (limit === 1 && alreadyExistsOther) {
        throw new ForbiddenException(
          `Only 1 media allowed for ${media.ownerType} + ${nextPurpose}. Please delete the existing one first.`,
        );
      }

      if (limit > 1) {
        const totalWithoutMe = list.filter((x) => x.mediaId !== mediaId).length;
        if (totalWithoutMe >= limit) {
          throw new ForbiddenException(
            `Limit reached (max ${limit}). Please delete an existing media and retry.`,
          );
        }
      }
    }

    // ✅ 3) Prepare update payload
    const updatePayload: any = {
      ...(dto.mediaType !== undefined ? { mediaType: nextMediaType } : {}),
      ...(dto.purpose !== undefined ? { purpose: nextPurpose } : {}),

      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.altText !== undefined ? { altText: dto.altText } : {}),
      ...(dto.navigationUrl !== undefined
        ? { navigationUrl: dto.navigationUrl }
        : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(dto.sortOrder !== undefined
        ? { sortOrder: Number(dto.sortOrder) || 1 }
        : {}),
      ...(isPrimary !== undefined ? { isPrimary } : {}),
    };

    // ✅ 4) If file uploaded → validate duplicate first, then delete old, then upload new
    if (file) {
      // ✅ Use current media values (correct scope)
      const ownerType = media.ownerType;
      const ownerId = media.ownerId;
      const subOwnerId = media.subOwnerId ?? null;

      const mediaType = nextMediaType;
      const purpose = nextPurpose;

      // ✅ checksum (only once)
      const checksum = ChecksumUtil.fromFile(file);

      // ✅ duplicate check BEFORE deleting old file
      const existingDuplicate = await this.mediaService.findDuplicateByChecksum(
        {
          ownerType,
          ownerId,
          subOwnerId,
          mediaType,
          purpose,
          checksum,
          ignoreMediaId: mediaId, // ✅ add support in service (recommended)
        } as any,
      );

      if (existingDuplicate) {
        throw new BadRequestException(
          'Duplicate media found with same checksum. Please upload a different file.',
        );
      }

      // ✅ delete old files (original + variants)
      try {
        // delete original
        if (media.storageKey) {
          await this.storage.delete({ storageKey: media.storageKey });
        }

        // ✅ delete variants (convert url -> storageKey)
        if (media.urls) {
          const keysToDelete = new Set<string>();

          const variantUrls = media.urls;

          if (variantUrls.small) keysToDelete.add(String(variantUrls.small));
          if (variantUrls.medium) keysToDelete.add(String(variantUrls.medium));
          if (variantUrls.large) keysToDelete.add(String(variantUrls.large));

          for (const k of keysToDelete) {
            try {
              const storageKey = String(k).startsWith('/uploads/')
                ? String(k).replace('/uploads/', '')
                : String(k);

              await this.storage.delete({ storageKey });
            } catch (e) {}
          }
        }
      } catch (e) {}

      // ✅ upload new file
      const folder = `media/${String(ownerType || 'general').toLowerCase()}`;

      const shouldGenerateVariants =
        mediaType === MEDIA_TYPE.IMAGE &&
        [
          MEDIA_OWNER_TYPE.PRODUCT,
          MEDIA_OWNER_TYPE.VARIANT,
          MEDIA_OWNER_TYPE.CATEGORY,
        ].includes(ownerType as any);

      const uploaded = await this.storage.upload({
        file,
        folder,
        generateVariants: shouldGenerateVariants,
        mediaType
      });

      // ✅ update payload
      updatePayload.storageKey = uploaded.storageKey;
      updatePayload.url = uploaded.url;
      updatePayload.urls = uploaded.urls;
      updatePayload.meta = {
        ...(uploaded.meta || {}),
        checksum,
      };
    }

    // ✅ 5) Save update
    return this.mediaService.update(mediaId, updatePayload, req.user);
  }

  /* ======================================================
   * HARD DELETE (DELETE STORAGE + DB)
   * ====================================================== */

  @Delete(':mediaId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hard delete media (remove storage + DB)' })
  @ApiParam({ name: 'mediaId', example: 'MID-001' })
  async remove(@Param('mediaId') mediaId: string, @Req() req: any) {
    const existing = await this.mediaService.findByMediaId(mediaId);
    const media = existing?.data;

    if (!media) {
      throw new BadRequestException('Media not found');
    }

    // ✅ delete from storage
    try {
      await this.storage.delete({ storageKey: media.storageKey });
    } catch (e) {}

    // ✅ hard delete from DB
    return this.mediaService.delete(mediaId, req.user);
  }
}
