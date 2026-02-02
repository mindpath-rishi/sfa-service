import { ApiErrorResponse } from './api.response.swagger';

export const ApiUnauthorizedResponse = () =>
  ApiErrorResponse(401, 'Unauthorized', 'Unauthorized');

export const ApiForbiddenResponse = () =>
  ApiErrorResponse(403, 'Forbidden', 'Forbidden');

export const ApiNotFoundResponse = () =>
  ApiErrorResponse(404, 'Not Found', 'Resource not found');

export const ApiUnprocessableEntityResponse = () =>
  ApiErrorResponse(
    422,
    'Unprocessable Entity',
    'Validation failed',
  );

export const ApiInternalErrorResponse = () =>
  ApiErrorResponse(500, 'Internal Server Error', 'Internal Server Error');
