/**
 * User Controller
 * ---------------
 * Purpose : Handle user authentication lifecycle
 * Used by : WEB / MOBILE / BACK-OFFICE CLIENTS
 *
 * Responsibilities:
 * - Login with device & agent binding
 * - Refresh access tokens
 * - Logout and terminate sessions
 *
 * Notes:
 * - Authentication is device-scoped
 * - Sessions are middleware-driven
 * - JWT tokens are issued via UserService
 */

import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { UserService } from './user.service';
import { LoginDto } from './dto/login.dto';

import { ApiSuccessResponse } from 'src/core/swagger/api.response.swagger';
import {
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiInternalErrorResponse,
} from 'src/core/swagger/api-error.response.swagger';

import { FeatureFlag } from 'src/core/decorators/feature-flag.decorator';
import { Public } from 'src/core/decorators/public.decorator';
import {
  API_MODULE,
  API_MODULE_ENABLE_KEYS,
  V1,
} from 'src/shared/constants/api.constants';
import { Agent } from 'src/modules/v1/user/user.enum';

@Public()
@ApiTags('User')
@FeatureFlag(API_MODULE_ENABLE_KEYS.USER)
@ApiUnprocessableEntityResponse()
@ApiInternalErrorResponse()
@ApiUnauthorizedResponse()
@Controller({
  path: API_MODULE.USER,
  version: V1,
})
export class UserController {
  constructor(private readonly userService: UserService) {}

  /* ======================================================
   * LOGIN
   * ------------------------------------------------------
   * Purpose :
   * - Authenticate user using loginId & password
   * - Bind session to device & agent context
   * - Issue access & refresh tokens
   *
   * Requirements:
   * - Active session (middleware)
   * - Valid agent header
   * - Matching device ID
   * ====================================================== */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login using loginId & password' })
  @ApiBody({ type: LoginDto })
  @ApiSuccessResponse(
    {
      accessToken: 'jwt.token.here',
      refreshToken: 'uuid',
      sessionId: 'uuid',
      expiresIn: '15m',
    },
    'Login successful',
  )
  @ApiCookieAuth('access_token')
  @ApiHeader({
    name: 'x-agent',
    description: 'Login agent context',
    required: true,
    enum: Agent,
  })
  @ApiHeader({
    name: 'x-device-id',
    description: 'Unique device identifier',
    required: true,
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Session must already be established (middleware-driven)
    const sessionId = (req as any).sessionId;
    if (!sessionId) {
      throw new BadRequestException('Session ID missing');
    }

    // Agent defines authentication context (e.g. BACK_OFFICE / ECOMMERCE)
    const agent = req.headers['x-agent'] as Agent;
    // if (!agent || !Object.values(Agent).includes(agent)) {
    //   throw new BadRequestException('Invalid agent');
    // }

    // Device ID is mandatory for device-scoped authentication
    const deviceId = req.headers['x-device-id'] as string;
    // if (!deviceId) {
    //   throw new BadRequestException('Device ID missing');
    // }

    // Prevent device spoofing
    // if (dto.deviceInfo.deviceId !== deviceId) {
    //   throw new BadRequestException('Device ID mismatch');
    // }

    // Delegate authentication logic to service layer
    const result = await this.userService.login(
      dto,
      agent,
      sessionId,
      deviceId,
      req.ip,
    );

    // Set secure HTTP-only cookies for web clients
    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.expiresInMs,
    });

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    return result;
  }

  /* ======================================================
   * REFRESH TOKEN
   * ------------------------------------------------------
   * Purpose :
   * - Issue a new access token for an active session
   * - Validate refresh token & device binding
   *
   * Notes:
   * - Does not create a new session
   * ====================================================== */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiHeader({
    name: 'x-device-id',
    description: 'Unique device identifier',
    required: true,
  })
  @ApiSuccessResponse(
    {
      accessToken: 'new.jwt.token',
      expiresIn: '15m',
    },
    'Token refreshed',
  )
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = (req as any).sessionId;
    if (!sessionId) {
      throw new BadRequestException('Session ID missing');
    }

    const deviceId = req.headers['x-device-id'] as string;
    if (!deviceId) {
      throw new BadRequestException('Device ID missing');
    }

    const refreshToken =
      req.cookies?.refresh_token ||
      (req.headers['x-refresh-token'] as string);

    if (!refreshToken) {
      throw new BadRequestException('Refresh token missing');
    }

    const result = await this.userService.refresh(
      sessionId,
      refreshToken,
      deviceId,
    );

    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.expiresInMs,
    });

    return result;
  }

  /* ======================================================
   * LOGOUT
   * ------------------------------------------------------
   * Purpose :
   * - Terminate active session for a specific device
   * - Clear authentication cookies
   * ====================================================== */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiHeader({
    name: 'x-device-id',
    description: 'Unique device identifier',
    required: true,
  })
  @ApiSuccessResponse(null, 'Logout successful')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceId = req.headers['x-device-id'] as string;
    if (!deviceId) {
      throw new BadRequestException('Device ID missing');
    }

    return this.userService.logout(req, res, deviceId);
  }
}
