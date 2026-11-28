import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ApiResponse } from '../../shared/interfaces/api-response.interface';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ApiResponse<T>
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Response>();

    const startTime = process.hrtime.bigint();

    // Assigned by the pino-http middleware (logger.module.ts), so the id in
    // the response body matches the one in the logs.
    const requestId = (request as any).id as string;

    return next.handle().pipe(
      map((result: any) => {
        /**
         * 0️⃣ Handlers that write the response themselves (@Res: file
         * downloads, /metrics) return nothing; wrapping would throw.
         */
        if (response.headersSent || result === undefined) {
          return result;
        }

        /**
         * 1️⃣ Avoid double wrapping
         */
        if (result?.success === true && result?.requestId) {
          return result;
        }

        /**
         * 2️⃣ Skip streams / buffers
         */
        if (
          result instanceof Buffer ||
          result instanceof StreamableFile ||
          typeof result?.pipe === 'function'
        ) {
          return result;
        }

        const durationMs =
          Number(process.hrtime.bigint() - startTime) / 1_000_000;

        /**
         * 3️⃣ Extract message + data
         * Supports:
         * return { message, data }
         * return data
         */
        const message =
          result?.message ?? response.statusMessage ?? 'Request successful';

        const data = result?.data !== undefined ? result.data : result;
        const meta = result.meta;

        return {
          success: true,
          statusCode: response.statusCode,
          message,
          requestId,
          timestamp: new Date().toISOString(),
          path: request.originalUrl,
          method: request.method,
          durationMs: Math.round(durationMs),
          data,
          meta,
        };
      }),
    );
  }
}
