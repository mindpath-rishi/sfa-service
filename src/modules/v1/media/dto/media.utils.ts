/**
 * Media Utility
 * -------------
 * Purpose : Common helpers for media handling and validation
 * Used by : MEDIA SERVICE / UPLOAD FLOWS
 *
 * Responsibilities:
 * - Normalize request inputs
 * - Decide storage behavior
 *
 * Notes:
 * - Stateless utility class
 * - Does not perform DB mutations directly
 * - Relies on MediaService for data access
 */

import {
  MEDIA_OWNER_TYPE,
  MEDIA_TYPE,
} from 'src/shared/constants/media.constants';

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
}
