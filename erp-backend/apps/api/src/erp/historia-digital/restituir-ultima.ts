export type MovimientoDescuento = {
  id_atencion: number;
  id_movimiento: number;
  numero_sesion: number;
  restituido: boolean;
};

/** Descuentos del plan aún no restituidos, ordenados: última sesión primero. */
export function descuentosVigentesDelPlan(movimientos: MovimientoDescuento[]): MovimientoDescuento[] {
  return movimientos
    .filter((m) => !m.restituido)
    .sort((a, b) => b.numero_sesion - a.numero_sesion || b.id_movimiento - a.id_movimiento);
}

export function esUltimaSesionDescontada(
  idAtencion: number,
  movimientos: MovimientoDescuento[],
): boolean {
  const vigentes = descuentosVigentesDelPlan(movimientos);
  if (!vigentes.length) return false;
  return Number(vigentes[0].id_atencion) === Number(idAtencion);
}
