/**
 * JWT Strategy
 * ------------
 * Purpose : Authenticate requests using JSON Web Tokens (JWT)
 * Used by : AUTH GUARDS / PROTECTED API ROUTES
 *
 * Responsibilities:
 * - Extract JWT from request (header / cookie / custom extractor)
 * - Verify token signature and standard claims
 * - Perform minimal structural validation on payload
 *
 * Notes:
 * - Business validations (session, device, role, permissions)
 *   are handled by Guards or Interceptors, not here
 * - JWT secret must be provided via configuration
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { JwtPayload } from '../../../shared/interfaces/jwt-payload.interface';
import { jwtConfig } from '../../../core/config/jwt.config';
import { jwtExtractor } from '../../../core/auth/jwt-extractor';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * Strategy Constructor
   * --------------------
   * Purpose : Configure JWT validation rules
   *
   * Configuration:
   * - Token extractor (header / cookie / custom)
   * - Secret key
   * - Issuer and audience validation
   *
   * Throws:
   * - Error if JWT_SECRET is missing
   */
  constructor(config: ConfigService) {
    // JWT secret must be provided via environment/config
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET missing');
    }

    super({
      // Supports header, cookie, or custom extractors
      jwtFromRequest: jwtExtractor,
      secretOrKey: secret,
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience,
    });
  }

  /**
   * Validate JWT Payload
   * --------------------
   * Purpose : Perform structural validation of decoded JWT payload
   *
   * Required Claims:
   * - sub      → User identifier
   * - sid      → Session identifier
   * - deviceId → Device binding identifier
   *
   * Notes:
   * - Does NOT validate session state, device trust, or permissions
   * - Returned object is attached to request.user
   *
   * Throws:
   * - UnauthorizedException if required claims are missing
   */
  async validate(payload: JwtPayload) {
    // Required claims for session-bound authentication
    if (!payload?.sub || !payload?.sid || !payload?.deviceId) {
      throw new UnauthorizedException('Invalid JWT payload');
    }

    // Returned object is attached to request.user
    return {
      userId: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
      deviceId: payload.deviceId,
      name: payload.name,
    };
  }
}
