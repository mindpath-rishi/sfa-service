// src/shared/enums/inventory-transaction.enums.ts

/* ======================================================
 * Inventory Transaction Status
 * ====================================================== */

export enum InventoryTransactionStatus {
  DRAFT = 'DRAFT',        // Created but not applied
  PENDING = 'PENDING',  // Waiting for approval
  POSTED = 'POSTED',    // Applied to inventory
  REJECTED = 'REJECTED',// Supervisor rejected
  REVERSED = 'REVERSED' // Rolled back after posting
}

/* ======================================================
 * Transaction Type
 * ====================================================== */

export enum TransactionType {
  LOAD = 'LOAD',         // Warehouse → Van
  SALE = 'SALE',         // Van → Customer
  RETURN = 'RETURN',     // Customer → Van
  DAMAGE = 'DAMAGE',     // Van loss
  SETTLEMENT = 'SETTLEMENT' // Physical adjustment
}

/* ======================================================
 * Direction
 * ====================================================== */

export enum Direction {
  IN = 'IN',
  OUT = 'OUT'
}
