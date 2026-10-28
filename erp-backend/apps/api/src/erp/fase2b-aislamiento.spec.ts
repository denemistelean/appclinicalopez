import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { unidadAls, UnidadScopeService } from '@app/auth';
import { SedesService } from './sedes/sedes.service';
import { InventarioService } from './inventario/inventario.service';
import { PersonalService } from './personal/personal.service';
import { AgendaService } from './agenda/agenda.service';
import { DocumentosService } from './documentos/documentos.service';
import { PacientesService } from './pacientes/pacientes.service';
import { FacturacionService } from './facturacion/facturacion.service';

/**
 * Los escenarios usan mocks. Ninguna prueba abre ni escribe la base de negocio.
 */

const LOPEZ = { idUnidad: 1, roleId: 1, operaFinanzas: 0 };
const SORELA = { idUnidad: 2, roleId: 1, operaFinanzas: 1 };

function enEmpresa<T>(ctx: typeof LOPEZ, run: () => Promise<T>) {
  return unidadAls.run(ctx, run);
}

function sedeDe(id: number) {
  return {
    id_sede: id,
    id_unidad: id === 2 ? 2 : 1,
    opera_finanzas: id === 2 ? 1 : 0,
  };
}

function escrituras(sqls: string[]) {
  return sqls.filter((sql) => /^\s*(insert|update|delete)\b/i.test(sql));
}

function mensaje(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

describe('Fase 2B — aislamiento por empresa', () => {
  const auditoria = { registrar: jest.fn() };

  function unidadSobre(query: (sql: string, params?: any[]) => any) {
    const db = { query: jest.fn(async (sql: string, params?: any[]) => query(sql, params || [])) };
    return { db, unidad: new UnidadScopeService(db as any) };
  }

  it('rechaza salas y equipos de otra empresa y no devuelve su contenido', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql, params) => {
      sqls.push(sql);
      if (sql.includes('FROM cli_sala')) {
        return [{ id_sala: 8, id_sede: 2, nombre: 'BOX SORELA' }];
      }
      if (sql.includes('FROM cli_equipo')) {
        return [{ id_equipo: 4, id_sede: 2, nombre: 'LASER SORELA' }];
      }
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return { affectedRows: 1 };
    });
    const sedes = new SedesService(db as any, auditoria as any, unidad);
    const denegadas = [
      () => sedes.updateSala(8, { nombre: 'X' } as any, 1),
      () => sedes.removeSala(8, 1),
      () => sedes.updateEquipo(4, { nombre: 'X' } as any, 1),
      () => sedes.removeEquipo(4, 1),
      () => sedes.mantenimiento(4, { estado: 'MANTENIMIENTO' } as any, 1),
    ];
    for (const op of denegadas) {
      sqls.length = 0;
      try {
        await enEmpresa(LOPEZ, op);
        throw new Error('debio rechazar');
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as ForbiddenException).getStatus()).toBe(403);
        expect(mensaje(err)).not.toMatch(/BOX SORELA|LASER SORELA/);
        expect(escrituras(sqls)).toEqual([]);
      }
    }
  });

  it('permite actualizar una sala de la empresa activa', async () => {
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_sala')) return [{ id_sala: 3, id_sede: 1, nombre: 'BOX LOPEZ' }];
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return { affectedRows: 1 };
    });
    const sedes = new SedesService(db as any, auditoria as any, unidad);
    await expect(
      enEmpresa(LOPEZ, () => sedes.updateSala(3, { nombre: 'BOX 1' } as any, 1)),
    ).resolves.toEqual({ message: 'Sala actualizada' });
  });

  it('rechaza una transferencia de inventario entre empresas sin mover stock', async () => {
    const creado = jest.fn();
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return [];
    });
    db.createQueryRunner = creado;
    const inventario = new InventarioService(db as any, auditoria as any, unidad);
    try {
      await enEmpresa(LOPEZ, () =>
        inventario.transferir(
          { id_sede_origen: 1, id_sede_destino: 2, id_lote_origen: 9, id_insumo: 1, cantidad: 4 } as any,
          1,
        ),
      );
      throw new Error('debio rechazar');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getStatus()).toBe(403);
      expect(mensaje(err)).not.toMatch(/4|LOTE/);
      expect(creado).not.toHaveBeenCalled();
    }
  });

  it('limita el listado de lotes a las sedes de la empresa activa', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql) => {
      sqls.push(sql);
      if (sql.includes('COUNT')) return [{ total: 0 }];
      return [];
    });
    const inventario = new InventarioService(db as any, auditoria as any, unidad);
    await enEmpresa(LOPEZ, () => inventario.listLotes({}));
    expect(sqls.some((sql) => sql.includes('cli_sede') && sql.includes('id_unidad'))).toBe(true);
  });

  it('no entrega un lote de otra empresa', async () => {
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_lote')) {
        return [{ id_lote: 9, id_sede: 2, codigo_lote: 'LOTE-SORELA', cantidad_actual: 12 }];
      }
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return [];
    });
    const inventario = new InventarioService(db as any, auditoria as any, unidad);
    try {
      await enEmpresa(LOPEZ, () => inventario.getLote(9));
      throw new Error('debio rechazar');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getStatus()).toBe(403);
      expect(mensaje(err)).not.toMatch(/LOTE-SORELA|12/);
    }
  });

  it('permite leer un lote de la propia empresa', async () => {
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_lote')) {
        return [{ id_lote: 3, id_sede: 1, codigo_lote: 'LOTE-LOPEZ', cantidad_actual: 2 }];
      }
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return [];
    });
    const inventario = new InventarioService(db as any, auditoria as any, unidad);
    await expect(enEmpresa(LOPEZ, () => inventario.getLote(3))).resolves.toMatchObject({
      id_lote: 3,
      codigo_lote: 'LOTE-LOPEZ',
    });
  });

  it('rechaza asignar personal u horario a una sede de otra empresa', async () => {
    const sqls: string[] = [];
    const creado = jest.fn();
    const { db, unidad } = unidadSobre((sql, params) => {
      sqls.push(sql);
      if (sql.includes('FROM cli_personal WHERE')) {
        return [{ id_personal: 4, id_sede_principal: 1, nombres: 'ANA', apellidos: 'LOPEZ' }];
      }
      if (sql.includes('SELECT 1 AS ok')) return [{ ok: 1 }];
      if (sql.includes('cli_personal_sede') || sql.includes('cli_personal_especialidad')) return [];
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return [];
    });
    db.createQueryRunner = creado;
    const personal = new PersonalService(db as any, auditoria as any, { get: () => undefined } as any, unidad);
    await expect(
      enEmpresa(LOPEZ, () => personal.syncSedes(4, { sedes: [2], id_sede_principal: 2 } as any, 1)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      enEmpresa(LOPEZ, () =>
        personal.replaceHorario(4, { items: [{ id_sede: 2, dia_semana: 1, hora_inicio: '08:00', hora_fin: '12:00' }] } as any, 1),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      enEmpresa(LOPEZ, () => personal.createExcepcion(4, { id_sede: 2, fecha: '2026-10-21', tipo: 'DIA_LIBRE' } as any, 1)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(creado).not.toHaveBeenCalled();
    expect(escrituras(sqls)).toEqual([]);
    expect(sqls.join('\n')).not.toMatch(/ANA/);
  });

  it('rechaza descargar o eliminar una certificación de otra empresa', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql) => {
      sqls.push(sql);
      if (sql.includes('FROM cli_personal WHERE')) {
        return [{ id_personal: 9, id_sede_principal: 2 }];
      }
      if (sql.includes('SELECT 1 AS ok')) return [];
      if (sql.includes('cli_personal_certificacion')) {
        return [{ archivo_ruta: 'PERSONAL/cert.pdf', archivo_nombre: 'cert.pdf' }];
      }
      return [];
    });
    const personal = new PersonalService(db as any, auditoria as any, { get: () => undefined } as any, unidad);
    await expect(enEmpresa(LOPEZ, () => personal.streamCertificacion(9, 3))).rejects.toMatchObject({
      status: 403,
    });
    await expect(enEmpresa(LOPEZ, () => personal.removeCertificacion(9, 3, 1))).rejects.toMatchObject({
      status: 403,
    });
    expect(sqls.some((sql) => sql.includes('cli_personal_certificacion'))).toBe(false);
    expect(escrituras(sqls)).toEqual([]);
    expect(sqls.join('\n')).not.toMatch(/cert\.pdf/);
  });

  it('rechaza roles de agenda de un profesional de otra empresa', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql) => {
      sqls.push(sql);
      if (sql.includes('SELECT 1 AS ok')) return [];
      if (sql.includes('id_sede_principal FROM cli_personal')) {
        return [{ id_personal: 9, id_sede_principal: 2 }];
      }
      if (sql.includes('id_personal_rol=?')) return [{ id_personal: 9 }];
      if (sql.includes('cli_rol_recurso')) return [{ nombre: 'CIRUJANO' }];
      return { insertId: 1 };
    });
    const agenda = new AgendaService(db as any, auditoria as any, { emit: jest.fn() } as any, unidad);
    await expect(enEmpresa(LOPEZ, () => agenda.rolesDePersonal(9))).rejects.toMatchObject({ status: 403 });
    await expect(enEmpresa(LOPEZ, () => agenda.asignarRol(9, 1, 1))).rejects.toMatchObject({ status: 403 });
    await expect(enEmpresa(LOPEZ, () => agenda.quitarRol(15, 1))).rejects.toMatchObject({ status: 403 });
    expect(sqls.some((sql) => sql.includes('cli_rol_recurso'))).toBe(false);
    expect(escrituras(sqls)).toEqual([]);
    expect(sqls.join('\n')).not.toMatch(/CIRUJANO/);
  });

  it('no descarga ni elimina un documento sin padre clínico de otra empresa', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql) => {
      sqls.push(sql);
      if (sql.includes('FROM cli_documento d') || sql.includes('FROM cli_documento ')) {
        return [
          {
            id_documento: 1,
            titulo: 'Prueba escaneo',
            id_consulta: null,
            id_cita: null,
            id_paciente: 2,
            ruta_relativa: 'secret/scan.pdf',
            nombre_archivo: 'scan.pdf',
          },
        ];
      }
      if (sql.includes('id_unidad_registro')) return [{ id_unidad_registro: 1 }];
      return [];
    });
    const docs = new DocumentosService(db as any, auditoria as any, { get: () => undefined } as any, unidad);
    await expect(enEmpresa(SORELA, () => docs.findOne(1))).rejects.toMatchObject({ status: 403 });
    await expect(enEmpresa(SORELA, () => docs.streamFile(1))).rejects.toMatchObject({ status: 403 });
    await expect(enEmpresa(SORELA, () => docs.remove(1, 1))).rejects.toMatchObject({ status: 403 });
    expect(escrituras(sqls)).toEqual([]);
    expect(sqls.join('\n')).not.toMatch(/Prueba escaneo|scan\.pdf/);
  });

  it('conserva el documento sin padre para la empresa de registro del paciente', async () => {
    const { db, unidad } = unidadSobre((sql) => {
      if (sql.includes('FROM cli_documento')) {
        return [
          {
            id_documento: 1,
            titulo: 'Prueba escaneo',
            id_consulta: null,
            id_cita: null,
            id_paciente: 2,
          },
        ];
      }
      if (sql.includes('id_unidad_registro')) return [{ id_unidad_registro: 1 }];
      return [];
    });
    const docs = new DocumentosService(db as any, auditoria as any, { get: () => undefined } as any, unidad);
    await expect(enEmpresa(LOPEZ, () => docs.findOne(1))).resolves.toMatchObject({
      id_documento: 1,
      titulo: 'Prueba escaneo',
    });
    const filtro = unidadAls.run(LOPEZ, () => unidad.sqlOrigen('d', { suelto: 'registro' }));
    expect(filtro.sql).toContain('id_unidad_registro');
    expect(filtro.sql).not.toMatch(/id_cita IS NULL\)/);
  });

  it('no lista ni elimina el documento demográfico legado de otra empresa', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql) => {
      sqls.push(sql);
      if (sql.includes('id_unidad_registro')) return [{ id_unidad_registro: 1 }];
      if (sql.includes('FROM cli_documento_paciente') && sql.includes('SELECT id_paciente')) {
        return [{ id_paciente: 2 }];
      }
      if (sql.includes('FROM cli_paciente')) return [{ id_paciente: 2, id_unidad_registro: 1 }];
      if (sql.includes('cli_documento_paciente')) {
        return [{ ruta_archivo: 'privado/dni.pdf', tipo_documento: 'DNI' }];
      }
      return { affectedRows: 1 };
    });
    const pacientes = new PacientesService(db as any, auditoria as any, unidad);
    await expect(enEmpresa(SORELA, () => pacientes.documentos(2))).rejects.toMatchObject({ status: 403 });
    await expect(enEmpresa(SORELA, () => pacientes.removeDocumento(7, 1))).rejects.toMatchObject({ status: 403 });
    expect(sqls.some((sql) => sql.includes('ruta_archivo') || sql.includes('privado/dni.pdf'))).toBe(false);
    expect(escrituras(sqls)).toEqual([]);
  });

  it('rechaza la fusión si hay registros de otra empresa y no los modifica', async () => {
    const qr = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT') && sql.includes('cli_cita')) return [{ total: 1 }];
        if (sql.includes('COUNT')) return [{ total: 0 }];
        return { affectedRows: 1 };
      }),
    };
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_paciente')) {
        return [{ id_paciente: Number(params?.[0]), id_unidad_registro: 1, nombres: 'A', apellidos: 'B' }];
      }
      return [];
    });
    db.createQueryRunner = jest.fn(() => qr);
    const pacientes = new PacientesService(db as any, auditoria as any, unidad);
    await expect(
      enEmpresa(LOPEZ, () => pacientes.fusionar({ id_sobreviviente: 10, id_duplicado: 11 } as any, 1)),
    ).rejects.toMatchObject({ status: 403 });
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(qr.query.mock.calls.some((call) => String(call[0]).includes('UPDATE'))).toBe(false);
    expect(mensaje(qr.query.mock.calls)).not.toMatch(/A |B/);
  });

  it('rechaza la fusión cuando el paciente está registrado en otra empresa', async () => {
    const creado = jest.fn();
    const { db, unidad } = unidadSobre((sql, params) => {
      const id = Number(params?.[0]);
      if (sql.includes('FROM cli_paciente')) {
        return [{ id_paciente: id, id_unidad_registro: id === 11 ? 2 : 1 }];
      }
      return [];
    });
    db.createQueryRunner = creado;
    const pacientes = new PacientesService(db as any, auditoria as any, unidad);
    await expect(
      enEmpresa(LOPEZ, () => pacientes.fusionar({ id_sobreviviente: 10, id_duplicado: 11 } as any, 1)),
    ).rejects.toMatchObject({ status: 403 });
    expect(creado).not.toHaveBeenCalled();
  });

  it('fusiona solo registros de la empresa activa cuando todos le pertenecen', async () => {
    const qr = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT')) return [{ total: 0 }];
        return { affectedRows: 0 };
      }),
    };
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_paciente')) {
        return [{ id_paciente: Number(params?.[0]), id_unidad_registro: 1 }];
      }
      return [];
    });
    db.createQueryRunner = jest.fn(() => qr);
    const pacientes = new PacientesService(db as any, auditoria as any, unidad);
    await expect(
      enEmpresa(LOPEZ, () => pacientes.fusionar({ id_sobreviviente: 10, id_duplicado: 11 } as any, 1)),
    ).resolves.toMatchObject({ id_paciente: 10 });
    const cita = qr.query.mock.calls.find((call) => String(call[0]).includes('UPDATE cli_cita'));
    expect(String(cita?.[0])).toContain('id_unidad=?');
    expect(cita?.[1]).toEqual([10, 1, 11, 1]);
    expect(qr.commitTransaction).toHaveBeenCalled();
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('mantiene bloqueado un pago nuevo en López', async () => {
    const sqls: string[] = [];
    const { db, unidad } = unidadSobre((sql, params) => {
      sqls.push(sql);
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return { insertId: 99 };
    });
    const facturacion = new FacturacionService(db as any, auditoria as any, unidad);
    try {
      await enEmpresa(LOPEZ, () =>
        facturacion.createPago({ id_sede: 1, id_paciente: 2, monto: 150, concepto: 'SECRETO' } as any, 1),
      );
      throw new Error('debio rechazar');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getStatus()).toBe(403);
      expect(mensaje(err)).not.toMatch(/150|SECRETO/);
      expect(escrituras(sqls)).toEqual([]);
    }
  });

  it('responde 400 si un documento sin padre no tiene empresa de registro', async () => {
    const { db, unidad } = unidadSobre((sql) => {
      if (sql.includes('FROM cli_documento')) {
        return [{ id_documento: 1, id_consulta: null, id_cita: null, id_paciente: 2, titulo: 'Prueba escaneo' }];
      }
      if (sql.includes('id_unidad_registro')) return [{ id_unidad_registro: null }];
      return [];
    });
    const docs = new DocumentosService(db as any, auditoria as any, { get: () => undefined } as any, unidad);
    await expect(enEmpresa(LOPEZ, () => docs.findOne(1))).rejects.toBeInstanceOf(BadRequestException);
    await expect(enEmpresa(SORELA, () => docs.findOne(1))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no usa NotFound para ocultar un recurso de otra empresa', async () => {
    const { db, unidad } = unidadSobre((sql, params) => {
      if (sql.includes('FROM cli_sala')) return [{ id_sala: 8, id_sede: 2, nombre: 'BOX SORELA' }];
      if (sql.includes('FROM cli_sede')) return [sedeDe(Number(params?.[0]))];
      return [];
    });
    const sedes = new SedesService(db as any, auditoria as any, unidad);
    await expect(enEmpresa(LOPEZ, () => sedes.removeSala(8, 1))).rejects.not.toBeInstanceOf(NotFoundException);
  });
});
