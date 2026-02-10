import { NormalizeType } from "../enums/normalize.enums";

export class TextNormalizer {
  static normalize(value?: string, type: NormalizeType = NormalizeType.TITLE): string {
    if (!value) return '';

    // Trim + collapse spaces first (common for all)
    const cleaned = value.trim().replace(/\s+/g, ' ');

    switch (type) {
      case NormalizeType.UPPER:
        return cleaned.toUpperCase();

      case NormalizeType.LOWER:
        return cleaned.toLowerCase();

      case NormalizeType.TITLE:
      default:
        return cleaned
          .toLowerCase()
          .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
}
