import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { GlobalExceptionFilter } from './core/filters/exception.filter';
import { ResponseInterceptor } from './core/interceptors/response.interceptor';
import * as bodyParser from 'body-parser';
import { Logger } from 'nestjs-pino';
import { API_MODULE, API_PREFIX, V1 } from './shared/constants/api.constants';
import {
  BODY_PARSER_LIMIT,
  ENVIRONMENT,
  REQUEST_ID,
  SWAGGER_API_DESCRIPTION,
  SWAGGER_API_TITLE,
  SWAGGER_API_VERSION,
  SWAGGER_AUTH,
  SWAGGER_ENDPOINT,
} from './shared/constants/app.constants';
import { RequestContextInterceptor } from './core/interceptors/request-context.interceptor';
import { LoggerService } from './core/logger/logger.service';
import { AppLogger } from './core/logger/app-logger';
import { PermissionsSeeder } from './core/seeds/permission.seeds';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { SeederRunner } from './core/seeds/seed.runner';

// ⚠️ guaranteed cookie-parser fix
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  const logger = app.get(LoggerService);
  AppLogger.init(logger);

  /* ---------------- SECURITY & PERF ---------------- */
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  /* ---------------- REQUEST SIZE LIMIT ---------------- */
  app.use(bodyParser.json({ limit: BODY_PARSER_LIMIT }));
  app.use(bodyParser.urlencoded({ extended: true, limit: BODY_PARSER_LIMIT }));

  /* ---------------- CORS (COOKIE + SWAGGER SAFE) ---------------- */
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useLogger(app.get(Logger));

  /* ---------------- API PREFIX & VERSIONING ---------------- */
  app.setGlobalPrefix(API_PREFIX, {
    exclude: [{ path: API_MODULE.METRIC, method: RequestMethod.GET }],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: V1,
  });

  /* ---------------- GLOBAL VALIDATION ---------------- */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /* ---------------- GLOBAL FILTERS & INTERCEPTORS ---------------- */
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(
    new RequestContextInterceptor(),
    new ResponseInterceptor(),
  );

  /* ---------------- GLOBAL REQUEST ID ---------------- */
  app.use((req, res, next) => {
    req.headers[REQUEST_ID] ||= crypto.randomUUID();
    res.setHeader(REQUEST_ID, req.headers[REQUEST_ID]);
    next();
  });

  /* ---------------- SWAGGER (DEV ONLY) ---------------- */
  if (process.env.NODE_ENV !== ENVIRONMENT.PRODUCTION) {
    const config = new DocumentBuilder()
      .setTitle(SWAGGER_API_TITLE)
      .setDescription(SWAGGER_API_DESCRIPTION)
      .setVersion(SWAGGER_API_VERSION)
      .addBearerAuth(
        {
          type: SWAGGER_AUTH.TYPE,
          scheme: SWAGGER_AUTH.SCHEME,
          bearerFormat: SWAGGER_AUTH.BEARER_FORMAT,
        },
        SWAGGER_AUTH.TOKEN,
      )
      .addCookieAuth(SWAGGER_AUTH.TYPE)
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(SWAGGER_ENDPOINT, app, document, {
      useGlobalPrefix: false,
      swaggerOptions: {
        docExpansion: 'none',
      },
    });
  }

  /* ---------------- GRACEFUL SHUTDOWN ---------------- */
  app.enableShutdownHooks();

  await app.listen(process.env.PORT || 3000);
  console.log('🚀 Server running on http://localhost:3000');

  if (process.env.SEED_PERMISSIONS === 'true') {
    const seederRunner = app.get(SeederRunner);
    await seederRunner.run();
  }
}
bootstrap();
