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

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login' })
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
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = (req as any).sessionId;

    /* ---------- READ AGENT FROM HEADER ---------- */
    const agent = req.headers['x-agent'] as Agent;

    const result = await this.userService.login(body, agent, sessionId);

    /* ---------- WEB COOKIES ---------- */
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

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
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

    const refreshToken =
      req.cookies?.refresh_token || (req.headers['x-refresh-token'] as string);

    const result = await this.userService.refresh(sessionId, refreshToken);

    res.cookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: result.expiresInMs,
    });

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiSuccessResponse(null, 'Logout successful')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.userService.logout(req, res);
  }
}
