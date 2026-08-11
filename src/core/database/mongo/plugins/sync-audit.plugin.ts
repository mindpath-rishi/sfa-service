import { Schema } from 'mongoose';

/**
 * Adds a consistent origin/synchronization audit trail to every top-level
 * collection. Offline uploads explicitly override the ONLINE defaults.
 */
export function syncAuditPlugin(schema: Schema) {
  if (schema.options?._id === false) return;

  if (!schema.path('createdOffline')) {
    schema.add({
      createdOffline: { type: Boolean, default: false, index: true },
    });
  }

  if (!schema.path('syncSource')) {
    schema.add({
      syncSource: {
        type: String,
        enum: ['ONLINE', 'OFFLINE'],
        default: 'ONLINE',
        index: true,
      },
    });
  }

  if (!schema.path('syncedAt')) {
    schema.add({ syncedAt: { type: Date } });
  }

  if (!schema.path('lastSyncSource')) {
    schema.add({
      lastSyncSource: {
        type: String,
        enum: ['ONLINE', 'OFFLINE'],
        index: true,
      },
    });
  }

  if (!schema.path('lastSyncedAt')) {
    schema.add({ lastSyncedAt: { type: Date } });
  }

  // Stable local identity metadata used for idempotent upload retries.
  if (!schema.path('uuid')) schema.add({ uuid: { type: String, sparse: true, index: true } });
}
