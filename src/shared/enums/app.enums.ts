export enum Platform {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
}

export enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  EMPLOYEE = 'EMPLOYEE',
  ADMIN = 'ADMIN',
}

export enum Language {
  EN = 'EN',
  HI = 'HI',
}

/**
 * Supported audit actions.
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  RESTORE = 'RESTORE',
}
