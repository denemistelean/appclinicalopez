import {
  decidirSyncVinculo,
  escenarioDosFinalizacionesConcurrentes,
  escenarioFinalizarFueraDeOrden,
  numerosEfectivosPlan,
  numeroSiguienteConAbiertas,
  planFormularioDifiereDeVinculo,
  preseleccionDesdeVinculo,
  usarPreseleccionVinculo,
} from './cita-sesion-sync';
import { numeroSiguienteSesion } from './sesiones-pendientes';

describe('cita-sesion-sync', () => {
  const vinculoA = {
    id_cita_sesion: 9,
    id_hd_paquete: 10,
    id_item: 100,
    numero_sesion: 1,
    estado_registro: 'ACTIVO',
  };

  it('preselecciona vínculo si no hay borrador con plan/ítem', () => {
    expect(usarPreseleccionVinculo(null)).toBe(true);
    expect(usarPreseleccionVinculo({ id_hd_paquete: null, id_item: null })).toBe(true);
    expect(usarPreseleccionVinculo({ id_hd_paquete: 10, id_item: 100 })).toBe(false);
    expect(preseleccionDesdeVinculo(null, vinculoA)).toEqual({
      id_hd_paquete: 10,
      id_item: 100,
    });
    expect(preseleccionDesdeVinculo({ id_hd_paquete: 20, id_item: 200 }, vinculoA)).toEqual({
      id_hd_paquete: 20,
      id_item: 200,
    });
  });

  it('al descontar plan A upserta el vínculo con numero = sesiones_usadas', () => {
    expect(
      decidirSyncVinculo(
        { descontado: true, idPaquete: 10, idItem: 100, numeroSesion: 1 },
        vinculoA,
      ),
    ).toEqual({ tipo: 'upsert', idPaquete: 10, idItem: 100, numeroSesion: 1 });
  });

  it('cita ligada a A y se finaliza con B → upsert a B', () => {
    expect(
      decidirSyncVinculo(
        { descontado: true, idPaquete: 20, idItem: 200, numeroSesion: 1 },
        vinculoA,
      ),
    ).toEqual({ tipo: 'upsert', idPaquete: 20, idItem: 200, numeroSesion: 1 });
  });

  it('cita ligada y finaliza sin plan → liberar', () => {
    const acc = decidirSyncVinculo(
      { descontado: false, idPaquete: null, idItem: null, numeroSesion: null },
      vinculoA,
    );
    expect(acc.tipo).toBe('liberar');
    if (acc.tipo === 'liberar') {
      expect(acc.idCitaSesion).toBe(9);
      expect(acc.antiguos.id_hd_paquete).toBe(10);
    }
  });

  it('cita sin ligar finalizada con plan → upsert (crea vínculo)', () => {
    expect(
      decidirSyncVinculo(
        { descontado: true, idPaquete: 10, idItem: 100, numeroSesion: 1 },
        null,
      ),
    ).toEqual({ tipo: 'upsert', idPaquete: 10, idItem: 100, numeroSesion: 1 });
  });

  it('sin descuento y sin vínculo → noop (idempotente / sin fila que borrar)', () => {
    expect(
      decidirSyncVinculo(
        { descontado: false, idPaquete: null, idItem: null, numeroSesion: null },
        null,
      ),
    ).toEqual({ tipo: 'noop' });
    expect(
      decidirSyncVinculo(
        { descontado: false, idPaquete: null, idItem: null, numeroSesion: null },
        { ...vinculoA, estado_registro: 'ELIMINADO' },
      ),
    ).toEqual({ tipo: 'noop' });
  });

  it('aviso si el formulario elige otro ítem/plan que el vínculo', () => {
    expect(planFormularioDifiereDeVinculo({ id_item: 100, id_hd_paquete: 10 }, vinculoA)).toBe(
      false,
    );
    expect(planFormularioDifiereDeVinculo({ id_item: 200 }, vinculoA)).toBe(true);
    expect(planFormularioDifiereDeVinculo({ id_hd_paquete: 20 }, vinculoA)).toBe(true);
    expect(planFormularioDifiereDeVinculo({ id_item: null }, vinculoA)).toBe(false);
  });

  it('siguiente sesión tras FINALIZADA con vínculo: usadas + 1 (no cuenta como vigente)', () => {
    // max ligado incluye FINALIZADA; vigente solo PENDIENTE/CONFIRMADA/EN_ATENCION
    expect(numeroSiguienteSesion(1, 1)).toBe(2);
    expect(numeroSiguienteSesion(2, 2)).toBe(3);
  });

  /**
   * Dos finalizaciones simultáneas del mismo plan: FOR UPDATE en cli_hd_paquete
   * (y componente) serializa; numeroSesion = sesiones_usadas tras cada incremento → 1 y 2.
   */
  it('dos finalizaciones concurrentes: FOR UPDATE evita el mismo numero definitivo', () => {
    const esc = escenarioDosFinalizacionesConcurrentes();
    expect(esc.numeroPrimera).toBe(1);
    expect(esc.numeroSegunda).toBe(2);
    expect(esc.usadasFinales).toBe(2);
    expect(esc.sinColisionDefinitivos).toBe(true);
    // Sync de cada TX escribe ese numeroSesion en cli_hd_cita_sesion (misma TX que el lock).
    expect(
      decidirSyncVinculo(
        { descontado: true, idPaquete: 10, idItem: 100, numeroSesion: esc.numeroPrimera },
        null,
      ),
    ).toEqual({ tipo: 'upsert', idPaquete: 10, idItem: 100, numeroSesion: 1 });
    expect(
      decidirSyncVinculo(
        { descontado: true, idPaquete: 10, idItem: 100, numeroSesion: esc.numeroSegunda },
        null,
      ),
    ).toEqual({ tipo: 'upsert', idPaquete: 10, idItem: 100, numeroSesion: 2 });
  });

  /**
   * Orden inverso: A=sesión 2 PENDIENTE, B=sesión 3 PENDIENTE; se finaliza B primero.
   * descontarSesion + sync: B.numero_sesion = sesiones_usadas (2). A sigue con 2 en disco.
   * UNIQUE es solo por id_cita → sí pueden coexistir dos ACTIVO con el mismo numero_sesion.
   */
  it('finalizar B antes que A: colisión en almacenado; efectivos recalculan A=3', () => {
    // Tras finalizar B con el plan (usadas 1→2): sync upsert B → numero 2
    const syncB = decidirSyncVinculo(
      { descontado: true, idPaquete: 10, idItem: 100, numeroSesion: 2 },
      {
        id_cita_sesion: 2,
        id_hd_paquete: 10,
        id_item: 100,
        numero_sesion: 3,
        estado_registro: 'ACTIVO',
      },
    );
    expect(syncB).toEqual({ tipo: 'upsert', idPaquete: 10, idItem: 100, numeroSesion: 2 });

    const esc = escenarioFinalizarFueraDeOrden();
    expect(esc.vinculoBTrasFinalizar).toBe(2);
    expect(esc.almacenadoA).toBe(2);
    expect(esc.colisionAlmacenados).toBe(true); // mismo numero_sesion en disco
    expect(esc.efectivosTrasB).toEqual(
      expect.arrayContaining([
        { id_cita: 2, numero_sesion: 2, definitivo: true },
        { id_cita: 1, numero_sesion: 3, definitivo: false }, // A recalculada
      ]),
    );
    expect(esc.siguiente).toBe(4); // usadas 2 + 1 abierta + 1
    expect(esc.idCitaSiguiente).toBe(1); // hueco 3 = A

    // Restitución de B: liberar vínculo B; usadas→1; A informativa = 2
    const trasRest = numerosEfectivosPlan(1, [
      {
        id_cita: 1,
        estado: 'PENDIENTE',
        fecha_cita: '2026-11-01',
        hora_inicio: '10:00',
        numero_sesion_almacenado: 2,
      },
    ]);
    expect(trasRest).toEqual([{ id_cita: 1, numero_sesion: 2, definitivo: false }]);
    expect(numeroSiguienteConAbiertas(1, 1)).toBe(3);
  });
});
