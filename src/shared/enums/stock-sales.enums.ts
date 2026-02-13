/**
 * Business lifecycle status for Stock Sales
 */
export enum StockSalesStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  LOCKED = 'LOCKED',
  CANCELLED = 'CANCELLED',
}

/**
 * ERP synchronization status
 */
export enum ErpSyncStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}
