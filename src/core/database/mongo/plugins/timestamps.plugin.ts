import { Schema } from 'mongoose';

export function timestampsPlugin(schema: Schema) {
  // Embedded schemas with `_id: false` are value objects, not auditable records.
  if (schema.options?._id === false) {
    return;
  }

  // Avoid overriding if schema already defines timestamps
  if (!schema.options.timestamps) {
    schema.set('timestamps', {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    });
  }
}
