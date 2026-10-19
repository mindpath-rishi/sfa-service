import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { DiagnosticsService } from './diagnostics.service';
import { isBelow } from './version.utils';

/**
 * Blocks mobile apps older than the minimum version set in MIS, with HTTP 426.
 *
 * Uploads stay open on every version: blocking them would strand offline
 * sales on the phone. Diagnostics, token refresh and logout stay open too.
 * Old builds send no x-app-version and count as 0.0.0.
 */
/** HTTP 426: Nest's HttpStatus enum has no name for it. */
export const UPGRADE_REQUIRED = 426;

const ALWAYS_ALLOWED = [
  /^\/api\/v\d+\/sync\//,
  /^\/api\/v\d+\/diagnostics\//,
  /^\/api\/v\d+\/media/,
  /^\/api\/v\d+\/user\/(refresh|logout)/,
];

@Injectable()
export class AppVersionGuard implements CanActivate {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const isMobile =
      req.headers['x-client-platform'] === 'mobile' ||
      String(req.headers['x-agent'] ?? '').toUpperCase() === 'MOBILE';
    if (!isMobile) return true;

    const path = String(req.originalUrl ?? req.url ?? '').split('?')[0];
    if (ALWAYS_ALLOWED.some((pattern) => pattern.test(path))) return true;

    const config = await this.diagnosticsService.appConfig();
    const version = req.headers['x-app-version'] as string | undefined;
    if (!isBelow(version, config.minAppVersion)) return true;

    throw new HttpException(
      {
        statusCode: UPGRADE_REQUIRED,
        message: config.updateMessage || `Please update the app to version ${config.minAppVersion} or newer to continue.`,
        minAppVersion: config.minAppVersion,
        storeUrl: config.storeUrl,
        updateRequired: true,
      },
      UPGRADE_REQUIRED,
    );
  }
}
