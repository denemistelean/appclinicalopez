import {
  accionVinculoAlReprogramar,
  debeLiberarVinculoSesion,
  reprogramacionConservaVinculoSesion,
} from './reprogramar-sesion';

describe('reprogramar cita y vínculo de sesión HD', () => {
  it('al editar la misma cita (comportamiento actual) conserva el vínculo', () => {
    expect(reprogramacionConservaVinculoSesion('editar_misma_cita')).toBe(true);
    expect(accionVinculoAlReprogramar('editar_misma_cita')).toBe('conservar');
  });

  it('si se creara cita nueva, habría que trasladar o liberar el vínculo', () => {
    expect(reprogramacionConservaVinculoSesion('crear_cita_nueva')).toBe(false);
    expect(accionVinculoAlReprogramar('crear_cita_nueva')).toBe('trasladar_o_liberar');
  });

  it('cancelar o no-asistió libera el vínculo; reprogramar por edición no', () => {
    expect(debeLiberarVinculoSesion('CANCELADA')).toBe(true);
    expect(debeLiberarVinculoSesion('NO_ASISTIO')).toBe(true);
    expect(debeLiberarVinculoSesion('PENDIENTE')).toBe(false);
    expect(debeLiberarVinculoSesion('CONFIRMADA')).toBe(false);
  });
});
