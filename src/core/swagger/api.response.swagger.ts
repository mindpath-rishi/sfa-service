import { ApiResponse } from '@nestjs/swagger';

/* ======================================================
 * SUCCESS RESPONSE
 * ====================================================== */

export const ApiSuccessResponse = <T>(
  exampleData: T,
  description = 'Request successful',
  statusCode = 200,
) =>
  ApiResponse({
    status: statusCode,
    description,
    schema: {
      example: {
        success: true,
        statusCode,
        message: description,
        requestId: 'uuid',
        timestamp: new Date().toISOString(),
        path: '/api/v1/example',
        method: 'POST',
        durationMs: 12,
        data: exampleData,
      },
    },
  });

/* ======================================================
 * ERROR RESPONSE (GLOBAL FORMAT)
 * ====================================================== */

export const ApiErrorResponse = (
  status: number,
  description: string,
  exampleMessage = description,
) =>
  ApiResponse({
    status,
    description,
    schema: {
      example: {
        success: false,
        statusCode: status,
        message: exampleMessage,
        path: '/api/v1/example',
        method: 'POST',
        timestamp: new Date().toISOString(),
        requestId: 'uuid',
      },
    },
  });
