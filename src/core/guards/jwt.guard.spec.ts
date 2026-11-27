import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt.guard';

const ctx = (authorization?: string) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ headers: authorization ? { authorization } : {} }),
    }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  const parent = Object.getPrototypeOf(JwtAuthGuard.prototype) as {
    canActivate: (c: ExecutionContext) => Promise<boolean>;
  };
  const guard = (isPublic: boolean) =>
    new JwtAuthGuard({
      getAllAndOverride: () => isPublic,
    } as unknown as Reflector);

  afterEach(() => jest.restoreAllMocks());

  it('public route without token: allowed, token not checked', async () => {
    const spy = jest.spyOn(parent, 'canActivate');
    await expect(guard(true).canActivate(ctx())).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('public route with token: token is read so req.user gets set', async () => {
    const spy = jest.spyOn(parent, 'canActivate').mockResolvedValue(true);
    await expect(guard(true).canActivate(ctx('Bearer x'))).resolves.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('public route with bad token: still allowed', async () => {
    jest
      .spyOn(parent, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());
    await expect(guard(true).canActivate(ctx('Bearer bad'))).resolves.toBe(
      true,
    );
  });

  it('protected route with bad token: rejected', async () => {
    jest
      .spyOn(parent, 'canActivate')
      .mockRejectedValue(new UnauthorizedException());
    await expect(guard(false).canActivate(ctx('Bearer bad'))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
