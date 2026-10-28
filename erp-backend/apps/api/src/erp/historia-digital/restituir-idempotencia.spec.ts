import { descuentosVigentesDelPlan, esUltimaSesionDescontada } from './restituir-ultima';

describe('restitución: solo última sesión del plan (cadena)', () => {
  const base = [
    { id_atencion: 10, numero_sesion: 1, id_movimiento: 1, restituido: false },
    { id_atencion: 20, numero_sesion: 2, id_movimiento: 2, restituido: false },
    { id_atencion: 30, numero_sesion: 3, id_movimiento: 3, restituido: false },
  ];

  it('permite restituir la sesión 3 (última)', () => {
    expect(esUltimaSesionDescontada(30, base)).toBe(true);
    expect(esUltimaSesionDescontada(20, base)).toBe(false);
  });

  it('tras restituir la 3, permite la 2 y rechaza la 1', () => {
    const tras3 = base.map((m) => (m.numero_sesion === 3 ? { ...m, restituido: true } : m));
    expect(descuentosVigentesDelPlan(tras3).map((m) => m.numero_sesion)).toEqual([2, 1]);
    expect(esUltimaSesionDescontada(20, tras3)).toBe(true);
    expect(esUltimaSesionDescontada(10, tras3)).toBe(false);
    expect(esUltimaSesionDescontada(30, tras3)).toBe(false);
  });

  it('ignora descuentos que ya tienen RESTITUCION', () => {
    const todosRestituidos = base.map((m) => ({ ...m, restituido: true }));
    expect(descuentosVigentesDelPlan(todosRestituidos)).toEqual([]);
    expect(esUltimaSesionDescontada(10, todosRestituidos)).toBe(false);
  });
});
