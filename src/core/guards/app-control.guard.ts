import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppControlService } from '../config/app-control.service';
import { FEATURE_KEY } from '../decorators/feature-flag.decorator';

@Injectable()
export class AppControlGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appControl: AppControlService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Read feature flag from route or controller
    const feature =
      this.reflector.get<string>(FEATURE_KEY, context.getHandler()) ??
      this.reflector.get<string>(FEATURE_KEY, context.getClass());
    // No feature flag → allow request
    if (!feature) return true;

    const enabled = this.appControl.isRouteEnabled(feature);

    if (!enabled) {
      throw new ForbiddenException('This feature is disabled');
    }

    return true;
  }
}
