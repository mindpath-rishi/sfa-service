import { Module, Global } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { LoggerService } from './logger.service';
import crypto from 'crypto';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

        genReqId: (req, res) => {
          const id = req.headers['x-request-id'] as string;
          if (id) return id;

          const uuid = crypto.randomUUID();
          res.setHeader('x-request-id', uuid);
          return uuid;
        },

        redact: {
          paths: ['req.headers.authorization', 'req.headers.cookie'],
          censor: '[REDACTED]',
        },

        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: true,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,
      },
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class AppLoggerModule {}
