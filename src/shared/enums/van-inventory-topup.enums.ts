/**
 * Van Inventory Top-Up Status Enum
 * -------------------------------
 * Purpose : Define workflow states for van inventory top-up
 */

export enum VanInventoryTopupStatus {
  // Draft created, editable by requester
  DRAFT = 'DRAFT',

  // Submitted for approval, locked for editing
  SUBMITTED = 'SUBMITTED',

  // Approved by supervisor, inventory updated
  APPROVED = 'APPROVED',

  // Rejected by supervisor
  REJECTED = 'REJECTED',
}
