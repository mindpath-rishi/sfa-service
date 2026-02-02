import {
  MEDIA_DEFAULT_LIMIT,
  MEDIA_LIMITS,
  MEDIA_TYPE_LIMITS,
} from '../constants/media.constants';

export class MediaLimitUtil {
  static getLimit(params: {
    ownerType: string;
    purpose: string;
    mediaType: string;
  }): number {
    const { ownerType, purpose, mediaType } = params;

    // ✅ Owner+Purpose limit has priority
    const ownerPurposeLimit = MEDIA_LIMITS?.[ownerType]?.[purpose];
    if (typeof ownerPurposeLimit === 'number') return ownerPurposeLimit;

    // ✅ Type based limit fallback
    const mediaTypeLimit = MEDIA_TYPE_LIMITS?.[mediaType];
    if (typeof mediaTypeLimit === 'number') return mediaTypeLimit;

    // ✅ default fallback
    return MEDIA_DEFAULT_LIMIT;
  }
}
