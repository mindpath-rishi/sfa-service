import { Schema } from 'mongoose';

export function softDeletePlugin(schema: Schema) {
  /**
   * ✅ Skip embedded/sub schemas
   * Most sub documents have `_id: false`
   * Example: urls/meta/address inside main schema
   */
  if (schema.options?._id === false) {
    return;
  }

  // ✅ Do not override if already defined
  if (!schema.path('isDeleted')) {
    schema.add({
      isDeleted: {
        type: Boolean,
        default: false,
        index: true,
      },
    });
  }
}
