import { ForbiddenException } from '@nestjs/common';
import { unidadAls, UnidadScopeService } from '@app/auth';
import { DocumentosService } from './documentos/documentos.service';
import { InventarioService } from './inventario/inventario.service';
import { PacientesService } from './pacientes/pacientes.service';
import { ReportesService } from './reportes/reportes.service';

const LOPEZ = { idUnidad: 1, roleId: 1, operaFinanzas: 0 };
const SORELA = { idUnidad: 2, roleId: 4, operaFinanzas: 1 };

function en<T>(ctx: typeof LOPEZ, run: () => Promise<T> | T) {
  return unidadAls.run(ctx, run);
}

describe('Fase 2E-13 — contexto empresarial obligatorio', () => {
  function alcance() {
    const consultas: { sql: string; params: any[] }[] = [];
    const db = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        consultas.push({ sql, params: params || [] });
        if (sql.includes('FROM cli_sede')) {
          const id = Number(params?.[0]);
          return [{ id_sede: id, id_unidad: id === 2 ? 2 : 1, opera_finanzas: id === 2 ? 1 : 0 }];
        }
        if (sql.includes('id_unidad_registro')) return [{ id_unidad_registro: 2 }];
        if (sql.includes('FROM cli_paciente p')) return [{ id_paciente: 2, id_unidad_registro: 1, estado_registro: 'ACTIVO' }];
        if (sql.includes('FROM cli_documento')) {
          return [{ id_documento: 9, id_consulta: null, id_cita: null, id_paciente: 2, estado_registro: 'ACTIVO' }];
        }
        if (sql.includes('numero_documento=?') && !sql.includes('INSERT')) return [];
        return [];
      }),
    };
    const unidad = new UnidadScopeService(db as any);
    return { consultas, db, unidad };
  }

  it('no arma un filtro global cuando no hay empresa activa', () => {
    const { consultas, unidad } = alcance();
    expect(() => unidad.sqlEmpresa('id_unidad', 'id_sede')).toThrow(ForbiddenException);
    expect(() => unidad.sqlPorSede('id_sede')).toThrow(ForbiddenException);
    expect(() => unidad.sqlOrigen('d', { suelto: 'registro' })).toThrow(ForbiddenException);
    expect(() => unidad.sqlPersonal()).toThrow(ForbiddenException);
    expect(consultas).toEqual([]);
  });

  it('filtra por la empresa del contexto y no por un id enviado aparte', () => {
    const { unidad } = alcance();
    const filtro = en(LOPEZ, () => unidad.sqlEmpresa('c.id_unidad', 'c.id_sede'));
    expect(filtro.sql).toContain('c.id_unidad = ?');
    expect(filtro.params).toEqual([1, 1]);
    expect(filtro.sql).not.toContain('undefined');
  });

  it('niega una sede o un registro de la otra empresa', async () => {
    const { unidad } = alcance();
    await expect(unidad.exigirSede(2)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(en(LOPEZ, () => unidad.exigirSede(2, 1))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(en(SORELA, () => unidad.exigirSede(2, 1))).resolves.toMatchObject({ id_unidad: 2 });
    await expect(unidad.exigirRegistro(2)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(en(LOPEZ, () => unidad.exigirRegistro(2))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(en(SORELA, () => unidad.exigirRegistro(2))).resolves.toBeUndefined();
  });

  it('niega el documento de la otra empresa antes de leer el archivo', async () => {
    const { db, unidad } = alcance();
    const documentos = new DocumentosService(db as any, { registrar: jest.fn() } as any, { get: () => undefined } as any, unidad);
    await expect(documentos.findOne(9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(en(LOPEZ, () => documentos.findOne(9))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(en(SORELA, () => documentos.findOne(9))).resolves.toMatchObject({ id_documento: 9 });
  });

  it('no lista consultas clínicas sin empresa y limita las de la empresa activa', async () => {
    const { consultas, db, unidad } = alcance();
    const documentos = new DocumentosService(db as any, { registrar: jest.fn() } as any, { get: () => undefined } as any, unidad);
    consultas.length = 0;
    await expect(documentos.consultasPaciente(2, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(consultas).toEqual([]);
    consultas.length = 0;
    await en(LOPEZ, () => documentos.consultasPaciente(2, {}));
    expect(consultas[0].sql).toContain('id_unidad = ?');
    expect(consultas[0].params).toContain(1);
  });

  it('no entrega la historia de otra empresa ni la consulta sin contexto', async () => {
    const { consultas, db, unidad } = alcance();
    const reportes = new ReportesService(db as any, { registrar: jest.fn() } as any, unidad);
    consultas.length = 0;
    await expect(reportes.informePaciente(2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(consultas.map((item) => item.sql).join('\n')).not.toMatch(/cli_paciente_medida|cli_cita/);
    consultas.length = 0;
    await en(SORELA, () => reportes.informePaciente(2));
    const texto = consultas.map((item) => item.sql).join('\n');
    expect(texto).not.toMatch(/cli_paciente_medida/);
    expect(texto).toContain('cli_cita');
    expect(consultas.some((item) => item.params.includes(2))).toBe(true);
  });

  it('no transfiere ni crea un paciente sin empresa activa', async () => {
    const { db, unidad } = alcance();
    const inventario = new InventarioService(db as any, { registrar: jest.fn() } as any, unidad);
    const runner = jest.fn();
    (db as any).createQueryRunner = runner;
    await expect(inventario.transferir({ id_sede_origen: 1, id_sede_destino: 3, id_lote_origen: 1, id_insumo: 1, cantidad: 1 } as any, 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(runner).not.toHaveBeenCalled();

    const pacientes = new PacientesService(db as any, { registrar: jest.fn() } as any, unidad);
    const antes = db.query.mock.calls.length;
    await expect(pacientes.create({ numero_documento: '999', nombres: 'Ana', apellidos: 'Paz' } as any, 1)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query.mock.calls.length).toBe(antes);

    db.query.mockImplementation(async (sql: string) => {
      if (String(sql).includes('INSERT')) return { insertId: 15 };
      return [];
    });
    const creado = await en(LOPEZ, () => pacientes.create({ numero_documento: '999', nombres: 'Ana', apellidos: 'Paz' } as any, 1));
    expect(creado).toMatchObject({ id: 15 });
    const insert = db.query.mock.calls.find((call) => String(call[0]).includes('INSERT INTO cli_paciente'));
    expect(insert?.[1]).toContain(1);
    expect(insert?.[1]).not.toContain(2);
  });

  it('conserva la ficha demográfica compartida y el catálogo global de insumos', async () => {
    const { consultas, db, unidad } = alcance();
    const pacientes = new PacientesService(db as any, { registrar: jest.fn() } as any, unidad);
    consultas.length = 0;
    await pacientes.findAll({});
    expect(consultas.length).toBeGreaterThan(0);
    expect(consultas.every((item) => item.sql.includes('cli_paciente'))).toBe(true);
    expect(consultas.some((item) => item.sql.includes('id_unidad'))).toBe(false);

    consultas.length = 0;
    const inventario = new InventarioService(db as any, { registrar: jest.fn() } as any, unidad);
    await inventario.listInsumos({});
    expect(consultas.length).toBeGreaterThan(0);
    expect(consultas.every((item) => item.sql.includes('cli_insumo'))).toBe(true);
    expect(consultas.some((item) => item.sql.includes('cli_sede'))).toBe(false);
  });
});
