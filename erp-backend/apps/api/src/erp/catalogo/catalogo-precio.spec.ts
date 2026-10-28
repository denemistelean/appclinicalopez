import { prepararVigencia } from './catalogo-precio';

describe('vigencias de Sorela', () => {
  const abierta = { monto: 80, vigente_desde: '2026-01-01', vigente_hasta: null, motivo: 'Inicial' };

  it('cierra el precio abierto el día anterior al nuevo', () => {
    const resultado = prepararVigencia([abierta], {
      monto: 90, vigente_desde: '2026-06-01', vigente_hasta: null, motivo: 'Ajuste',
    });
    expect('error' in resultado).toBe(false);
    if ('error' in resultado) return;
    expect(resultado.vigencias[0].vigente_hasta).toBe('2026-05-31');
    expect(resultado.vigencias[1].monto).toBe(90);
  });

  it('rechaza un precio que empieza el mismo día que el abierto', () => {
    const resultado = prepararVigencia([abierta], {
      monto: 90, vigente_desde: '2026-01-01', vigente_hasta: null, motivo: 'Ajuste',
    });
    expect(resultado).toEqual({ error: 'Debe iniciar después de 2026-01-01, inicio del precio vigente abierto.' });
  });

  it('exige motivo y monto', () => {
    const monto = prepararVigencia([], { monto: 0, vigente_desde: '2026-01-01', vigente_hasta: null, motivo: 'x' });
    const motivo = prepararVigencia([], { monto: 10, vigente_desde: '2026-01-01', vigente_hasta: null, motivo: '  ' });
    expect('error' in monto && monto.error).toContain('mayor que 0');
    expect('error' in motivo && motivo.error).toContain('motivo');
  });
});
