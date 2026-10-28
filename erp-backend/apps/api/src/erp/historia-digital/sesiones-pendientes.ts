/** Fecha sugerida desde = última sesión + intervalo; null si falta alguno. */
export function fechaSugeridaDesde(
  ultimaSesion: string | null | undefined,
  intervaloDias: number | null | undefined,
): string | null {
  if (!ultimaSesion || !/^\d{4}-\d{2}-\d{2}/.test(String(ultimaSesion))) return null;
  const dias = Number(intervaloDias);
  if (!Number.isFinite(dias) || dias <= 0) return null;
  const base = String(ultimaSesion).slice(0, 10);
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + Math.floor(dias));
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function numeroSiguienteSesion(sesionesUsadas: number, maxNumeroLigado: number): number {
  return Math.max(Number(sesionesUsadas) || 0, Number(maxNumeroLigado) || 0) + 1;
}

export function planTieneSesionesPendientes(sesionesUsadas: number, sesionesTotal: number): boolean {
  return Number(sesionesUsadas) < Number(sesionesTotal);
}
