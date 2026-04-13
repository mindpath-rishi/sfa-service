/**
 * Customer Sales Status Enum
 * --------------------------
 * Purpose : Define workflow states for customer sales transactions
 *
 * Flow:
 *  DRAFT → CONFIRMED → CANCELLED
 *
 * Notes:
 * - Only CONFIRMED sales deduct van_inventory
 * - CANCELLED sales do not affect inventory
 */

export enum SaleStatus {
  // Sale created but not finalized
  COMPLETED = 'COMPLETED',

  // Sale confirmed, inventory deducted
  RETURNED = 'RETURNED',

  // Sale cancelled before confirmation
  CANCELLED = 'CANCELLED',
}

/* ======================================================
 * ENUMS
 * ====================================================== */

export enum SaleType {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
}

export enum SalePaymentStatus {
  PAID = 'PAID',
  UNPAID = 'UNPAID',
  OVERDUE = 'OVERDUE',
  PARTIAL = 'PARTIAL',
}
