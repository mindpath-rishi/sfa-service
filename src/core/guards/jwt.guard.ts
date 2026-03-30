import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
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
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Validate JWT first
    const activated = (await super.canActivate(context)) as boolean;
    if (!activated) {
      return false;
    }

    // Enforce device presence
    // const deviceId = request.headers['x-device-id'];
    // if (!deviceId) {
    //   throw new UnauthorizedException('Device ID missing');
    // }

    // // Ensure JWT and header device match
    // if (request.user?.deviceId !== deviceId) {
    //   throw new UnauthorizedException('Device mismatch');
    // }

    return true;
  }
}
