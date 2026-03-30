import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { RequestContextStore } from 'src/core/context/request-context';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();

    console.log(req.user, "====================req===================")
    // ✅ req.user is AVAILABLE here
    return RequestContextStore.run(
      {
        userId: req.user?.userId,
        name: req.user?.name,
        role: req.user?.role,
        vanId: req.user?.vanId,
        vanName: req.user?.vanName,
      },
      () => next.handle(),
    );
  }
}
