import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  exigirMismaEmpresa,
  exigirOperaFinanzas,
  unidadDesdeSede,
  unidadRegistroPaciente,
} from './unidad-atribucion';
import { unidadAls } from './unidad-contexto';

describe('atribución empresarial', () => {
  it('asigna la empresa de la sede y descarta el id enviado por el cliente', () => {
    expect(unidadDesdeSede(1, 2)).toBe(1);
    expect(unidadDesdeSede(2, 1)).toBe(2);
    expect(unidadDesdeSede(2, 99)).toBe(2);
  });

  it('rechaza una sede sin empresa en lugar de inferir una', () => {
    expect(() => unidadDesdeSede(null, 1)).toThrow(BadRequestException);
    expect(() => unidadDesdeSede(undefined)).toThrow(BadRequestException);
  });

  it('impide mover un registro a una sede de otra empresa', () => {
    expect(() => exigirMismaEmpresa(1, 2)).toThrow(ForbiddenException);
    expect(() => exigirMismaEmpresa(2, 1)).toThrow(ForbiddenException);
    expect(() => exigirMismaEmpresa(1, 1)).not.toThrow();
    expect(() => exigirMismaEmpresa(null, 2)).not.toThrow();
  });

  it('bloquea finanzas cuando opera_finanzas es cero', () => {
    expect(() => exigirOperaFinanzas(0)).toThrow(ForbiddenException);
    expect(() => exigirOperaFinanzas(null)).toThrow(ForbiddenException);
    expect(() => exigirOperaFinanzas(1)).not.toThrow();
  });

  it('no asigna empresa a un paciente sin sede ni contexto', () => {
    expect(
      unidadRegistroPaciente({
        idUnidadSede: null,
        idUnidadActual: null,
        idUnidadContexto: null,
        idUnidadCliente: 1,
      }),
    ).toBeNull();
  });

  it('usa la sede, y si no hay sede usa solo el contexto autorizado', () => {
    expect(
      unidadRegistroPaciente({
        idUnidadSede: 2,
        idUnidadActual: null,
        idUnidadContexto: 1,
        idUnidadCliente: 9,
      }),
    ).toBe(2);
    expect(
      unidadRegistroPaciente({
        idUnidadSede: null,
        idUnidadActual: null,
        idUnidadContexto: 1,
      }),
    ).toBe(1);
  });

  it('no cambia la empresa de registro al quitar la sede', () => {
    expect(
      unidadRegistroPaciente({
        idUnidadSede: null,
        idUnidadActual: 1,
        idUnidadContexto: 2,
      }),
    ).toBe(1);
  });

  it('aísla la empresa entre solicitudes simultáneas', async () => {
    const a = unidadAls.run({ idUnidad: 1, roleId: 1, operaFinanzas: 0 }, async () => {
      await new Promise((r) => setTimeout(r, 20));
      return unidadAls.getStore()?.idUnidad;
    });
    const b = unidadAls.run({ idUnidad: 2, roleId: 4, operaFinanzas: 1 }, async () => {
      await new Promise((r) => setTimeout(r, 5));
      return unidadAls.getStore()?.idUnidad;
    });
    await expect(Promise.all([a, b])).resolves.toEqual([1, 2]);
  });
});
