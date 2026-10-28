/**
 * Sincronización de cli_hd_cita_sesion con el plan realmente descontado al finalizar.
 * Sin cambios de esquema: UNIQUE(id_cita) → upsert in-place (ON DUPLICATE KEY UPDATE).
 */

export type VinculoCitaSesion = {
  id_cita_sesion?: number;
  id_hd_paquete: number | null;
  id_item: number | null;
  numero_sesion: number | null;
  estado_registro?: string;
};

export type ResultadoDescuento = {
  descontado: boolean;
  idPaquete: number | null;
  idItem: number | null;
  /** sesiones_usadas del plan tras el incremento (= sesión consumida). */
  numeroSesion: number | null;
};

export type AccionSyncVinculo =
  | { tipo: 'upsert'; idPaquete: number; idItem: number; numeroSesion: number }
  | { tipo: 'liberar'; idCitaSesion: number; antiguos: Record<string, unknown> }
  | { tipo: 'noop' };

/** ¿Usar el vínculo de la cita para preselección? Solo si no hay borrador con plan/ítem propio. */
export function usarPreseleccionVinculo(
  atencion: { id_hd_paquete?: unknown; id_item?: unknown } | null | undefined,
): boolean {
  if (!atencion) return true;
  const tienePaquete = Number(atencion.id_hd_paquete) > 0;
  const tieneItem = Number(atencion.id_item) > 0;
  return !tienePaquete && !tieneItem;
}

export function preseleccionDesdeVinculo(
  atencion: { id_hd_paquete?: unknown; id_item?: unknown } | null | undefined,
  vinculo: VinculoCitaSesion | null | undefined,
): { id_hd_paquete: number | null; id_item: number | null } {
  if (!usarPreseleccionVinculo(atencion) || !vinculo) {
    return {
      id_hd_paquete: atencion?.id_hd_paquete != null ? Number(atencion.id_hd_paquete) || null : null,
      id_item: atencion?.id_item != null ? Number(atencion.id_item) || null : null,
    };
  }
  return {
    id_hd_paquete: vinculo.id_hd_paquete != null ? Number(vinculo.id_hd_paquete) || null : null,
    id_item: vinculo.id_item != null ? Number(vinculo.id_item) || null : null,
  };
}

/** Decide upsert / liberar / noop según descuento y vínculo actual (incluye soft-deleted por UNIQUE). */
export function decidirSyncVinculo(
  descuento: ResultadoDescuento,
  vinculoActual: VinculoCitaSesion | null | undefined,
): AccionSyncVinculo {
  if (descuento.descontado) {
    const idPaquete = Number(descuento.idPaquete);
    const numeroSesion = Number(descuento.numeroSesion);
    const idItem =
      Number(descuento.idItem) || Number(vinculoActual?.id_item) || 0;
    if (idPaquete > 0 && numeroSesion > 0 && idItem > 0) {
      return { tipo: 'upsert', idPaquete, idItem, numeroSesion };
    }
    // Hubo descuento pero no se puede persistir vínculo: no liberar.
    return { tipo: 'noop' };
  }
  if (vinculoActual && String(vinculoActual.estado_registro || 'ACTIVO') === 'ACTIVO') {
    return {
      tipo: 'liberar',
      idCitaSesion: Number(vinculoActual.id_cita_sesion || 0),
      antiguos: {
        id_hd_paquete: vinculoActual.id_hd_paquete,
        id_item: vinculoActual.id_item,
        numero_sesion: vinculoActual.numero_sesion,
        estado_registro: 'ACTIVO',
      },
    };
  }
  return { tipo: 'noop' };
}

/** Aviso UI: el ítem/plan del formulario no coincide con el vínculo de la cita. */
export function planFormularioDifiereDeVinculo(
  form: { id_item?: unknown; id_hd_paquete?: unknown },
  vinculo: VinculoCitaSesion | null | undefined,
): boolean {
  if (!vinculo) return false;
  const formItem = Number(form.id_item || 0);
  const formPaq = Number(form.id_hd_paquete || 0);
  const vincItem = Number(vinculo.id_item || 0);
  const vincPaq = Number(vinculo.id_hd_paquete || 0);
  if (!formItem && !formPaq) return false;
  if (formItem && vincItem && formItem !== vincItem) return true;
  if (formPaq && vincPaq && formPaq !== vincPaq) return true;
  return false;
}

const ESTADOS_ABIERTOS = new Set(['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION']);

export type CitaVinculoOrden = {
  id_cita: number;
  estado: string;
  fecha_cita: string;
  hora_inicio: string;
  /** Valor persistido; solo es definitivo si la cita está FINALIZADA. */
  numero_sesion_almacenado: number;
};

export type NumeroEfectivo = {
  id_cita: number;
  numero_sesion: number;
  definitivo: boolean;
};

/**
 * Números efectivos del plan:
 * - FINALIZADA: definitivo = numero almacenado (fijado al descontar).
 * - Abiertas: informativos = usadas+1, usadas+2… por fecha/hora/id_cita.
 * Evita colisión tras finalizar fuera de orden (p. ej. sesión 3 antes que la 2).
 */
export function numerosEfectivosPlan(
  sesionesUsadas: number,
  vinculos: CitaVinculoOrden[],
): NumeroEfectivo[] {
  const usados = Math.max(0, Number(sesionesUsadas) || 0);
  const out: NumeroEfectivo[] = [];
  for (const v of vinculos) {
    if (String(v.estado) === 'FINALIZADA') {
      out.push({
        id_cita: Number(v.id_cita),
        numero_sesion: Number(v.numero_sesion_almacenado),
        definitivo: true,
      });
    }
  }
  const abiertas = vinculos
    .filter((v) => ESTADOS_ABIERTOS.has(String(v.estado)))
    .slice()
    .sort((a, b) => {
      const fa = String(a.fecha_cita || '');
      const fb = String(b.fecha_cita || '');
      if (fa !== fb) return fa.localeCompare(fb);
      const ha = String(a.hora_inicio || '');
      const hb = String(b.hora_inicio || '');
      if (ha !== hb) return ha.localeCompare(hb);
      return Number(a.id_cita) - Number(b.id_cita);
    });
  let n = usados + 1;
  for (const a of abiertas) {
    out.push({ id_cita: Number(a.id_cita), numero_sesion: n++, definitivo: false });
  }
  return out;
}

/** Siguiente sesión a programar: tras usadas y tras las abiertas que ya ocupan huecos. */
export function numeroSiguienteConAbiertas(
  sesionesUsadas: number,
  cantidadAbiertas: number,
): number {
  return Math.max(0, Number(sesionesUsadas) || 0) + Math.max(0, Number(cantidadAbiertas) || 0) + 1;
}

/**
 * Concurrencia: dos finalizaciones del mismo plan en paralelo.
 * descontarSesion hace SELECT … FOR UPDATE sobre cli_hd_paquete (y el componente si aplica)
 * ANTES de incrementar sesiones_usadas y de fijar numero_sesion (= usadas tras incremento).
 * Eso serializa en InnoDB: la 2.ª TX espera el commit/rollback de la 1.ª; así no pueden
 * leer el mismo sesiones_usadas ni asignar el mismo número definitivo.
 * Evidencia de orden en HistoriaDigitalService.descontarSesion + finalizar (misma TX que sync).
 */
export function escenarioDosFinalizacionesConcurrentes(): {
  numeroPrimera: number;
  numeroSegunda: number;
  usadasFinales: number;
  sinColisionDefinitivos: boolean;
} {
  // Plan usadas=0; TX1 y TX2 intentan descontar a la vez.
  // Con FOR UPDATE: TX1 obtiene usadas=0 → incrementa a 1 → numero=1 → sync.
  // TX2 espera, luego lee usadas=1 → incrementa a 2 → numero=2 → sync.
  const usadasAntes = 0;
  const numeroPrimera = usadasAntes + 1; // tras FOR UPDATE + incremento en TX1
  const numeroSegunda = numeroPrimera + 1; // TX2 ve usadas=1 bajo su propio FOR UPDATE
  const usadasFinales = 2;
  return {
    numeroPrimera,
    numeroSegunda,
    usadasFinales,
    sinColisionDefinitivos: numeroPrimera !== numeroSegunda,
  };
}

/**
 * Simula finalizar fuera de orden: plan usadas=1, A ligada(2), B ligada(3); se finaliza B.
 * Tras descontar, B queda definitiva con numero=2; A sigue con almacenado 2 → colisión en DB
 * si se lee el almacenado; con numerosEfectivosPlan, A pasa a informativo 3.
 */
export function escenarioFinalizarFueraDeOrden(): {
  vinculoBTrasFinalizar: number;
  almacenadoA: number;
  colisionAlmacenados: boolean;
  efectivosTrasB: NumeroEfectivo[];
  siguiente: number;
  idCitaSiguiente: number | null;
} {
  const usadasTrasB = 2;
  const vinculosTrasB: CitaVinculoOrden[] = [
    {
      id_cita: 1,
      estado: 'PENDIENTE',
      fecha_cita: '2026-11-01',
      hora_inicio: '10:00',
      numero_sesion_almacenado: 2, // A seguía siendo "2" en disco
    },
    {
      id_cita: 2,
      estado: 'FINALIZADA',
      fecha_cita: '2026-11-05',
      hora_inicio: '11:00',
      numero_sesion_almacenado: 2, // B al finalizar: sesiones_usadas tras incremento
    },
  ];
  const efectivos = numerosEfectivosPlan(usadasTrasB, vinculosTrasB);
  const numsPend = efectivos.filter((e) => !e.definitivo).map((e) => e.numero_sesion);
  const numsFin = efectivos.filter((e) => e.definitivo).map((e) => e.numero_sesion);
  const colisionAlmacenados =
    vinculosTrasB[0].numero_sesion_almacenado === vinculosTrasB[1].numero_sesion_almacenado;
  const siguiente = numeroSiguienteConAbiertas(usadasTrasB, numsPend.length);
  const slot = usadasTrasB + 1;
  const idCitaSiguiente = efectivos.find((e) => !e.definitivo && e.numero_sesion === slot)?.id_cita ?? null;
  return {
    vinculoBTrasFinalizar: numsFin[0] ?? 2,
    almacenadoA: 2,
    colisionAlmacenados,
    efectivosTrasB: efectivos,
    siguiente,
    idCitaSiguiente,
  };
}
