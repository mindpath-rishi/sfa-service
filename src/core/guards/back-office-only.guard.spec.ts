import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BackOfficeOnlyGuard,
  hasMobileAppAccess,
} from './back-office-only.guard';

const ctx = (user: unknown) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guard = (flag: boolean) =>
  new BackOfficeOnlyGuard({
    getAllAndOverride: () => flag,
  } as unknown as Reflector);

describe('BackOfficeOnlyGuard', () => {
  it.each(['ADMIN', 'SUPER_ADMIN', 'Super Admin', ' admin '])(
    'allows %s',
    (role) => expect(guard(true).canActivate(ctx({ role }))).toBe(true),
  );

  it('allows when roleId is admin', () => {
    expect(
      guard(true).canActivate(ctx({ role: 'x', roleId: 'SUPER_ADMIN' })),
    ).toBe(true);
  });

  it.each(['SALESMAN', 'SALES', 'MANAGER', 'TEAM_LEADER', '', undefined])(
    'blocks %s',
    (role) =>
      expect(() => guard(true).canActivate(ctx({ role }))).toThrow(
        ForbiddenException,
      ),
  );

  it('blocks when there is no user', () => {
    expect(() => guard(true).canActivate(ctx(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('ignores routes without the decorator', () => {
    expect(guard(false).canActivate(ctx({ role: 'SALESMAN' }))).toBe(true);
  });
});

describe('hasMobileAppAccess', () => {
  it.each(['SALESMAN', 'TEAM_LEADER', 'MANAGER'])(
    'lets %s log in on mobile',
    (name) => {
      expect(hasMobileAppAccess('android', { name, roleId: name })).toBe(true);
      expect(hasMobileAppAccess('ios', { name, roleId: name })).toBe(true);
    },
  );

  it.each(['ADMIN', 'SUPER_ADMIN', 'Super Admin'])(
    'blocks %s on mobile but not on web',
    (name) => {
      expect(hasMobileAppAccess('android', { name })).toBe(false);
      expect(hasMobileAppAccess('ios', { roleId: name })).toBe(false);
      expect(hasMobileAppAccess('web', { name })).toBe(true);
    },
  );

  it('blocks roles flagged isSystemAdmin on mobile', () => {
    expect(
      hasMobileAppAccess('android', { name: 'OPS', isSystemAdmin: true }),
    ).toBe(false);
  });

  it('treats a missing device type as mobile', () => {
    expect(hasMobileAppAccess(undefined, { name: 'ADMIN' })).toBe(false);
  });
});
