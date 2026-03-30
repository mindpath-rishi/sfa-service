import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { JwtPayload } from '../../../shared/interfaces/jwt-payload.interface';
import { jwtConfig } from '../../../core/config/jwt.config';
import { jwtExtractor } from '../../../core/auth/jwt-extractor';
import { RequestContextStore } from 'src/core/context/request-context';


@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET missing');
    }

    super({
      jwtFromRequest: jwtExtractor,
      secretOrKey: secret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub || !payload?.sid) {
      throw new UnauthorizedException('Invalid JWT payload');
    }

    /**
     * ✅ SET CONTEXT HERE (MOST IMPORTANT PART)
     */
    const store = RequestContextStore.getStore();

    if (store) {
      store.userId = payload.sub;
      store.role = payload.role;
      store.name = payload.name;
      store.vanId = payload.vanId; // ✅ FIX: SET VAN ID
    }

    /**
     * ✅ Attach to request.user
     */
    return {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
      name: payload.name,
      vanId: payload.vanId, // optional but useful
    };
  }
}