import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { RedisRepository } from '../database/radis/radis.repository';

export interface SessionPayload {
  type: 'GUEST' | 'USER';
  userId?: string;
  role?: string;
  createdAt: string;
}

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  private readonly GUEST_TTL = 60 * 60 * 24 * 3; // 3 days

  constructor(private readonly redis: RedisRepository) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      /* =====================================
       * 1️⃣ READ SESSION ID
       * ===================================== */
      let sessionId =
        req.cookies?.sessionId || (req.headers['x-session-id'] as string);

      /* =====================================
       * 2️⃣ CREATE GUEST SESSION (IF MISSING)
       * ===================================== */
      if (!sessionId) {
        sessionId = randomUUID();

        const session: SessionPayload = {
          type: 'GUEST',
          createdAt: new Date().toISOString(),
        };

        await this.redis.client.set(
          `session:${sessionId}`,
          JSON.stringify(session),
          'EX',
          this.GUEST_TTL,
        );

        // Web support
        res.cookie('sessionId', sessionId, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          maxAge: this.GUEST_TTL * 1000,
        });
      }

      /* =====================================
       * 3️⃣ ATTACH SESSION TO REQUEST
       * ===================================== */
      (req as any).sessionId = sessionId;

      const sessionRaw = await this.redis.client.get(`session:${sessionId}`);

      (req as any).session = sessionRaw ? JSON.parse(sessionRaw) : null;

      next();
    } catch (err) {
      next();
    }
  }
}
