import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * La empresa sale de la sede ya validada o del registro padre.
 * Un id_unidad enviado por el cliente no participa en la decisión.
 */
export function unidadDesdeSede(
  idUnidadSede: number | null | undefined,
  idUnidadCliente?: unknown,
): number {
  void idUnidadCliente;
  if (idUnidadSede == null || !Number.isFinite(Number(idUnidadSede))) {
    throw new BadRequestException('La sede no existe o no tiene empresa asignada');
  }
  return Number(idUnidadSede);
}

/** Cambiar de sede solo es válido dentro de la misma empresa. */
export function exigirMismaEmpresa(
  idUnidadActual: number | null | undefined,
  idUnidadDestino: number,
): void {
  if (idUnidadActual == null) return;
  if (Number(idUnidadActual) !== Number(idUnidadDestino)) {
    throw new ForbiddenException('No se puede mover el registro a una sede de otra empresa');
  }
}

export function exigirOperaFinanzas(operaFinanzas: number | null | undefined): void {
  if (Number(operaFinanzas) !== 1) {
    throw new ForbiddenException('Esta empresa no registra operaciones financieras');
  }
}

/**
 * Paciente sin sede: la empresa es la del contexto autorizado, o null.
 * No se infiere López ni ninguna otra empresa.
 */
export function unidadRegistroPaciente(input: {
  idUnidadSede: number | null;
  idUnidadActual: number | null;
  idUnidadContexto: number | null;
  idUnidadCliente?: unknown;
}): number | null {
  void input.idUnidadCliente;
  if (input.idUnidadSede != null) {
    exigirMismaEmpresa(input.idUnidadActual, input.idUnidadSede);
    return Number(input.idUnidadSede);
  }
  if (input.idUnidadActual != null) return Number(input.idUnidadActual);
  return input.idUnidadContexto;
}
