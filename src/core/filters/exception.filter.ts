import {
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { REQUEST_ID } from 'src/shared/constants/app.constants';

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

    // A streaming response (e.g. a log download) that fails midway has
    // already sent its headers; it can only be ended, not answered again.
    if (res.headersSent) {
      (res as any).err = exception instanceof Error ? exception : new Error(String(exception));
      if (!res.writableEnded) res.end();
      return;
    }

    /* ==================== LOGGING ==================== */

    // The pino-http access line logs these when the response ends, so each
    // failed request is one log entry with its request id and user.
    res.locals.errorMessage = message;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Attaching the error makes pino-http log its stack on the access line.
      (res as any).err =
        exception instanceof Error ? exception : new Error(String(exception));
    }

    /* ==================== FINAL ERROR RESPONSE ==================== */

    const errorResponse: any = {
      success: false,
      statusCode: status,
      message,
      path: req.originalUrl,
      method: req.method,
      timestamp: new Date().toISOString(),
      // Set by the pino-http middleware, so present even for guard errors.
      requestId: (req as any).id ?? req.headers[REQUEST_ID],
    };

    // Keep extra fields an exception deliberately carries (e.g. the 426
    // "update required" response: minAppVersion, storeUrl, updateRequired).
    if (isHttpException) {
      const body = exception.getResponse();
      if (body && typeof body === 'object') {
        const { message: _m, statusCode: _s, error: _e, ...extra } = body as Record<string, unknown>;
        Object.assign(errorResponse, extra);
      }
    }

    // Expose stack trace only in non-production
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.stack =
        exception instanceof Error ? exception.stack : undefined;
    }

    res.status(status).json(errorResponse);
  }
}
