import { ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  function armar(opts: {
    permiso: boolean;
    unidad: { idUnidad: number; roleId: number; operaFinanzas: number };
    required?: { modulo: string; accion: string } | undefined;
  }) {
    const reflector = {
      getAllAndOverride: jest.fn(() => opts.required),
    };
    const dataSource = {
      query: jest.fn(async (_sql: string, params: any[]) => {
        return opts.permiso && params[0] === opts.unidad.roleId ? [{ ok: 1 }] : [];
      }),
    };
    const unidad = {
      resolver: jest.fn(async () => opts.unidad),
    };
    const guard = new PermissionsGuard(reflector as any, dataSource as any, unidad as any);
    const request: any = {
      user: { userId: 1, roleId: 1 },
      headers: { 'x-unidad-id': String(opts.unidad.idUnidad) },
    };
    return { guard, request, dataSource, unidad };
  }

  it('autoriza con el rol de la membresía y no con el roleId del JWT', async () => {
    const { guard, request, dataSource } = armar({
      permiso: true,
      unidad: { idUnidad: 2, roleId: 4, operaFinanzas: 1 },
      required: { modulo: 'AGENDA', accion: 'ver_cita' },
    });
    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as any),
    ).resolves.toBe(true);
    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [4, 'AGENDA', 'ver_cita']);
    expect(request.unidad.roleId).toBe(4);
    expect(request.user.roleId).toBe(1);
  });

  it('niega el permiso cuando el rol de la membresía no lo tiene', async () => {
    const { guard, request } = armar({
      permiso: false,
      unidad: { idUnidad: 1, roleId: 3, operaFinanzas: 0 },
      required: { modulo: 'FACTURACION', accion: 'crear_pago' },
    });
    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sin RequirePermissions: permite aunque resolver falle (login / mias)', async () => {
    const reflector = { getAllAndOverride: jest.fn(() => undefined) };
    const dataSource = { query: jest.fn() };
    const unidad = {
      resolver: jest.fn(async () => {
        throw new Error('Indique la empresa activa');
      }),
    };
    const guard = new PermissionsGuard(reflector as any, dataSource as any, unidad as any);
    const request: any = { user: { userId: 1 }, headers: {} };
    await expect(
      guard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as any),
    ).resolves.toBe(true);
    expect(request.unidad).toBeUndefined();
    expect(dataSource.query).not.toHaveBeenCalled();
  });
});
