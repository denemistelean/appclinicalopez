import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import request from 'supertest';
import { AuditoriaService } from '@app/common';
import { AuditoriaService as AuditoriaApi } from '../common/auditoria/auditoria.service';
import { JwtAuthGuard, PermissionsGuard, UnidadInterceptor, UnidadScopeService } from '@app/auth';
import { InventarioController } from './inventario/inventario.controller';
import { InventarioService } from './inventario/inventario.service';
import { SedesController } from './sedes/sedes.controller';
import { SedesService } from './sedes/sedes.service';
import { PersonalController } from './personal/personal.controller';
import { PersonalService } from './personal/personal.service';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaService } from './agenda/agenda.service';
import { PacientesController } from './pacientes/pacientes.controller';
import { PacientesService } from './pacientes/pacientes.service';
import { DocumentosController } from './documentos/documentos.controller';
import { DocumentosService } from './documentos/documentos.service';
import { HistoriaPacienteController } from './historia-paciente/historia-paciente.controller';
import { HistoriaPacienteService } from './historia-paciente/historia-paciente.service';
import { FotosEvolucionController } from './fotos-evolucion/fotos-evolucion.controller';
import { FotosEvolucionService } from './fotos-evolucion/fotos-evolucion.service';
import { ConsentimientosController } from './consentimientos/consentimientos.controller';
import { ConsentimientosService } from './consentimientos/consentimientos.service';
import { MapaCorporalController } from './mapa-corporal/mapa-corporal.controller';
import { MapaCorporalService } from './mapa-corporal/mapa-corporal.service';
import { NotificacionesController } from './notificaciones/notificaciones.controller';
import { NotificacionesService } from './notificaciones/notificaciones.service';
import { FacturacionController } from './facturacion/facturacion.controller';
import { FacturacionService } from './facturacion/facturacion.service';

/**
 * HTTP real contra controladores, guard de permisos y servicios.
 * La base es un doble en memoria. No abre app_clinica_lopez ni la base `test`.
 */

const MEMBRESIAS: Record<number, any[]> = {
  1: [{ id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'LOPEZ', nombre: 'López' }],
  2: [{ id_unidad: 2, id_rol: 1, opera_finanzas: 1, codigo: 'SORELA', nombre: 'Sorela' }],
  3: [],
  4: [
    { id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'LOPEZ', nombre: 'López' },
    { id_unidad: 2, id_rol: 4, opera_finanzas: 1, codigo: 'SORELA', nombre: 'Sorela' },
  ],
};

class IdentidadGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const raw = req.headers['x-test-user'];
    if (raw == null || raw === '' || raw === '0') return false;
    req.user = { userId: Number(raw), username: `user${raw}`, roleId: 99 };
    return true;
  }
}

function sedeDe(id: number) {
  if (!id) return [];
  return [{ id_sede: id, id_unidad: id === 2 ? 2 : 1, opera_finanzas: id === 2 ? 1 : 0 }];
}

const NOTIFICACIONES = [
  { id_notificacion: 5, id_sede: 2, id_usuario_destino: null, titulo: 'Resultado Sorela', mensaje: 'Diagnostico ajeno confidencial', estado_registro: 'ACTIVO' },
  { id_notificacion: 6, id_sede: 1, id_usuario_destino: null, titulo: 'Aviso Lopez', mensaje: 'Recordatorio propio', estado_registro: 'ACTIVO' },
  { id_notificacion: 7, id_sede: 1, id_usuario_destino: 1, titulo: 'Personal Lopez', mensaje: 'Solo usuario uno', estado_registro: 'ACTIVO' },
  { id_notificacion: 8, id_sede: 1, id_usuario_destino: 2, titulo: 'Personal ajeno', mensaje: 'Para otro usuario', estado_registro: 'ACTIVO' },
  { id_notificacion: 9, id_sede: null, id_usuario_destino: 1, titulo: 'Sin sede', mensaje: 'No atribuible', estado_registro: 'ACTIVO' },
];

function notificacionesVisibles(sql: string, params: any[]) {
  const exigeEmpresa = /cli_sede/i.test(sql) && /id_unidad/i.test(sql);
  const exigeDestino = /id_usuario_destino\s*=\s*\?/i.test(sql);
  if (!exigeEmpresa) return NOTIFICACIONES.filter((n) => n.estado_registro === 'ACTIVO');
  const userId = exigeDestino ? Number(params[0]) : null;
  const unidad = Number(params[exigeDestino ? 1 : 0]);
  return NOTIFICACIONES.filter((n) => {
    if (n.estado_registro !== 'ACTIVO' || n.id_sede == null) return false;
    const unidadSede = n.id_sede === 2 ? 2 : 1;
    if (unidadSede !== unidad) return false;
    if (exigeDestino && n.id_usuario_destino != null && Number(n.id_usuario_destino) !== userId) return false;
    return true;
  });
}

describe('Fase 2C — HTTP de aislamiento (base simulada)', () => {
  let app: INestApplication;
  const escenario = {
    registroPaciente: 1 as number | null,
    registroDuplicado: 1,
    citaAjena: false,
    fallarEn: '' as string,
    permitir: true,
    sqls: [] as string[],
    escrituras: [] as string[],
    runners: 0,
    commits: 0,
    rollbacks: 0,
  };

  function reset() {
    escenario.registroPaciente = 1;
    escenario.registroDuplicado = 1;
    escenario.citaAjena = false;
    escenario.fallarEn = '';
    escenario.permitir = true;
    escenario.sqls = [];
    escenario.escrituras = [];
    escenario.runners = 0;
    escenario.commits = 0;
    escenario.rollbacks = 0;
  }

  function despachar(sql: string, params: any[] = []) {
    escenario.sqls.push(sql);
    if (/^\s*(insert|update|delete)\b/i.test(sql)) escenario.escrituras.push(sql);

    // rolOmniDe menciona cli_usuario_unidad dentro de EXISTS; no confundir con membresías.
    if (sql.includes('OMNI_ADMINISTRADOR')) return [];
    if (sql.includes('FROM cli_usuario_unidad') || sql.includes('cli_usuario_unidad m')) {
      return MEMBRESIAS[Number(params[0])] || [];
    }
    if (sql.includes('sis_permiso')) return escenario.permitir ? [{ ok: 1 }] : [];
    if (sql.includes('SELECT 1 AS ok')) {
      const activa = Number(params[0]);
      const sede = Number(params[1]);
      const unidad = sede === 2 ? 2 : sede === 1 ? 1 : 0;
      return unidad === activa ? [{ ok: 1 }] : [];
    }
    if (sql.includes('id_unidad_registro')) {
      return [{ id_unidad_registro: escenario.registroPaciente }];
    }
    if (sql.includes('FROM cli_paciente')) {
      const id = Number(params[0]);
      const registro = id === 11 ? escenario.registroDuplicado : 1;
      return [{ id_paciente: id, id_unidad_registro: registro, nombres: 'NombreClinico', apellidos: 'Apellido' }];
    }
    if (sql.includes('FROM cli_cita') && sql.includes('fecha_cita')) {
      const lopezCita = { id_cita: 101, id_sede: 1, hora_inicio: '09:00', hora_fin: '09:30', estado: 'PROGRAMADA' };
      const sorelaCita = { id_cita: 202, id_sede: 2, hora_inicio: '09:00', hora_fin: '09:30', estado: 'PROGRAMADA' };
      if (!/id_unidad|cli_sede/i.test(sql)) return [lopezCita, sorelaCita];
      const unidad = Number(params[params.length - 1]);
      return unidad === 2 ? [sorelaCita] : [lopezCita];
    }
    if (sql.includes('LEFT JOIN cli_unidad') && sql.includes('cli_sede')) {
      return sedeDe(Number(params[0]));
    }
    if (sql.includes('FROM cli_personal WHERE') || sql.includes('id_sede_principal FROM cli_personal')) {
      const id = Number(params[0]);
      return [{ id_personal: id, id_sede_principal: id === 9 ? 2 : 1, nombres: 'ANA', apellidos: 'RUIZ' }];
    }
    if (sql.includes('cli_personal_sede') || sql.includes('cli_personal_especialidad')) return [];
    if (sql.includes('cli_personal_certificacion')) {
      return [{ archivo_ruta: 'PERSONAL/000009/cert.pdf', archivo_nombre: 'cert.pdf', archivo_mime: 'application/pdf' }];
    }
    if (sql.includes('cli_personal_credencial') && /^\s*select/i.test(sql)) {
      const idCred = Number(params[0]);
      const idPersonal = Number(params[1]);
      if (idCred === 3 && idPersonal === 4) {
        return [{ id_personal_credencial: 3, id_personal: 4, numero: 'CMP-LOPEZ', tipo: 'CMP' }];
      }
      if (idCred === 8 && idPersonal === 9) {
        return [{ id_personal_credencial: 8, id_personal: 9, numero: 'CMP-SECRETO', tipo: 'CMP' }];
      }
      return [];
    }
    if (sql.includes('FROM cli_sala')) return [{ id_sala: 8, id_sede: 2, nombre: 'BOX SORELA' }];
    if (sql.includes('FROM cli_lote')) {
      const id = Number(params[0]);
      if (id === 3) return [{ id_lote: 3, id_sede: 1, codigo_lote: 'LOTE-LOPEZ', cantidad_actual: 2 }];
      return [{ id_lote: 9, id_sede: 2, codigo_lote: 'LOTE-SORELA', cantidad_actual: 12 }];
    }
    if (sql.includes('FROM cli_documento')) {
      return [
        {
          id_documento: 1,
          titulo: 'Prueba escaneo',
          id_consulta: null,
          id_cita: null,
          id_paciente: 2,
          ruta_relativa: 'PACIENTES/scan.pdf',
          nombre_archivo: 'scan.pdf',
          nombre_paciente: 'Paciente Dos',
        },
      ];
    }
    if (sql.includes('FROM cli_consulta WHERE id_consulta')) return [{ id_unidad: 2 }];
    if (sql.includes('FROM cli_consentimiento WHERE')) {
      return [{ id_consentimiento: 4, id_paciente: 2, id_consulta: 8, id_cita: null, id_sede: 2, estado: 'PENDIENTE' }];
    }
    if (sql.includes('cli_paciente_medida')) return [{ peso_kg: 80, observacion: 'dato clinico ajeno' }];
    if (sql.includes('cli_notificacion')) {
      if (/^\s*(insert|update|delete)\b/i.test(sql)) return { affectedRows: 1, insertId: 50 };
      if (/id_notificacion\s*=\s*\?/i.test(sql) && /^\s*select/i.test(sql)) {
        const row = NOTIFICACIONES.find((n) => n.id_notificacion === Number(params[0]) && n.estado_registro === 'ACTIVO');
        return row ? [row] : [];
      }
      if (sql.includes('COUNT')) return [{ total: notificacionesVisibles(sql, params).length }];
      if (/^\s*select/i.test(sql)) return notificacionesVisibles(sql, params);
    }
    if (sql.includes('COUNT')) return [{ total: 0 }];
    if (/^\s*(insert|update|delete)\b/i.test(sql)) return { affectedRows: 1, insertId: 50 };
    return [];
  }

  beforeAll(async () => {
    const db = {
      query: jest.fn(async (sql: string, params?: any[]) => despachar(sql, params || [])),
      createQueryRunner: () => {
        escenario.runners += 1;
        return {
          connect: async () => undefined,
          startTransaction: async () => undefined,
          commitTransaction: async () => {
            escenario.commits += 1;
          },
          rollbackTransaction: async () => {
            escenario.rollbacks += 1;
          },
          release: async () => undefined,
          query: async (sql: string) => {
            escenario.sqls.push(sql);
            if (/^\s*(insert|update|delete)\b/i.test(sql)) escenario.escrituras.push(sql);
            if (escenario.fallarEn && sql.includes(escenario.fallarEn)) throw new Error('fallo simulado');
            if (sql.includes('COUNT') && sql.includes('cli_cita')) return [{ total: escenario.citaAjena ? 1 : 0 }];
            if (sql.includes('COUNT')) return [{ total: 0 }];
            return { affectedRows: 1 };
          },
        };
      },
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [
        InventarioController,
        SedesController,
        PersonalController,
        AgendaController,
        PacientesController,
        DocumentosController,
        HistoriaPacienteController,
        FotosEvolucionController,
        ConsentimientosController,
        MapaCorporalController,
        NotificacionesController,
        FacturacionController,
      ],
      providers: [
        { provide: getDataSourceToken('APP_DB_CONN'), useValue: db },
        UnidadScopeService,
        PermissionsGuard,
        InventarioService,
        SedesService,
        PersonalService,
        AgendaService,
        PacientesService,
        DocumentosService,
        HistoriaPacienteService,
        FotosEvolucionService,
        ConsentimientosService,
        MapaCorporalService,
        NotificacionesService,
        FacturacionService,
        { provide: AuditoriaService, useValue: { registrar: jest.fn() } },
        { provide: AuditoriaApi, useValue: { registrar: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(IdentidadGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalInterceptors(new UnidadInterceptor());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(reset);

  const lopez = { 'x-test-user': '1', 'x-unidad-id': '1' };
  const sorela = { 'x-test-user': '2', 'x-unidad-id': '2' };

  it('un usuario sin membresía no entra', async () => {
    const res = await request(app.getHttpServer()).get('/inventario/lotes/3').set('x-test-user', '3').set('x-unidad-id', '1');
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/LOTE-LOPEZ/);
  });

  it('un encabezado de otra empresa no suplanta la membresía', async () => {
    const res = await request(app.getHttpServer()).get('/inventario/lotes/3').set('x-test-user', '1').set('x-unidad-id', '2');
    expect(res.status).toBe(403);
  });

  it('varias membresías sin encabezado responden 400', async () => {
    const res = await request(app.getHttpServer()).get('/inventario/lotes/3').set('x-test-user', '4');
    expect(res.status).toBe(400);
  });

  it('un id_unidad en el cuerpo no cambia la empresa y no escribe', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventario/transferencias')
      .set(lopez)
      .send({ id_insumo: 1, id_lote_origen: 3, id_sede_origen: 1, id_sede_destino: 1, cantidad: 1, id_unidad: 2 });
    expect(res.status).toBe(400);
    expect(escenario.escrituras).toEqual([]);
    expect(escenario.runners).toBe(0);
  });

  it('López lee su lote y no el de Sorela; Sorela al revés', async () => {
    const propio = await request(app.getHttpServer()).get('/inventario/lotes/3').set(lopez);
    expect(propio.status).toBe(200);
    expect(propio.body.codigo_lote).toBe('LOTE-LOPEZ');

    const ajeno = await request(app.getHttpServer()).get('/inventario/lotes/9').set(lopez);
    expect(ajeno.status).toBe(403);
    expect(JSON.stringify(ajeno.body)).not.toMatch(/LOTE-SORELA|12/);

    const inverso = await request(app.getHttpServer()).get('/inventario/lotes/3').set(sorela);
    expect(inverso.status).toBe(403);
    expect(JSON.stringify(inverso.body)).not.toMatch(/LOTE-LOPEZ/);

    const propioSorela = await request(app.getHttpServer()).get('/inventario/lotes/9').set(sorela);
    expect(propioSorela.status).toBe(200);
    expect(propioSorela.body.codigo_lote).toBe('LOTE-SORELA');
  });

  it('no transfiere inventario entre empresas', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventario/transferencias')
      .set(lopez)
      .send({ id_insumo: 1, id_lote_origen: 9, id_sede_origen: 1, id_sede_destino: 2, cantidad: 4 });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/LOTE-SORELA/);
    expect(escenario.runners).toBe(0);
    expect(escenario.escrituras).toEqual([]);
  });

  it('López no modifica ni elimina la sala de Sorela; Sorela sí puede eliminarla', async () => {
    const put = await request(app.getHttpServer()).put('/salas/8').set(lopez).send({ nombre: 'Tomada' });
    expect(put.status).toBe(403);
    expect(JSON.stringify(put.body)).not.toMatch(/BOX SORELA/);
    const del = await request(app.getHttpServer()).delete('/salas/8').set(lopez);
    expect(del.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const propia = await request(app.getHttpServer()).delete('/salas/8').set(sorela);
    expect(propia.status).toBe(200);
    expect(escenario.escrituras.some((sql) => sql.includes('cli_sala'))).toBe(true);
  });

  it('no descarga ni elimina la certificación de la otra empresa', async () => {
    const archivo = await request(app.getHttpServer()).get('/personal/9/certificaciones/3/archivo').set(lopez);
    expect(archivo.status).toBe(403);
    expect(JSON.stringify(archivo.body)).not.toMatch(/cert\.pdf|CMP/);
    const baja = await request(app.getHttpServer()).delete('/personal/9/certificaciones/3').set(lopez);
    expect(baja.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('no asigna personal de López a una sede de Sorela', async () => {
    const res = await request(app.getHttpServer())
      .put('/personal/4/sedes')
      .set(lopez)
      .send({ sedes: [2], id_sede_principal: 2 });
    expect(res.status).toBe(403);
    expect(escenario.runners).toBe(0);
    expect(escenario.escrituras).toEqual([]);
  });

  it('no consulta ni asigna roles de agenda de la otra empresa', async () => {
    const lista = await request(app.getHttpServer()).get('/agenda/personal/9/roles').set(lopez);
    expect(lista.status).toBe(403);
    const alta = await request(app.getHttpServer()).post('/agenda/personal/9/roles').set(lopez).send({ id_rol_recurso: 1 });
    expect(alta.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('el documento sin padre se lee en la empresa de registro y se niega en la otra', async () => {
    const ajeno = await request(app.getHttpServer()).get('/documentos/1').set(sorela);
    expect(ajeno.status).toBe(403);
    expect(JSON.stringify(ajeno.body)).not.toMatch(/Prueba escaneo|scan\.pdf/);
    const descarga = await request(app.getHttpServer()).get('/documentos/1/archivo').set(sorela);
    expect(descarga.status).toBe(403);
    const baja = await request(app.getHttpServer()).delete('/documentos/1').set(sorela);
    expect(baja.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const propio = await request(app.getHttpServer()).get('/documentos/1').set(lopez);
    expect(propio.status).toBe(200);
    expect(propio.body.titulo).toBe('Prueba escaneo');
  });

  it('el listado de documentos exige la empresa de registro cuando no hay padre', async () => {
    const res = await request(app.getHttpServer()).get('/documentos').set(lopez);
    expect(res.status).toBe(200);
    expect(escenario.sqls.some((sql) => sql.includes('id_unidad_registro'))).toBe(true);
  });

  it('si el documento no tiene empresa determinable no entrega contenido', async () => {
    escenario.registroPaciente = null;
    const res = await request(app.getHttpServer()).get('/documentos/1').set(lopez);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/Prueba escaneo|scan\.pdf/);
    const otra = await request(app.getHttpServer()).get('/documentos/1/archivo').set(sorela);
    expect(otra.status).toBe(400);
    expect(JSON.stringify(otra.body)).not.toMatch(/Prueba escaneo|scan\.pdf/);
  });

  it('permite antecedentes y mapa de un paciente registrado en otra empresa (ficha compartida)', async () => {
    // Paciente 2 tiene id_unidad_registro=López; Sorela igual puede abrir historia longitudinal.
    const historia = await request(app.getHttpServer()).get('/pacientes/2/medidas').set(sorela);
    expect(historia.status).toBe(200);
    const captura = await request(app.getHttpServer()).get('/mapa-corporal/paciente/2/capturas/frontal').set(sorela);
    expect([200, 404]).toContain(captura.status);
    expect(captura.status).not.toBe(403);
  });

  it('no anula un consentimiento de la otra empresa', async () => {
    const res = await request(app.getHttpServer()).delete('/consentimientos/4').set(lopez);
    expect(res.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('el listado de fotos filtra por el origen empresarial', async () => {
    const res = await request(app.getHttpServer()).get('/fotos-evolucion').set(lopez);
    expect(res.status).toBe(200);
    expect(escenario.sqls.some((sql) => sql.includes('id_unidad_registro') || sql.includes('id_unidad'))).toBe(true);
  });

  it('la fusión se rechaza si una cita es de otra empresa y no deja cambios', async () => {
    escenario.citaAjena = true;
    const res = await request(app.getHttpServer())
      .post('/pacientes/fusionar')
      .set(lopez)
      .send({ id_sobreviviente: 10, id_duplicado: 11 });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/NombreClinico/);
    expect(escenario.rollbacks).toBe(1);
    expect(escenario.commits).toBe(0);
    expect(escenario.escrituras.filter((sql) => sql.includes('UPDATE'))).toEqual([]);
  });

  it('la fusión se rechaza si el paciente duplicado está registrado en otra empresa', async () => {
    escenario.registroDuplicado = 2;
    const res = await request(app.getHttpServer())
      .post('/pacientes/fusionar')
      .set(lopez)
      .send({ id_sobreviviente: 10, id_duplicado: 11 });
    expect(res.status).toBe(403);
    expect(escenario.runners).toBe(0);
    expect(escenario.escrituras).toEqual([]);
  });

  it('un error a mitad de la fusión revierte la transacción', async () => {
    escenario.fallarEn = 'UPDATE cli_consulta';
    const res = await request(app.getHttpServer())
      .post('/pacientes/fusionar')
      .set(lopez)
      .send({ id_sobreviviente: 10, id_duplicado: 11 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(escenario.rollbacks).toBe(1);
    expect(escenario.commits).toBe(0);
  });

  it('un id_unidad en la fusión no se acepta como empresa', async () => {
    const res = await request(app.getHttpServer())
      .post('/pacientes/fusionar')
      .set(lopez)
      .send({ id_sobreviviente: 10, id_duplicado: 11, id_unidad: 2 });
    expect(res.status).toBe(400);
    expect(escenario.runners).toBe(0);
  });

  it('López no registra un pago nuevo', async () => {
    const res = await request(app.getHttpServer())
      .post('/facturacion/pagos')
      .set(lopez)
      .send({ id_paciente: 2, id_sede: 1, fecha_pago: '2026-10-20', monto: 150, concepto: 'SECRETO' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toMatch(/150|SECRETO/);
    expect(escenario.escrituras).toEqual([]);
  });

  it('permite cambiar y eliminar una credencial de la empresa activa', async () => {
    const cambio = await request(app.getHttpServer())
      .patch('/personal/4/credenciales/3')
      .set(lopez)
      .send({ numero: 'CMP-NUEVO' });
    expect(cambio.status).toBe(200);
    expect(escenario.escrituras.some((sql) => sql.includes('cli_personal_credencial'))).toBe(true);
    reset();
    const baja = await request(app.getHttpServer()).delete('/personal/4/credenciales/3').set(lopez);
    expect(baja.status).toBe(200);
    expect(escenario.escrituras.some((sql) => sql.includes('cli_personal_credencial'))).toBe(true);
  });

  it('rechaza credenciales de otra empresa o de otro profesional sin escribir', async () => {
    const patchAjeno = await request(app.getHttpServer())
      .patch('/personal/9/credenciales/8')
      .set(lopez)
      .send({ numero: 'NUEVO' });
    expect(patchAjeno.status).toBe(403);
    expect(JSON.stringify(patchAjeno.body)).not.toMatch(/CMP-SECRETO/);
    const deleteAjeno = await request(app.getHttpServer()).delete('/personal/9/credenciales/8').set(lopez);
    expect(deleteAjeno.status).toBe(403);
    reset();
    const otraCredencial = await request(app.getHttpServer())
      .patch('/personal/4/credenciales/8')
      .set(lopez)
      .send({ numero: 'NUEVO' });
    expect(otraCredencial.status).toBe(404);
    const sinMembresia = await request(app.getHttpServer())
      .delete('/personal/4/credenciales/3')
      .set('x-test-user', '3')
      .set('x-unidad-id', '1');
    expect(sinMembresia.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('la disponibilidad solo devuelve citas de la empresa activa y lo filtra en el SQL', async () => {
    const res = await request(app.getHttpServer())
      .get('/personal/4/disponibilidad')
      .query({ fecha: '2026-10-21' })
      .set(lopez);
    expect(res.status).toBe(200);
    expect(res.body.citas.map((c: any) => c.id_cita)).toEqual([101]);
    expect(res.body.citas.some((c: any) => c.id_sede === 2 || c.id_cita === 202)).toBe(false);
    const cita = escenario.sqls.find((sql) => sql.includes('FROM cli_cita'));
    expect(cita).toMatch(/id_unidad/);
    expect(cita).toMatch(/cli_sede/);

    reset();
    const sorelaRes = await request(app.getHttpServer())
      .get('/personal/9/disponibilidad')
      .query({ fecha: '2026-10-21' })
      .set(sorela);
    expect(sorelaRes.status).toBe(200);
    expect(sorelaRes.body.citas.map((c: any) => c.id_cita)).toEqual([202]);
    expect(sorelaRes.body.citas.some((c: any) => c.id_cita === 101 || c.id_sede === 1)).toBe(false);
  });

  it('no consulta disponibilidad de otra empresa ni de quien no tiene membresía', async () => {
    const otraPersona = await request(app.getHttpServer())
      .get('/personal/9/disponibilidad')
      .query({ fecha: '2026-10-21', id_sede: '2' })
      .set(lopez);
    expect(otraPersona.status).toBe(403);
    expect(JSON.stringify(otraPersona.body)).not.toMatch(/202|101/);
    expect(escenario.sqls.some((sql) => sql.includes('FROM cli_cita'))).toBe(false);

    reset();
    const otraSede = await request(app.getHttpServer())
      .get('/personal/4/disponibilidad')
      .query({ fecha: '2026-10-21', id_sede: '2' })
      .set(lopez);
    expect(otraSede.status).toBe(403);
    expect(escenario.sqls.some((sql) => sql.includes('FROM cli_cita'))).toBe(false);

    reset();
    const sinMembresia = await request(app.getHttpServer())
      .get('/personal/4/disponibilidad')
      .query({ fecha: '2026-10-21' })
      .set('x-test-user', '3');
    expect(sinMembresia.status).toBe(403);
  });

  it('todas=1 solo devuelve notificaciones de la empresa y del destinatario autorizado', async () => {
    const lista = await request(app.getHttpServer()).get('/notificaciones').query({ todas: '1' }).set(lopez);
    expect(lista.status).toBe(200);
    const ids = lista.body.data.map((n: any) => n.id_notificacion);
    expect(ids).toEqual(expect.arrayContaining([6, 7]));
    expect(ids).not.toEqual(expect.arrayContaining([5, 8, 9]));
    expect(JSON.stringify(lista.body)).not.toMatch(/Diagnostico ajeno confidencial|Para otro usuario|No atribuible/);
    const consulta = escenario.sqls.find((sql) => sql.includes('FROM cli_notificacion') && sql.includes('SELECT *'));
    expect(consulta).toMatch(/id_usuario_destino/);
    expect(consulta).toMatch(/id_sede IS NOT NULL/);
    expect(consulta).toMatch(/cli_sede/);
    expect(consulta).toMatch(/id_unidad/);

    reset();
    const sorelaLista = await request(app.getHttpServer()).get('/notificaciones').query({ todas: '1' }).set(sorela);
    expect(sorelaLista.status).toBe(200);
    expect(sorelaLista.body.data.map((n: any) => n.id_notificacion)).toEqual([5]);
    expect(JSON.stringify(sorelaLista.body)).not.toMatch(/Recordatorio propio|Solo usuario uno|Para otro usuario|No atribuible/);
  });

  it('no consulta, lee, edita ni elimina una notificación de otra empresa', async () => {
    const ver = await request(app.getHttpServer()).get('/notificaciones/5').set(lopez);
    expect(ver.status).toBe(403);
    expect(JSON.stringify(ver.body)).not.toMatch(/Diagnostico ajeno confidencial/);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const editar = await request(app.getHttpServer()).patch('/notificaciones/5').send({ titulo: 'intruso' }).set(lopez);
    expect(editar.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const leer = await request(app.getHttpServer()).post('/notificaciones/5/leer').set(lopez);
    expect(leer.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const baja = await request(app.getHttpServer()).delete('/notificaciones/5').set(lopez);
    expect(baja.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('una notificación privada de otro usuario y una sin sede quedan bloqueadas', async () => {
    const ajena = await request(app.getHttpServer()).get('/notificaciones/8').set(lopez);
    expect(ajena.status).toBe(403);
    expect(JSON.stringify(ajena.body)).not.toMatch(/Para otro usuario/);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const baja = await request(app.getHttpServer()).delete('/notificaciones/8').set(lopez);
    expect(baja.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const sinSede = await request(app.getHttpServer()).get('/notificaciones/9').set(lopez);
    expect(sinSede.status).toBe(403);
    expect(JSON.stringify(sinSede.body)).not.toMatch(/No atribuible/);
    expect(escenario.escrituras).toEqual([]);
  });

  it('el usuario autorizado opera sus notificaciones y no crea una sin sede o en otra empresa', async () => {
    const propia = await request(app.getHttpServer()).get('/notificaciones/7').set(lopez);
    expect(propia.status).toBe(200);
    expect(propia.body.mensaje).toBe('Solo usuario uno');

    const aviso = await request(app.getHttpServer()).patch('/notificaciones/6').send({ titulo: 'Aviso actualizado' }).set(lopez);
    expect(aviso.status).toBe(200);
    expect(escenario.escrituras.some((sql) => sql.includes('cli_notificacion'))).toBe(true);

    reset();
    const leida = await request(app.getHttpServer()).post('/notificaciones/7/leer').set(lopez);
    expect(leida.status).toBe(201);
    expect(escenario.escrituras.some((sql) => /leida=1/i.test(sql))).toBe(true);

    reset();
    const alta = await request(app.getHttpServer())
      .post('/notificaciones')
      .send({ tipo: 'GENERAL', titulo: 'Nueva', mensaje: 'Texto', id_sede: 1 })
      .set(lopez);
    expect(alta.status).toBe(201);
    expect(escenario.escrituras.some((sql) => /^\s*insert/i.test(sql))).toBe(true);

    reset();
    const sinSede = await request(app.getHttpServer())
      .post('/notificaciones')
      .send({ tipo: 'GENERAL', titulo: 'Nueva', mensaje: 'Texto' })
      .set(lopez);
    expect(sinSede.status).toBe(400);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const otraSede = await request(app.getHttpServer())
      .post('/notificaciones')
      .send({ tipo: 'GENERAL', titulo: 'Nueva', mensaje: 'Texto', id_sede: 2 })
      .set(lopez);
    expect(otraSede.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);

    reset();
    const mudanza = await request(app.getHttpServer()).patch('/notificaciones/6').send({ id_sede: 2 }).set(lopez);
    expect(mudanza.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('quien no tiene membresía no lista notificaciones', async () => {
    const res = await request(app.getHttpServer()).get('/notificaciones').query({ todas: '1' }).set('x-test-user', '3');
    expect(res.status).toBe(403);
    expect(escenario.escrituras).toEqual([]);
  });

  it('la configuración documental no devuelve rutas de disco y el documento sigue legible', async () => {
    const raiz = await request(app.getHttpServer()).get('/documentos/config/raiz').set(lopez);
    expect(raiz.status).toBe(200);
    expect(raiz.body).toEqual({ disponible: true });
    expect(JSON.stringify(raiz.body)).not.toMatch(/xampp|ClinicaDigital|storage|[A-Za-z]:\\|htdocs/);
    const doc = await request(app.getHttpServer()).get('/documentos/1').set(lopez);
    expect(doc.status).toBe(200);
    const ajeno = await request(app.getHttpServer()).get('/documentos/1/archivo').set(sorela);
    expect(ajeno.status).toBe(403);
    expect(JSON.stringify(ajeno.body)).not.toMatch(/xampp|ClinicaDigital|[A-Za-z]:\\|scan\.pdf/);
  });
});
