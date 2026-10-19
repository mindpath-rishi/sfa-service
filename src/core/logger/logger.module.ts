import { Module, Global, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import pino from 'pino';
import pretty from 'pino-pretty';
import { LoggerService } from './logger.service';
import { logSink } from './log-sink';
import { REQUEST_ID } from 'src/shared/constants/app.constants';

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = (process.env.LOG_LEVEL ||
  (isProduction ? 'info' : 'debug')) as pino.Level;
const storeLevel = (process.env.LOG_STORE_LEVEL || 'info') as pino.Level;
// Debug lines are always produced so that per-user debug logging (switched on
// from MIS) can store them; the sink drops them for everyone else.
const minLevel =
  pino.levels.values[logLevel] < pino.levels.values.debug ? logLevel : 'debug';
logSink.setStoreLevel(pino.levels.values[storeLevel]);

// Console output (pretty in development) plus a stored, searchable copy for
// the MIS System Logs page. Storage defaults to info+ to keep volume sane.
const destinations = pino.multistream([
  {
    level: logLevel,
    stream: isProduction
      ? pino.destination(1)
      : pretty({
          colorize: true,
          singleLine: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        }),
  },
  {
    level: 'debug',
    stream: logSink,
  },
]);

// Accept a caller-supplied request id only if it looks sane, so a client
// cannot inject newlines or huge strings into every log line.
const VALID_REQUEST_ID = /^[\w.:-]{1,128}$/;

// Routes polled by infrastructure; logging each hit only adds noise.
const IGNORED_PATHS = ['/api/metrics', '/metrics', '/health', '/favicon.ico'];
// The log viewer itself polls these; logging them would bury real traffic.
const IGNORED_PREFIXES = [
  '/uploads/',
  '/api-docs',
  '/swagger',
  '/api/v1/system-logs',
];

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      // nestjs-pino defaults to '*', which Nest 11 (path-to-regexp v8)
      // warns about on every boot; this is the named-wildcard equivalent.
      forRoutes: [{ path: '{*splat}', method: RequestMethod.ALL }],
      pinoHttp: [
        {
          level: minLevel,

          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const incoming = req.headers[REQUEST_ID];
            const id =
              typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)
                ? incoming
                : crypto.randomUUID();

            req.headers[REQUEST_ID] = id;
            res.setHeader(REQUEST_ID, id);
            return id;
          },

          autoLogging: {
            ignore: (req: IncomingMessage) => {
              const path = (req.url ?? '').split('?')[0];
              return (
                IGNORED_PATHS.includes(path) ||
                IGNORED_PREFIXES.some((prefix) => path.startsWith(prefix))
              );
            },
          },

          // 5xx → error, 4xx → warn, everything else → info.
          customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },

          customSuccessMessage: (req, res, responseTime) =>
            `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,

          customErrorMessage: (req, res) =>
            `${req.method} ${req.url} ${res.statusCode} failed`,

          // Re-evaluated when the response finishes, so the authenticated user
          // (set by the JWT guard after this middleware ran) is included.
          customProps: (req: any, res: any) => {
            const user = req.user;
            return {
              ...(user && {
                userId: user.userId,
                role: user.role,
                vanId: user.vanId,
              }),
              ...(res.locals?.errorMessage && {
                errorMessage: res.locals.errorMessage,
              }),
            };
          },

          // Keep request/response entries small: no full header dumps.
          serializers: {
            req: (req) => ({
              id: req.id,
              method: req.method,
              url: req.url,
              ip: req.headers?.['x-forwarded-for'] ?? req.remoteAddress,
              userAgent: req.headers?.['user-agent'],
              appVersion: req.headers?.['x-app-version'],
            }),
            res: (res) => ({ statusCode: res.statusCode }),
          },

          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-session-id"]',
              'res.headers["set-cookie"]',
              '*.password',
              '*.newPassword',
              '*.oldPassword',
              '*.token',
              '*.accessToken',
              '*.refreshToken',
              '*.fcmToken',
              '*.private_key',
            ],
            censor: '[REDACTED]',
          },
        },
        destinations,
      ],
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class AppLoggerModule {}
