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

export enum CustomerSalesStatus {
  // Sale created but not finalized
  DRAFT = 'DRAFT',

  // Sale confirmed, inventory deducted
  CONFIRMED = 'CONFIRMED',

  // Sale cancelled before confirmation
  CANCELLED = 'CANCELLED',
}
