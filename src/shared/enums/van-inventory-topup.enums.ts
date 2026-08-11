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

  // Approved by supervisor, waiting for salesman acceptance
  APPROVED = 'APPROVED',

  // Accepted by salesman, inventory updated
  ACCEPTED = 'ACCEPTED',

  // Declined by salesman after approval
  DECLINED = 'DECLINED',

  // Rejected by supervisor
  REJECTED = 'REJECTED',
}

export enum VanInventoryTopupErpSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
}
