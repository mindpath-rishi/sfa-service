/**
 * User Service
 * ------------
 * Purpose : Handle authentication, session, and device lifecycle
 * Used by : UserController / Auth Guards / Token Refresh Flows
 *
 * Responsibilities:
 * - Create authentication users
 * - Login with device & session binding
 * - Issue and refresh JWT tokens
 * - Manage Redis-backed sessions
 * - Track user devices
 * - Logout and invalidate sessions
 *
 * Notes:
 * - User profile data lives in domain-specific collections (Employee, etc.)
 * - Authentication is device-scoped
 * - Sessions are cached in Redis
 */

import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

import { LoginDto } from './dto/login.dto';
import { Agent, UserStatus } from 'src/modules/v1/user/user.enum';
import { RedisRepository } from 'src/core/database/radis/radis.repository';

import { User, UserSchema } from 'src/core/database/mongo/schema/user.schema';
import { MongoService } from 'src/core/database/mongo/mongo.service';
import { MongoRepository } from 'src/core/database/mongo/mongo.repository';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { USER } from './user.constants';
import { jwtConfig } from 'src/core/config/jwt.config';
import { Employee } from 'src/core/database/mongo/schema/employee.schema';
import { UserDevice } from 'src/core/database/mongo/schema/device.schema';
import { VanService } from '../van/van.service';

@Injectable()
export class UserService extends MongoRepository<User> {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisRepository,
    private readonly vanService: VanService,
    mongo: MongoService,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<Employee>,
    @InjectModel(UserDevice.name)
    private readonly userDeviceModel: Model<UserDevice>,
  ) {
    super(mongo.getModel(User.name, UserSchema));
  }

  /* ======================================================
   * CREATE USER (AUTH ONLY)
   * ------------------------------------------------------
   * Purpose :
   * - Create authentication credentials
   * - Does NOT create domain profile
   *
   * Notes:
   * - Passwords are securely hashed
   * - Unique constraints enforced at DB level
   * ====================================================== */
  async createUser(
    data: {
      profileId: string;
      mobile: string;
      email?: string;
      password: string;
      loginId: string;
    },
    session?: any,
  ) {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 10);

      const user = await this.save(
        {
          profileId: data.profileId,
          mobile: data.mobile,
          email: data.email?.toLowerCase(),
          password: hashedPassword,
          status: UserStatus.ACTIVE,
          loginId: data.loginId,
        },
        { session },
      );

      return {
        profileId: user.profileId,
        mobile: user.mobile,
        email: user.email,
      };
    } catch (err: any) {
      // Handles unique constraint violations
      if (err?.code === 11000) {
        throw new ForbiddenException(USER.DUPLICATE);
      }
      throw err;
    }
  }

  /* ======================================================
   * LOGIN (DEVICE ANCHORED)
   * ------------------------------------------------------
   * Purpose :
   * - Authenticate user credentials
   * - Resolve profile based on agent
   * - Bind session to device
   * - Issue access & refresh tokens
   *
   * Security:
   * - Password hashing (bcrypt)
   * - Device & session binding
   * - Redis-backed session tracking
   * ====================================================== */
  async login(
    body: LoginDto,
    agent: Agent,
    sessionId: string,
    deviceId: string,
    ipAddress?: string,
  ) {
    const { loginId, password, deviceInfo } = body;

    // if (!agent) {
    //   throw new BadRequestException(USER.AGENT_MISSED);
    // }

    if (!deviceInfo) {
      throw new BadRequestException('Device info missing');
    }

    /* ---------- USER AUTH ---------- */
    const user: any = await this.findOneWithSelect({ loginId }, '+password');

    console.log('User found for login:', user || 'No user');

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(USER.INVALID_CREDENTIALS);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException(USER.INVALID_CREDENTIALS);
    }

    /* ---------- PROFILE RESOLUTION ---------- */
    let profile: any = null;

    // if (user.agent === Agent.BACK_OFFICE) {
    profile = await this.employeeModel.findOne({
      employeeId: user.profileId,
    });
    // }

    if (!profile) {
      throw new ForbiddenException(USER.PROFILE_NOT_FOUND);
    }

    /* ---------- DEVICE UPSERT ---------- */
    await this.userDeviceModel.findOneAndUpdate(
      { userId: user.profileId, deviceId },
      {
        $set: {
          sessionId,
          deviceType: deviceInfo.deviceType,
          os: deviceInfo.os,
          osVersion: deviceInfo.osVersion,
          browser: deviceInfo.browser,
          appVersion: deviceInfo.appVersion,
          ipAddress,
          lastLoginAt: new Date(),
          fcmToken: deviceInfo.fcmToken,
          isActive: true,
        },
      },
      { upsert: true },
    );

    /* ---------- SESSION CACHE ---------- */
    await this.redis.setJson(
      `session:${sessionId}`,
      {
        type: 'USER',
        profileId: user.profileId,
        role: user.role,
        deviceId,
        createdAt: new Date().toISOString(),
      },
      60 * 60 * 24 * 7,
    );

    /* ---------- TOKEN GENERATION ---------- */
    const expiresIn = '1000m';
    const expiresInMs = 100 * 60 * 1000;
    const refreshToken = randomUUID();

    await this.redis.setJson(
      `refresh:${sessionId}`,
      {
        hash: await bcrypt.hash(refreshToken, 10),
        deviceId,
      },
      60 * 60 * 24 * 7,
    );

    const vanId: string = profile?.associatedVans?.[0];

    const accessToken = this.jwtService.sign(
      {
        sub: user.profileId,
        role: user.role,
        sid: sessionId,
        // deviceId,
        name: profile?.name,
        vanId,
      },
      {
        expiresIn,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      },
    );

    // if (vanId) {
    //   const van = await this.vanService.findByVanId(vanId);
    //   profile.van = van.data;
    //   // const routes = await this.routeService.findAll(vanId);
    // }

    await this.updateById(user._id.toString(), {
      lastLoginAt: new Date(),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn,
      expiresInMs,
      sessionId,
      user: {
        profileId: user.profileId,
        profile,
      },
      message: USER.LOGIN,
    };
  }

  /* ======================================================
   * REFRESH TOKEN (DEVICE BOUND)
   * ------------------------------------------------------
   * Purpose :
   * - Issue new access token for valid session & device
   *
   * Security:
   * - Refresh token hash comparison
   * - Device & session validation
   * ====================================================== */
  async refresh(sessionId: string, refreshToken: string, deviceId: string) {
    const stored = await this.redis.getJson<{
      hash: string;
      deviceId: string;
    }>(`refresh:${sessionId}`);

    if (!stored || stored.deviceId !== deviceId) {
      throw new UnauthorizedException(USER.INVALID_REFRESH_TOKEN);
    }

    const valid = await bcrypt.compare(refreshToken, stored.hash);
    if (!valid) {
      throw new UnauthorizedException(USER.INVALID_REFRESH_TOKEN);
    }

    const session = await this.redis.getJson<any>(`session:${sessionId}`);
    if (!session || session.type !== 'USER') {
      throw new UnauthorizedException(USER.INVALID_REFRESH_TOKEN);
    }

    const device = await this.userDeviceModel.findOne({
      sessionId,
      deviceId,
      isActive: true,
    });

    if (!device) {
      throw new UnauthorizedException(USER.SESSION_EXPIRED);
    }

    const expiresIn: any = USER.EXPIRED_IN;
    const expiresInMs: number = USER.EXPIRED_IN_MILLISECONDS;

    const accessToken = this.jwtService.sign(
      {
        sub: session.profileId,
        role: session.role,
        sid: sessionId,
        deviceId,
      },
      {
        expiresIn,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      },
    );

    return {
      accessToken,
      expiresIn,
      expiresInMs,
      message: USER.TOKEN_REFRESHED,
      statusCode: HttpStatus.OK,
    };
  }

  /* ======================================================
   * LOGOUT (DEVICE SCOPED)
   * ------------------------------------------------------
   * Purpose :
   * - Invalidate session & refresh token
   * - Deactivate device binding
   * ====================================================== */
  async logout(req: any, res: Response, deviceId: string) {
    const sessionId = req.sessionId;

    if (!sessionId) {
      throw new UnauthorizedException(USER.SESSION_EXPIRED);
    }

    await Promise.all([
      this.redis.delete(`session:${sessionId}`),
      this.redis.delete(`refresh:${sessionId}`),
      this.userDeviceModel.updateOne(
        { sessionId, deviceId },
        { isActive: false },
      ),
    ]);

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.clearCookie('sessionId');

    return {
      message: USER.LOGOUT,
      statusCode: HttpStatus.OK,
    };
  }

  /* ======================================================
   * DELETE / RESTORE HELPERS
   * ------------------------------------------------------
   * Purpose :
   * - Soft delete authentication record
   * - Restore user credentials securely
   * ====================================================== */
  async delete(profileId: string, options?: any) {
    const user = await this.softDelete({ profileId }, options);

    if (!user) {
      throw new NotFoundException(USER.NOT_FOUND);
    }

    return {
      statusCode: HttpStatus.OK,
      message: USER.DELETED,
      data: user,
    };
  }

  async restoreUser(
    data: {
      profileId: string;
      mobile: string;
      email?: string;
      password: string;
      isDeleted: boolean;
      status: UserStatus;
      loginId: string;
    },
    session: ClientSession,
  ) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    await this.updateOne(
      { profileId: data.profileId },
      {
        password: hashedPassword,
        email: data.email,
        isDeleted: false,
        status: UserStatus.ACTIVE,
      },
      { session },
    );
  }
}
