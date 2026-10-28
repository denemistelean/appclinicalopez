export interface VigenciaPrecio {
  vigente_desde: string;
  vigente_hasta: string | null;
  monto: number;
  motivo: string;
}

export function diaAnterior(iso: string): string {
  const fecha = new Date(`${iso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - 1);
  return fecha.toISOString().slice(0, 10);
}

/** Cierra la vigencia abierta si el nuevo precio empieza después, y rechaza cruces. */
export function prepararVigencia(
  actuales: VigenciaPrecio[],
  nueva: VigenciaPrecio,
): { error: string } | { cerrarAbierta: boolean; vigencias: VigenciaPrecio[] } {
  const monto = Number(nueva.monto);
  const desde = String(nueva.vigente_desde || '');
  const hasta = nueva.vigente_hasta ? String(nueva.vigente_hasta) : null;
  const motivo = String(nueva.motivo || '').trim();
  if (!(monto > 0)) return { error: 'El monto debe ser mayor que 0.' };
  if (!desde) return { error: 'Indique la fecha de inicio.' };
  if (hasta && hasta < desde) return { error: 'La fecha fin no puede ser anterior al inicio.' };
  if (!motivo) return { error: 'El motivo del cambio es obligatorio.' };

  const copia = actuales.map((v) => ({ ...v }));
  let abierta: VigenciaPrecio | null = null;
  for (const v of copia) {
    if (v.vigente_hasta == null) {
      abierta = v;
      continue;
    }
    const cruza = (!hasta || hasta >= v.vigente_desde) && v.vigente_hasta >= desde;
    if (cruza) {
      return { error: `Se superpone con la vigencia ${v.vigente_desde} → ${v.vigente_hasta} (S/ ${v.monto}).` };
    }
  }
  if (abierta && (!hasta || hasta >= abierta.vigente_desde)) {
    if (desde <= abierta.vigente_desde) {
      return { error: `Debe iniciar después de ${abierta.vigente_desde}, inicio del precio vigente abierto.` };
    }
    abierta.vigente_hasta = diaAnterior(desde);
  }
  copia.push({ monto, vigente_desde: desde, vigente_hasta: hasta, motivo });
  copia.sort((a, b) => (a.vigente_desde < b.vigente_desde ? -1 : 1));
  return { cerrarAbierta: !!abierta?.vigente_hasta, vigencias: copia };
}
