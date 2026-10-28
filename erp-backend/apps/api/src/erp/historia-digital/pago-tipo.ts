export type TipoPago = 'ADELANTO' | 'ABONO' | 'CANCELACION';

export function redondearMonto(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Deriva o valida el tipo según saldo y sesiones usadas del plan. */
export function resolverTipoPago(input: {
  tipo?: string | null;
  monto: number;
  saldo: number;
  sesionesUsadas: number;
}): { tipo: TipoPago } | { error: string } {
  const monto = redondearMonto(input.monto);
  const saldo = redondearMonto(input.saldo);
  const usadas = Math.max(0, Number(input.sesionesUsadas) || 0);
  if (!(monto > 0)) return { error: 'Indique un monto mayor que cero.' };
  if (!(saldo > 0)) return { error: 'Este plan ya está pagado o tiene exceso de pago.' };
  if (monto > saldo) {
    return { error: `El saldo del plan es ${saldo.toFixed(2)}. No puede registrar un monto mayor.` };
  }

  const esperado: TipoPago =
    monto === saldo ? 'CANCELACION' : usadas === 0 ? 'ADELANTO' : 'ABONO';

  const enviado = String(input.tipo || '')
    .trim()
    .toUpperCase();
  if (!enviado) return { tipo: esperado };

  if (enviado !== 'ADELANTO' && enviado !== 'ABONO' && enviado !== 'CANCELACION') {
    return { error: 'El tipo de pago no es válido.' };
  }
  if (enviado !== esperado) {
    if (esperado === 'CANCELACION') {
      return { error: 'Para cancelar el saldo debe registrar el monto exacto pendiente.' };
    }
    if (esperado === 'ADELANTO') {
      return { error: 'Con sesiones aún no usadas y pago parcial, el tipo debe ser Adelanto.' };
    }
    return { error: 'Con sesiones ya usadas y pago parcial, el tipo debe ser Abono.' };
  }
  return { tipo: esperado };
}

/**
 * Opciones elegibles a mano en el formulario de cobro.
 * CANCELACION no se ofrece: se deriva sola si el monto iguala el saldo
 * (liquidar saldo ≠ anular el plan contratado).
 */
export function opcionesTipoPago(saldo: number, sesionesUsadas: number): TipoPago[] {
  const s = redondearMonto(saldo);
  if (!(s > 0)) return [];
  const usadas = Math.max(0, Number(sesionesUsadas) || 0);
  return usadas === 0 ? ['ADELANTO'] : ['ABONO'];
}
