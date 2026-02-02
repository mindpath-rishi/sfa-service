import { Schema } from 'mongoose';

export function timestampsPlugin(schema: Schema) {
  // Avoid overriding if schema already defines timestamps
  if (!schema.options.timestamps) {
    schema.set('timestamps', {
      createdAt: 'createdAt',
      updatedAt: 'updatedAt'
    });
  }
}
