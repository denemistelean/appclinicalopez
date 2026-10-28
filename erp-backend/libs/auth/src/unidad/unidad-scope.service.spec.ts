import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UnidadScopeService } from './unidad-scope.service';

function servicio(opts: { membresias?: any[]; omni?: { id_rol: number } | null; unidades?: any[] }) {
  const membresias = opts.membresias || [];
  const omni = opts.omni === undefined ? null : opts.omni;
  const unidades = opts.unidades || [];
  const db = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes("nombre = 'OMNI_ADMINISTRADOR'")) {
        return omni ? [omni] : [];
      }
      if (sql.includes('FROM cli_unidad') && sql.includes("estado = 'ACTIVA'") && !sql.includes('cli_usuario_unidad')) {
        return unidades;
      }
      return membresias;
    }),
  };
  return { db, unidad: new UnidadScopeService(db as any) };
}

describe('UnidadScopeService.resolver', () => {
  const lopez = {
    id_unidad: 1,
    id_rol: 3,
    opera_finanzas: 0,
    requiere_comprobante: 0,
    codigo: 'LOPEZ',
    nombre: 'Clínica Estética López',
  };
  const sorela = {
    id_unidad: 2,
    id_rol: 4,
    opera_finanzas: 1,
    requiere_comprobante: 0,
    codigo: 'SORELA',
    nombre: 'Sorela Medic',
  };

  it('usa la única membresía cuando no llega el encabezado', async () => {
    const { unidad } = servicio({ membresias: [lopez] });
    await expect(unidad.resolver(1, undefined)).resolves.toEqual({
      idUnidad: 1,
      roleId: 3,
      operaFinanzas: 0,
      requiereComprobante: 0,
    });
  });

  it('responde 400 si hay varias membresías y no llega el encabezado', async () => {
    const { unidad } = servicio({ membresias: [lopez, sorela] });
    await expect(unidad.resolver(1, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('responde 403 si la empresa no está en las membresías activas', async () => {
    const { unidad } = servicio({ membresias: [lopez] });
    await expect(unidad.resolver(1, '2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(unidad.resolver(1, '99')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('responde 403 si el usuario no tiene ninguna membresía', async () => {
    const { unidad } = servicio({ membresias: [] });
    await expect(unidad.resolver(1, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('toma el rol de la membresía indicada, no un rol global', async () => {
    const { unidad } = servicio({ membresias: [lopez, sorela] });
    await expect(unidad.resolver(1, '2')).resolves.toMatchObject({
      idUnidad: 2,
      roleId: 4,
      operaFinanzas: 1,
    });
    await expect(unidad.resolver(1, '1')).resolves.toMatchObject({ roleId: 3, operaFinanzas: 0 });
  });

  it('rechaza un encabezado que no es numérico', async () => {
    const { unidad } = servicio({ membresias: [lopez] });
    await expect(unidad.resolver(1, 'LOPEZ')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('OMNI opera cualquier unidad activa sin membresía por fila', async () => {
    const { unidad } = servicio({
      omni: { id_rol: 99 },
      unidades: [
        { id_unidad: 1, opera_finanzas: 0, requiere_comprobante: 0, codigo: 'LOPEZ', nombre: 'López' },
        { id_unidad: 2, opera_finanzas: 1, requiere_comprobante: 1, codigo: 'SORELA', nombre: 'Sorela' },
      ],
    });
    await expect(unidad.resolver(7, '2')).resolves.toEqual({
      idUnidad: 2,
      roleId: 99,
      operaFinanzas: 1,
      requiereComprobante: 1,
      omni: true,
    });
    await expect(unidad.membresiasDe(7)).resolves.toHaveLength(2);
  });

  it('OMNI sin encabezado y varias unidades pide empresa activa', async () => {
    const { unidad } = servicio({
      omni: { id_rol: 99 },
      unidades: [
        { id_unidad: 1, opera_finanzas: 0, requiere_comprobante: 0, codigo: 'LOPEZ', nombre: 'López' },
        { id_unidad: 2, opera_finanzas: 1, requiere_comprobante: 0, codigo: 'SORELA', nombre: 'Sorela' },
      ],
    });
    await expect(unidad.resolver(7, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
