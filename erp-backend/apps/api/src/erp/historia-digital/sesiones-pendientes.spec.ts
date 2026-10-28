import {
  fechaSugeridaDesde,
  numeroSiguienteSesion,
  planTieneSesionesPendientes,
} from './sesiones-pendientes';

describe('sesiones pendientes', () => {
  it('calcula fecha sugerida desde última + intervalo', () => {
    expect(fechaSugeridaDesde('2026-10-24', 15)).toBe('2026-11-08');
  });

  it('devuelve null si falta última sesión o intervalo', () => {
    expect(fechaSugeridaDesde(null, 15)).toBeNull();
    expect(fechaSugeridaDesde('2026-10-24', null)).toBeNull();
    expect(fechaSugeridaDesde('2026-10-24', 0)).toBeNull();
  });

  it('siguiente sesión = max(usadas, ligadas) + 1', () => {
    expect(numeroSiguienteSesion(1, 1)).toBe(2);
    expect(numeroSiguienteSesion(0, 0)).toBe(1);
    expect(numeroSiguienteSesion(2, 1)).toBe(3);
  });

  it('plan pendiente si usadas < total', () => {
    expect(planTieneSesionesPendientes(1, 5)).toBe(true);
    expect(planTieneSesionesPendientes(5, 5)).toBe(false);
  });
});
