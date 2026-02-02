import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../shared/interfaces/jwt-payload.interface';
import { jwtConfig } from '../../../core/config/jwt.config';
import { jwtExtractor } from '../../../core/auth/jwt-extractor';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET missing');

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

    return {
      name: payload.name,
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid, // ✅ FIXED
    };
  }
}
