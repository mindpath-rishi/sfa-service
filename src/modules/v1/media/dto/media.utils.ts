import { ForbiddenException } from '@nestjs/common';
import { MEDIA_OWNER_TYPE, MEDIA_TYPE } from 'src/shared/constants/media.constants';
import { MediaLimitUtil } from 'src/shared/utils/media-limit.utils';

export class MediaUtil {
  static parseIsPrimary(value: any): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    return String(value).toLowerCase() === 'true';
  }

  static parseTags(value: any): string[] | undefined {
    if (value === undefined || value === null) return undefined;

    if (Array.isArray(value)) {
      return value.map((t) => String(t).trim()).filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }

    return undefined;
  }

  static buildFolder(ownerType: string) {
    return `media/${String(ownerType || 'general').toLowerCase()}`;
  }

  static isProductImage(ownerType: string, mediaType: string) {
    return (
      mediaType === MEDIA_TYPE.IMAGE &&
      [MEDIA_OWNER_TYPE.PRODUCT, MEDIA_OWNER_TYPE.VARIANT, MEDIA_OWNER_TYPE.CATEGORY].includes(
        ownerType as any,
      )
    );
  }

  static async validateLimit(params: {
    mediaService: any;

    ownerType: string;
    ownerId: string;
    subOwnerId?: string | null;
    purpose: string;
    mediaType: string;

    ignoreMediaId?: string; // ✅ for update only
  }) {
    const {
      mediaService,
      ownerType,
      ownerId,
      subOwnerId = null,
      purpose,
      mediaType,
      ignoreMediaId,
    } = params;

    const limit = MediaLimitUtil.getLimit({
      ownerType,
      purpose,
      mediaType,
    });

    const list: any[] = await mediaService.find(
      {
        ownerType,
        ownerId,
        subOwnerId,
        purpose,
        mediaType,
        isDeleted: false,
      } as any,
      {
        sort: { sortOrder: 1, _id: 1 },
        lean: true,
        select: { mediaId: 1 },
      } as any,
    );

    const countWithoutIgnored = ignoreMediaId
      ? list.filter((x) => x.mediaId !== ignoreMediaId).length
      : list.length;

    if (countWithoutIgnored >= limit) {
      throw new ForbiddenException(
        `Upload limit reached. Max allowed = ${limit} for ${ownerType} + ${purpose}. Please delete an existing media and retry.`,
      );
    }

    return limit;
  }
}
