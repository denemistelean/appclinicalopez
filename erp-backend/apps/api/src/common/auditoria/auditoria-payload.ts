/** Clave reservada en JSON de sis_auditoria (no columna propia). */
export const AUDIT_ID_UNIDAD = '_id_unidad';

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Anota la unidad activa en el payload de auditoría sin mutar el original.
 * Solo si el valor es un objeto plano (no null, string, array ni primitivo).
 */
export function anotarUnidadEnPayload(payload: unknown, idUnidad: number | null | undefined): unknown {
  if (!esObjetoPlano(payload)) return payload;
  if (idUnidad == null || !Number.isFinite(Number(idUnidad))) {
    return { ...payload };
  }
  return { ...payload, [AUDIT_ID_UNIDAD]: Number(idUnidad) };
}
