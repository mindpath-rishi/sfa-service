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
import { AnyCatcher } from 'rxjs/internal/AnyCatcher';
import { jwtConfig } from 'src/core/config/jwt.config';
import { Employee } from 'src/core/database/mongo/schema/employee.schema';

@Injectable()
export class UserService extends MongoRepository<User> {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisRepository,
    mongo: MongoService,
    @InjectModel(Employee.name) private readonly employeeModel: Model<Employee>,
  ) {
    // ✅ ONE LINE – no repetition, no timing issue
    super(mongo.getModel(User.name, UserSchema));
  }

  /* ======================================================
   * CREATE USER
   * ====================================================== */

  async createUser(
    data: {
      profileId: string;
      mobile: string;
      email?: string;
      password: string;
      agent: Agent;
    },
    session?: any,
  ) {
    try {
      /* ---------- PASSWORD HASH ---------- */
      const hashedPassword = await bcrypt.hash(data.password, 10);

      /* ---------- CREATE USER ---------- */
      const user = await this.save(
        {
          profileId: data.profileId,
          mobile: data.mobile,
          email: data.email?.toLowerCase(),
          password: hashedPassword,
          agent: data.agent,
          status: UserStatus.ACTIVE,
        },
        { session },
      );

      return {
        profileId: user.profileId,
        mobile: user.mobile,
        email: user.email,
        agent: user.agent,
      };
    } catch (err: any) {
      /* ---------- DUPLICATE KEY (COMPOSITE INDEX) ---------- */
      if (err?.code === 11000) {
        // Example:
        // { mobile: "9876", agent: "ECOMMERCE" }
        // { email: "a@b.com", agent: "BACK_OFFICE" }
        throw new ForbiddenException(USER.DUPLICATE);
      }

      throw err;
    }
  }

  /* ======================================================
   * LOGIN
   * ====================================================== */

  async login(body: LoginDto, agent: Agent, sessionId: string) {
    const { mobile, password } = body;

    console.log(body);

    if (!agent) {
      throw new BadRequestException(USER.AGENT_MISSED);
    }

    const user: any = await this.findOneWithSelect(
      { mobile, agent: agent as Agent },
      '+password',
    );

    if (!user) {
      throw new UnauthorizedException(USER.INVALID_CREDENTIALS);
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(USER.BLOCKED);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new UnauthorizedException(USER.INVALID_CREDENTIALS);
    }

    /* ==================== PROFILE JOIN ==================== */
    let profile: any = null;


    if (user.agent === Agent.BACK_OFFICE) {
      profile = await this.employeeModel.findOne({
        employeeId: user.profileId,
      });
    }

    if (!profile) {
      throw new ForbiddenException(USER.PROFILE_NOT_FOUND);
    }

    /* ==================== SESSION ==================== */
    await this.redis.setJson(
      `session:${sessionId}`,
      {
        type: 'USER',
        profileId: user.profileId,
        role: user.role,
        createdAt: new Date().toISOString(),
      },
      60 * 60 * 24 * 7,
    );

    /* ==================== TOKENS ==================== */
    const expiresIn = '15m';
    const expiresInMs = 15 * 60 * 1000;
    const refreshToken = randomUUID();

    await this.redis.setJson(
      `refresh:${sessionId}`,
      {
        hash: await bcrypt.hash(refreshToken, 10),
      },
      60 * 60 * 24 * 7,
    );

    console.log(profile);

    const accessToken = this.jwtService.sign(
      {
        sub: user.profileId,
        role: user.role,
        sid: sessionId,
        name: profile?.name,
      },
      { expiresIn, issuer: jwtConfig.issuer, audience: jwtConfig.audience },
    );

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
   * REFRESH
   * ====================================================== */

  async refresh(sessionId: string, refreshToken: string) {
    const stored = await this.redis.getJson<{ hash: string }>(
      `refresh:${sessionId}`,
    );

    if (!stored) {
      throw new UnauthorizedException(USER.SESSION_EXPIRED);
    }

    const valid = await bcrypt.compare(refreshToken, stored.hash);
    if (!valid) {
      throw new UnauthorizedException(USER.INVALID_REFRESH_TOKEN);
    }

    const session = await this.redis.getJson<any>(`session:${sessionId}`);

    if (!session || session.type !== 'USER') {
      throw new UnauthorizedException(USER.INVALID_REFRESH_TOKEN);
    }

    const expiresIn: any = USER.EXPIRED_IN;
    const expiresInMs: number = USER.EXPIRED_IN_MILLISECONDS;

    const accessToken = this.jwtService.sign(
      {
        sub: session.profileId,
        role: session.role,
        sid: sessionId,
      },
      { expiresIn, issuer: jwtConfig.issuer, audience: jwtConfig.audience },
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
   * LOGOUT
   * ====================================================== */
  async logout(req: any, res: Response) {
    const sessionId = req.sessionId;

    if (!sessionId) {
      throw new UnauthorizedException(USER.SESSION_EXPIRED);
    }

    const sessionKey = `session:${sessionId}`;
    const refreshKey = `refresh:${sessionId}`;

    /* ---------- Check session exists ---------- */
    const sessionExists = await this.redis.exists(sessionKey);

    if (!sessionExists) {
      throw new UnauthorizedException('Session already expired or invalid');
    }

    /* ---------- Delete session data ---------- */
    await Promise.all([
      this.redis.delete(sessionKey),
      this.redis.delete(refreshKey),
    ]);

    /* ---------- Clear cookies ---------- */
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.clearCookie('sessionId');

    return {
      message: USER.LOGOUT,
      statusCode: HttpStatus.OK,
    };
  }

  /* ======================================================
   * DEACTIVATE CUSTOMER
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
