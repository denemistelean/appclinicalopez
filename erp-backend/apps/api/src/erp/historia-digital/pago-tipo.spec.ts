import { opcionesTipoPago, redondearMonto, resolverTipoPago } from './pago-tipo';

describe('tipo de pago de plan', () => {
  it('deriva Adelanto si no hay sesiones usadas y el monto es menor al saldo', () => {
    expect(resolverTipoPago({ monto: 100, saldo: 250, sesionesUsadas: 0 })).toEqual({ tipo: 'ADELANTO' });
  });

  it('deriva Abono si ya hay sesiones usadas y el monto es menor al saldo', () => {
    expect(resolverTipoPago({ monto: 50, saldo: 150, sesionesUsadas: 1 })).toEqual({ tipo: 'ABONO' });
  });

  it('deriva Cancelación si el monto iguala el saldo', () => {
    expect(resolverTipoPago({ monto: 250, saldo: 250, sesionesUsadas: 0 })).toEqual({ tipo: 'CANCELACION' });
    expect(resolverTipoPago({ monto: 100, saldo: 100, sesionesUsadas: 2 })).toEqual({ tipo: 'CANCELACION' });
  });

  it('rechaza monto mayor al saldo o saldo agotado/exceso', () => {
    expect(resolverTipoPago({ monto: 300, saldo: 250, sesionesUsadas: 0 })).toMatchObject({
      error: expect.stringContaining('250.00'),
    });
    expect(resolverTipoPago({ monto: 10, saldo: 0, sesionesUsadas: 0 })).toMatchObject({
      error: expect.stringContaining('exceso'),
    });
  });

  it('valida el tipo enviado contra el contexto', () => {
    expect(resolverTipoPago({ tipo: 'ABONO', monto: 50, saldo: 250, sesionesUsadas: 0 })).toMatchObject({
      error: expect.stringContaining('Adelanto'),
    });
    expect(resolverTipoPago({ tipo: 'ADELANTO', monto: 50, saldo: 150, sesionesUsadas: 1 })).toMatchObject({
      error: expect.stringContaining('Abono'),
    });
    expect(resolverTipoPago({ tipo: 'CANCELACION', monto: 250, saldo: 250, sesionesUsadas: 0 })).toEqual({
      tipo: 'CANCELACION',
    });
  });

  it('lista opciones válidas según saldo y sesiones', () => {
    expect(opcionesTipoPago(250, 0)).toEqual(['ADELANTO']);
    expect(opcionesTipoPago(100, 2)).toEqual(['ABONO']);
    expect(opcionesTipoPago(0, 1)).toEqual([]);
    expect(redondearMonto(10.005)).toBe(10.01);
  });
});
