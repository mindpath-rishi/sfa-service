export const BODY_PARSER_LIMIT = '10mb';
export const REQUEST_ID = 'x-request-id';
export const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
};
export const SWAGGER_API_TITLE = 'Anavilam APIs';
export const SWAGGER_API_DESCRIPTION =
  'Enterprise-grade e-commerce backend built with NestJS, providing secure and scalable APIs for customer management, products, orders, payments, inventory, and role-based access control.';

export const SWAGGER_API_VERSION = '1.0.0';
export const SWAGGER_AUTH: any = {
  TYPE: 'http',
  SCHEME: 'bearer',
  BEARER_FORMAT: 'JWT',
  TOKEN: 'access-token',
};
export const SWAGGER_ENDPOINT = '/api-docs/';
export const THROTTLE_TTL = 60;
export const THROTTLE_LIMIT = 100;

