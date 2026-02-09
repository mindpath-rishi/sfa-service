/**
 * Application-level constants for SFA (Sales Force Automation).
 */

/* ================= REQUEST & BODY ================= */

export const BODY_PARSER_LIMIT = '10mb';
export const REQUEST_ID = 'x-request-id';

/* ================= ENVIRONMENT ================= */

export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
} as const;

/* ================= SWAGGER ================= */

export const SWAGGER_API_TITLE = 'SFA Platform APIs';

export const SWAGGER_API_DESCRIPTION =
  'Sales Force Automation (SFA) backend built with NestJS, providing secure and scalable APIs for user management, roles and permissions, vans, routes, inventory, orders, payments, and operational workflows.';

export const SWAGGER_API_VERSION = '1.0.0';

export const SWAGGER_AUTH = {
  TYPE: 'http',
  SCHEME: 'bearer',
  BEARER_FORMAT: 'JWT',
  TOKEN: 'access-token',
} as const;

export const SWAGGER_ENDPOINT = '/api-docs';

/* ================= SECURITY / RATE LIMITING ================= */

export const THROTTLE_TTL = 60;      // seconds
export const THROTTLE_LIMIT = 100;   // requests per TTL
