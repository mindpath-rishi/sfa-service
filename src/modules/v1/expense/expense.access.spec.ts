/**
 * HTTP-level role access for the expense API.
 * Runs the real controller + real BackOfficeOnlyGuard (as a global guard,
 * same as AppModule) with a stub auth guard that reads the role from a header.
 */
import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { BACK_OFFICE_ONLY_KEY } from 'src/core/decorators/back-office-only.decorator';
import { BackOfficeOnlyGuard } from 'src/core/guards/back-office-only.guard';
import { ExpenseController } from './expense.controller';
import { ExpenseService } from './expense.service';

@Injectable()
class HeaderAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    req.user = { role: req.headers['x-role'], sub: 'EMP-1' };
    return true;
  }
}

type Call = [
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  path: string,
  body?: object,
];

const ADMIN_ROUTES: Call[] = [
  ['put', '/expense/config/rates', { rates: [] }],
  ['put', '/expense/config/withdrawal-charges', { slabs: [] }],
  ['get', '/expense/erp-export'],
  ['get', '/expense'],
  ['patch', '/expense/EID1/status', { status: 'APPROVED' }],
  ['delete', '/expense/EID1'],
];

const FIELD_ROUTES: Call[] = [
  ['get', '/expense/preview'],
  ['post', '/expense', { beatIds: [] }],
  ['get', '/expense/me'],
  ['get', '/expense/config/rates'],
  ['get', '/expense/config/withdrawal-charges'],
  ['get', '/expense/EID1'],
];

describe('Expense API role access (HTTP)', () => {
  let app: INestApplication<App>;
  const ok = jest.fn().mockResolvedValue({});
  // 'then' must stay undefined, or Nest treats the stub as a Promise and hangs.
  const service = new Proxy(
    {},
    { get: (_t, key) => (key === 'then' ? undefined : ok) },
  );

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExpenseController],
      providers: [
        { provide: ExpenseService, useValue: service },
        { provide: APP_GUARD, useClass: HeaderAuthGuard },
        { provide: APP_GUARD, useClass: BackOfficeOnlyGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  const send = ([method, path, body]: Call, role?: string) => {
    const req = request(app.getHttpServer())[method](path);
    if (role) req.set('x-role', role);
    return body ? req.send(body) : req;
  };

  describe.each(['SALESMAN', 'TEAM_LEADER', 'MANAGER', undefined])(
    'role %s',
    (role) => {
      it.each(ADMIN_ROUTES)('is forbidden: %s %s', async (...call) => {
        const res = await send(call, role);
        expect(res.status).toBe(403);
        expect((res.body as { message: string }).message).toBe(
          'This action is only available to back-office users',
        );
      });
    },
  );

  describe.each(['ADMIN', 'SUPER_ADMIN'])('role %s', (role) => {
    it.each(ADMIN_ROUTES)('is allowed: %s %s', async (...call) => {
      const res = await send(call, role);
      expect(res.status).toBeLessThan(300);
    });
  });

  describe.each(['SALESMAN', 'MANAGER', 'ADMIN'])('role %s', (role) => {
    it.each(FIELD_ROUTES)('can use field route: %s %s', async (...call) => {
      const res = await send(call, role);
      expect(res.status).toBeLessThan(300);
    });
  });
});

describe('Expense admin routes keep the @BackOfficeOnly marker', () => {
  const reflector = new Reflector();
  const marked = (target: object) =>
    reflector.get<boolean>(BACK_OFFICE_ONLY_KEY, target as never) === true;

  it('expense has exactly the 6 admin routes', () => {
    const marks = Object.getOwnPropertyNames(
      ExpenseController.prototype,
    ).filter((key) =>
      marked(
        (ExpenseController.prototype as unknown as Record<string, object>)[key],
      ),
    );
    expect(marks).toHaveLength(ADMIN_ROUTES.length);
  });
});
