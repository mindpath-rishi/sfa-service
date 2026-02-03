/**
 * Media Utility
 * -------------
 * Purpose : Common helpers for media handling and validation
 * Used by : MEDIA SERVICE / UPLOAD FLOWS
 *
 * Responsibilities:
 * - Normalize request inputs
 * - Decide storage behavior
 * - Enforce upload limits
 *
 * Notes:
 * - Stateless utility class
 * - Does not perform DB mutations directly
 * - Relies on MediaService for data access
 */

import { ForbiddenException } from '@nestjs/common';
import {
  MEDIA_OWNER_TYPE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';
import { MediaLimitUtil } from 'src/shared/utils/media-limit.utils';

export class MediaUtil {
  /* ================= PARSERS ================= */

  /**
   * Parse Primary Flag
   * ------------------
   * Purpose : Normalize boolean-like input for `isPrimary`
   *
   * Accepts:
   * - boolean
   * - string ('true' / 'false')
   *
   * Returns:
   * - true / false
   * - undefined if value not provided
   */
  static parseIsPrimary(value: any): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    return String(value).toLowerCase() === 'true';
  }

  /**
   * Parse Tags
   * ----------
   * Purpose : Normalize tags input into a string array
   *
   * Supports:
   * - Array of strings
   * - Comma-separated string
   *
   * Returns:
   * - string[] or undefined
   */
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

  /* ================= STORAGE HELPERS ================= */

  /**
   * Build Storage Folder Path
   * -------------------------
   * Purpose : Generate folder path for media storage
   *
   * Example:
   * - ownerType = PRODUCT → media/product
   * - ownerType = USER → media/user
   */
  static buildFolder(ownerType: string) {
    return `media/${String(ownerType || 'general').toLowerCase()}`;
  }

  /**
   * Determine Variant Generation
   * ----------------------------
   * Purpose : Decide whether image variants should be generated
   *
   * Rules:
   * - Only IMAGE media type
   * - Only product-related owner types
   */
  static shouldGenerateVariants(ownerType: string, mediaType: string) {
    return (
      mediaType === MEDIA_TYPE.IMAGE &&
      [
        MEDIA_OWNER_TYPE.PRODUCT,
        MEDIA_OWNER_TYPE.VARIANT,
        MEDIA_OWNER_TYPE.CATEGORY,
      ].includes(ownerType as any)
    );
  }

  /* ================= LIMIT VALIDATION ================= */

  /**
   * Validate Media Upload Limit
   * ---------------------------
   * Purpose : Enforce media upload limits per owner, purpose, and type
   *
   * Used by:
   * - Upload flows
   * - Update flows (group change)
   *
   * Supports:
   * - Ignoring current media (during update)
   *
   * Throws:
   * - ForbiddenException if limit exceeded
   */
  static async validateLimit(params: {
    mediaService: any;

    ownerType: string;
    ownerId: string;
    subOwnerId?: string | null;
    purpose: string;
    mediaType: string;

    ignoreMediaId?: string;
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
      },
      { lean: true, select: { mediaId: 1 } },
    );

    const count = ignoreMediaId
      ? list.filter((x) => x.mediaId !== ignoreMediaId).length
      : list.length;

    if (count >= limit) {
      throw new ForbiddenException(
        `Upload limit reached. Max allowed = ${limit} for ${ownerType} + ${purpose}. Please delete an existing media and retry.`,
      );
    }

    return limit;
  }
}
