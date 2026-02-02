import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;

    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    /* ==================== MESSAGE RESOLUTION ==================== */

    let message = 'Internal Server Error';

    if (isHttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
      } else if (
        typeof response === 'object' &&
        (response as any)?.message
      ) {
        message = Array.isArray((response as any).message)
          ? (response as any).message[0]
          : (response as any).message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    /* ==================== FINAL ERROR RESPONSE ==================== */

    const errorResponse: any = {
      success: false,
      statusCode: status,
      message,
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      requestId: (req as any).requestId, // set by ResponseInterceptor
    };

    // Expose stack trace only in non-production
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.stack =
        exception instanceof Error ? exception.stack : undefined;
    }

    res.status(status).json(errorResponse);
  }
}
