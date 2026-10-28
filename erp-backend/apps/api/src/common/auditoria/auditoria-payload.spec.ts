import { anotarUnidadEnPayload, AUDIT_ID_UNIDAD } from './auditoria-payload';

describe('anotarUnidadEnPayload', () => {
  it('clona objeto plano y agrega _id_unidad sin mutar el original', () => {
    const original = { monto: 50, metodo: 'YAPE' };
    const out = anotarUnidadEnPayload(original, 2) as Record<string, unknown>;
    expect(out).toEqual({ monto: 50, metodo: 'YAPE', [AUDIT_ID_UNIDAD]: 2 });
    expect(original).toEqual({ monto: 50, metodo: 'YAPE' });
    expect(out).not.toBe(original);
  });

  it('no altera null, string ni array', () => {
    expect(anotarUnidadEnPayload(null, 1)).toBeNull();
    expect(anotarUnidadEnPayload('texto', 1)).toBe('texto');
    expect(anotarUnidadEnPayload([1, 2], 1)).toEqual([1, 2]);
  });

  it('sin unidad activa solo clona el objeto', () => {
    const original = { a: 1 };
    const out = anotarUnidadEnPayload(original, null) as Record<string, unknown>;
    expect(out).toEqual({ a: 1 });
    expect(out).not.toBe(original);
    expect(out[AUDIT_ID_UNIDAD]).toBeUndefined();
  });
});
