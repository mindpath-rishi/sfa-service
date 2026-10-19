import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContextStore } from 'src/core/context/request-context';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly pino: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();

    // Tag every log written while handling this request with the caller, so
    // a service's log lines can be traced back to a salesman or van.
    if (req.user) {
      try {
        this.pino.assign({
          userId: req.user.userId,
          role: req.user.role,
          vanId: req.user.vanId,
        });
      } catch {
        // Outside an HTTP request scope (e.g. websockets); nothing to tag.
      }
    }

    // req.user is set by the JWT guard, which runs before interceptors.
    return RequestContextStore.run(
      {
        userId: req.user?.userId,
        name: req.user?.name,
        role: req.user?.role,
        roleId: req.user?.roleId,
        vanId: req.user?.vanId,
        vanName: req.user?.vanName,
        offlineAccessAllowed: req.user?.offlineAccessAllowed === true,
      },
      () => next.handle(),
    );
  }
}
