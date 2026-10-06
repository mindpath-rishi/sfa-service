import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BACK_OFFICE_ONLY_KEY } from '../decorators/back-office-only.decorator';

/** Field roles (same list the mobile app uses for salesman mode) */
const SALESMAN_ROLES = new Set(['SALESMAN', 'SALES', 'SALES_EXECUTIVE']);

@Injectable()
export class BackOfficeOnlyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const backOfficeOnly = this.reflector.getAllAndOverride<boolean>(
      BACK_OFFICE_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!backOfficeOnly) return true;

    const role = String(context.switchToHttp().getRequest().user?.role ?? '')
      .trim()
      .toUpperCase();
    if (SALESMAN_ROLES.has(role)) {
      throw new ForbiddenException(
        'This action is only available to back-office users',
      );
    }
    return true;
  }
}
