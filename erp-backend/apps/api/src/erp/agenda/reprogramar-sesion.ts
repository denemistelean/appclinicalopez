/**
 * En este sistema "reprogramar" edita la misma fila cli_cita (AgendaService.update).
 * No se crea cita nueva ni se marca REPROGRAMADA vía API actual.
 * Por tanto cli_hd_cita_sesion (UK por id_cita) sigue apuntando a la misma cita.
 */
export type ModoReprogramacion = 'editar_misma_cita' | 'crear_cita_nueva';

export function reprogramacionConservaVinculoSesion(modo: ModoReprogramacion): boolean {
  return modo === 'editar_misma_cita';
}

/**
 * Si en el futuro se creara cita nueva y la vieja pasara a REPROGRAMADA,
 * el vínculo debería trasladarse (UPDATE id_cita) o liberarse (soft-delete).
 */
export function accionVinculoAlReprogramar(
  modo: ModoReprogramacion,
): 'conservar' | 'trasladar_o_liberar' {
  return modo === 'editar_misma_cita' ? 'conservar' : 'trasladar_o_liberar';
}

/** Estados que liberan el número de sesión del plan (soft-delete del vínculo). */
export function debeLiberarVinculoSesion(estado: string): boolean {
  return ['CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA'].includes(String(estado || '').toUpperCase());
}
