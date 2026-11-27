import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // Public routes stay open, but a valid token still sets req.user so
      // later guards (e.g. BackOfficeOnlyGuard) can see who is calling.
      const { headers } = context
        .switchToHttp()
        .getRequest<{ headers: Record<string, string | undefined> }>();
      if (headers.authorization) {
        try {
          await super.canActivate(context);
        } catch {
          // Missing/expired token is fine on a public route.
        }
      }
      return true;
    }

    // Validate JWT
    return (await super.canActivate(context)) as boolean;
  }
}
