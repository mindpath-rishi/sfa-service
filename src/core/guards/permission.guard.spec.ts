import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PermissionsGuard } from './permission.guard';

type Meta = { public?: boolean; perms?: string[] };

const ctx = (user?: object) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const ROLES: Record<string, object> = {
  ADMIN: { roleId: 'ADMIN', name: 'ADMIN', status: 'ACTIVE', permissions: [] },
  SUPER_ADMIN: {
    roleId: 'SA1',
    name: 'Super Admin',
    status: 'ACTIVE',
    permissions: [],
  },
  SALESMAN: {
    roleId: 'SALESMAN',
    name: 'SALESMAN',
    status: 'ACTIVE',
    permissions: ['SALES_CREATE', 'SALES_VIEW'],
  },
  OFF: { roleId: 'OFF', name: 'OFF', status: 'INACTIVE', permissions: [] },
};

const setup = (
  meta: Meta,
  opts: {
    employee?: object | null;
    positionRole?: string | null;
  } = {},
) => {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? meta.public : meta.perms,
  } as unknown as Reflector;
  const employeeService = {
    findOne: jest.fn().mockResolvedValue(opts.employee ?? null),
  };
  const positionService = {
    findOne: jest
      .fn()
      .mockResolvedValue(
        opts.positionRole ? { roleId: opts.positionRole } : null,
      ),
  };
  const roleService = {
    findOne: jest.fn(({ roleId }: { roleId: string }) =>
      Promise.resolve(ROLES[roleId] ?? null),
    ),
  };
  const guard = new PermissionsGuard(
    reflector,
    employeeService as never,
    roleService as never,
    positionService as never,
  );
  return { guard, employeeService, roleService };
};

const salesman = { userId: 'E1', roleId: 'SALESMAN' };

describe('PermissionsGuard', () => {
  it('skips public routes and routes without @Permissions', async () => {
    await expect(
      setup({ public: true, perms: ['X'] }).guard.canActivate(ctx()),
    ).resolves.toBe(true);
    await expect(setup({}).guard.canActivate(ctx())).resolves.toBe(true);
  });

  it('rejects a protected route with no user', async () => {
    await expect(
      setup({ perms: ['SALES_VIEW'] }).guard.canActivate(ctx()),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('ADMIN is checked like any role (keys come from the seeder)', async () => {
    const { guard } = setup(
      { perms: ['ANYTHING_NEW'] },
      { positionRole: 'ADMIN' },
    );
    await expect(guard.canActivate(ctx({ userId: 'A1' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('Super Admin (any spelling) has every permission', async () => {
    const { guard } = setup(
      { perms: ['ROLE_DELETE'] },
      { positionRole: 'SUPER_ADMIN' },
    );
    await expect(guard.canActivate(ctx({ userId: 'S1' }))).resolves.toBe(true);
  });

  it('field role: allowed with the permission, forbidden without', async () => {
    const ok = setup({ perms: ['SALES_CREATE'] }, { positionRole: 'SALESMAN' });
    await expect(ok.guard.canActivate(ctx(salesman))).resolves.toBe(true);
    const no = setup({ perms: ['ROLE_DELETE'] }, { positionRole: 'SALESMAN' });
    await expect(no.guard.canActivate(ctx(salesman))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('needs every listed permission', async () => {
    const { guard } = setup(
      { perms: ['SALES_VIEW', 'ROLE_VIEW'] },
      { positionRole: 'SALESMAN' },
    );
    await expect(guard.canActivate(ctx(salesman))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('uses the token roleId when the user has no position', async () => {
    const { guard } = setup({ perms: ['SALES_VIEW'] });
    await expect(guard.canActivate(ctx(salesman))).resolves.toBe(true);
  });

  it('employee overrides: allow adds, deny removes', async () => {
    const employee = {
      status: 'ACTIVE',
      permissionOverrides: { allow: ['ROLE_VIEW'], deny: ['SALES_VIEW'] },
    };
    const allow = setup(
      { perms: ['ROLE_VIEW'] },
      { employee, positionRole: 'SALESMAN' },
    );
    await expect(allow.guard.canActivate(ctx(salesman))).resolves.toBe(true);
    const deny = setup(
      { perms: ['SALES_VIEW'] },
      { employee, positionRole: 'SALESMAN' },
    );
    await expect(deny.guard.canActivate(ctx(salesman))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects an inactive employee and an inactive role', async () => {
    const emp = setup(
      { perms: ['SALES_VIEW'] },
      { employee: { status: 'INACTIVE' }, positionRole: 'SALESMAN' },
    );
    await expect(emp.guard.canActivate(ctx(salesman))).rejects.toThrow(
      'Employee account is inactive',
    );
    const role = setup({ perms: ['SALES_VIEW'] }, { positionRole: 'OFF' });
    await expect(role.guard.canActivate(ctx(salesman))).rejects.toThrow(
      'Role is inactive',
    );
  });

  it('caches access per user, but not failures', async () => {
    const { guard, roleService } = setup(
      { perms: ['SALES_VIEW'] },
      { positionRole: 'SALESMAN' },
    );
    await guard.canActivate(ctx(salesman));
    await guard.canActivate(ctx(salesman));
    expect(roleService.findOne).toHaveBeenCalledTimes(1);

    const bad = setup({ perms: ['SALES_VIEW'] }, { positionRole: 'MISSING' });
    await expect(bad.guard.canActivate(ctx({ userId: 'X' }))).rejects.toThrow(
      'Role not found',
    );
    await expect(bad.guard.canActivate(ctx({ userId: 'X' }))).rejects.toThrow(
      'Role not found',
    );
    expect(bad.roleService.findOne).toHaveBeenCalledTimes(2);
  });
});
