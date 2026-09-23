import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';

type RecursoCfg = {
  table: string;
  pk: string;
  required: string[];
  cols: string[];
};

const RECURSOS: Record<string, RecursoCfg> = {
  medidas: {
    table: 'cli_paciente_medida',
    pk: 'id_paciente_medida',
    required: [],
    cols: [
      'fecha_medida',
      'peso_kg',
      'talla_cm',
      'imc',
      'porcentaje_grasa',
      'circunferencia_cintura',
      'observaciones',
    ],
  },
  vitales: {
    table: 'cli_paciente_funcion_vital',
    pk: 'id_paciente_funcion_vital',
    required: [],
    cols: [
      'fecha_registro',
      'presion_sistolica',
      'presion_diastolica',
      'frecuencia_cardiaca',
      'frecuencia_respiratoria',
      'temperatura_c',
      'saturacion_o2',
      'observaciones',
    ],
  },
  vacunas: {
    table: 'cli_paciente_vacuna',
    pk: 'id_paciente_vacuna',
    required: ['nombre_vacuna'],
    cols: [
      'nombre_vacuna',
      'dosis',
      'fecha_aplicacion',
      'proxima_dosis',
      'lote',
      'observaciones',
    ],
  },
  'antecedentes-patologicos': {
    table: 'cli_paciente_antecedente_patologico',
    pk: 'id_paciente_antecedente_patologico',
    required: ['diagnostico'],
    cols: ['diagnostico', 'codigo_cie10', 'fecha_diagnostico', 'activo', 'observaciones'],
  },
  'antecedentes-personales': {
    table: 'cli_paciente_antecedente_personal',
    pk: 'id_paciente_antecedente_personal',
    required: ['tipo', 'descripcion'],
    cols: ['tipo', 'descripcion', 'observaciones'],
  },
  'antecedentes-quirurgicos': {
    table: 'cli_paciente_antecedente_quirurgico',
    pk: 'id_paciente_antecedente_quirurgico',
    required: ['procedimiento'],
    cols: ['procedimiento', 'fecha_cirugia', 'institucion', 'observaciones'],
  },
  'antecedentes-familiares': {
    table: 'cli_paciente_antecedente_familiar',
    pk: 'id_paciente_antecedente_familiar',
    required: ['parentesco', 'diagnostico'],
    cols: ['parentesco', 'diagnostico', 'observaciones'],
  },
  alergias: {
    table: 'cli_paciente_alergia_ram',
    pk: 'id_paciente_alergia_ram',
    required: ['sustancia'],
    cols: ['sustancia', 'tipo', 'reaccion', 'severidad', 'activa', 'observaciones'],
  },
  medicaciones: {
    table: 'cli_paciente_medicacion_habitual',
    pk: 'id_paciente_medicacion_habitual',
    required: ['medicamento'],
    cols: [
      'medicamento',
      'dosis',
      'frecuencia',
      'via',
      'fecha_inicio',
      'fecha_fin',
      'activo',
      'observaciones',
    ],
  },
  'gineco-obstetricos': {
    table: 'cli_paciente_gineco_obstetrico',
    pk: 'id_paciente_gineco_obstetrico',
    required: [],
    cols: [
      'descripcion',
      'menarquia_edad',
      'fur',
      'ciclo_dias',
      'gestaciones',
      'partos',
      'cesareas',
      'abortos',
      'metodo_anticonceptivo',
      'observaciones',
    ],
  },
  embarazos: {
    table: 'cli_paciente_embarazo',
    pk: 'id_paciente_embarazo',
    required: [],
    cols: [
      'fecha_inicio',
      'fum',
      'fpp',
      'semanas_gestacion',
      'estado_embarazo',
      'resultado',
      'observaciones',
    ],
  },
};

@Injectable()
export class HistoriaPacienteService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private cfg(recurso: string) {
    const c = RECURSOS[recurso];
    if (!c) throw new BadRequestException('Recurso de historia inválido');
    return c;
  }

  private async paciente(id: number) {
    const [r] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!r) throw new NotFoundException('Paciente no encontrado');
  }

  private calcImc(peso: any, tallaCm: any): number | null {
    const p = Number(peso);
    const t = Number(tallaCm);
    if (!p || !t) return null;
    const m = t / 100;
    return Math.round((p / (m * m)) * 100) / 100;
  }

  async list(id: number, recurso: string) {
    await this.paciente(id);
    const c = this.cfg(recurso);
    return this.db.query(
      `SELECT * FROM ${c.table} WHERE id_paciente=? AND estado_registro='ACTIVO' ORDER BY ${c.pk} DESC`,
      [id],
    );
  }

  async create(id: number, recurso: string, datos: any, userId: number) {
    await this.paciente(id);
    const c = this.cfg(recurso);
    const d = { ...(datos || {}) };
    for (const k of c.required) {
      if (d[k] === undefined || d[k] === null || d[k] === '') {
        throw new BadRequestException(`${k} requerido`);
      }
    }
    if (recurso === 'medidas') {
      if (!d.fecha_medida) d.fecha_medida = new Date();
      if (d.imc == null || d.imc === '') {
        const imc = this.calcImc(d.peso_kg, d.talla_cm);
        if (imc != null) d.imc = imc;
      }
    }
    if (recurso === 'vitales' && !d.fecha_registro) d.fecha_registro = new Date();

    const cols = c.cols.filter((k) => d[k] !== undefined);
    if (!cols.length) throw new BadRequestException('Sin datos para guardar');
    const r = await this.db.query(
      `INSERT INTO ${c.table} (id_paciente,${cols.join(',')},id_usuario_crea)
       VALUES (?,${cols.map(() => '?').join(',')},?)`,
      [id, ...cols.map((k) => d[k]), userId],
    );
    const itemId = Number(r.insertId);
    await this.auditoria.registrar(c.table, itemId, 'CREAR', userId, null, d);
    return { id: itemId, message: 'Registro agregado' };
  }

  async update(
    idPaciente: number,
    recurso: string,
    id: number,
    datos: any,
    userId: number,
  ) {
    if (['medidas', 'vitales'].includes(recurso)) {
      throw new BadRequestException(
        'Medidas y vitales son registros append; agregue uno nuevo',
      );
    }
    await this.paciente(idPaciente);
    const c = this.cfg(recurso);
    const cols = c.cols.filter((k) => datos[k] !== undefined);
    if (!cols.length) return { message: 'Sin cambios' };
    const [old] = await this.db.query(
      `SELECT * FROM ${c.table} WHERE ${c.pk}=? AND id_paciente=? AND estado_registro='ACTIVO'`,
      [id, idPaciente],
    );
    if (!old) throw new NotFoundException('Registro no encontrado');
    await this.db.query(
      `UPDATE ${c.table} SET ${cols.map((k) => `${k}=?`).join(',')},id_usuario_mod=?
       WHERE ${c.pk}=? AND id_paciente=? AND estado_registro='ACTIVO'`,
      [...cols.map((k) => datos[k]), userId, id, idPaciente],
    );
    await this.auditoria.registrar(c.table, id, 'ACTUALIZAR', userId, old, datos);
    return { message: 'Registro actualizado' };
  }

  async remove(idPaciente: number, recurso: string, id: number, userId: number) {
    const c = this.cfg(recurso);
    const r = await this.db.query(
      `UPDATE ${c.table} SET estado_registro='ELIMINADO',id_usuario_mod=?
       WHERE ${c.pk}=? AND id_paciente=? AND estado_registro='ACTIVO'`,
      [userId, id, idPaciente],
    );
    if (!r.affectedRows) throw new NotFoundException('Registro no encontrado');
    return { message: 'Registro eliminado' };
  }

  /** Compat: último gineco o null */
  async getGineco(id: number) {
    await this.paciente(id);
    const [r] = await this.db.query(
      `SELECT * FROM cli_paciente_gineco_obstetrico
       WHERE id_paciente=? AND estado_registro='ACTIVO'
       ORDER BY id_paciente_gineco_obstetrico DESC LIMIT 1`,
      [id],
    );
    return r || null;
  }

  /** Compat: inserta un nuevo registro gineco (ya no 1:1) */
  async upsertGineco(id: number, datos: any, userId: number) {
    return this.create(id, 'gineco-obstetricos', datos || {}, userId);
  }

  async resumen(id: number) {
    await this.paciente(id);
    const [[medida], [vital], alergias, gineco, counts] = await Promise.all([
      this.db.query(
        `SELECT * FROM cli_paciente_medida
         WHERE id_paciente=? AND estado_registro='ACTIVO'
         ORDER BY fecha_medida DESC LIMIT 1`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM cli_paciente_funcion_vital
         WHERE id_paciente=? AND estado_registro='ACTIVO'
         ORDER BY fecha_registro DESC LIMIT 1`,
        [id],
      ),
      this.db.query(
        `SELECT * FROM cli_paciente_alergia_ram
         WHERE id_paciente=? AND activa=1 AND estado_registro='ACTIVO'`,
        [id],
      ),
      this.getGineco(id),
      Promise.all(
        Object.entries(RECURSOS).map(async ([recurso, c]) => {
          const [r] = await this.db.query(
            `SELECT COUNT(*) total FROM ${c.table}
             WHERE id_paciente=? AND estado_registro='ACTIVO'`,
            [id],
          );
          return [recurso, Number(r.total)];
        }),
      ),
    ]);
    return {
      alergias,
      ultima_medida: medida || null,
      ultimos_vitales: vital || null,
      gineco: gineco || null,
      conteos: Object.fromEntries(counts),
    };
  }
}
