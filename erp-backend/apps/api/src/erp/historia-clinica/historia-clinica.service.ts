import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  ConsultaDto,
  PlantillaDto,
  UpdateConsultaDto,
  UpdatePlantillaDto,
} from './historia-clinica.dto';

@Injectable()
export class HistoriaClinicaService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }

  async plantillas(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 100));
    const s = String(q.search || '');
    const p: any[] = [];
    let w = `estado_registro='ACTIVO' AND activa=1`;
    if (s) {
      w += ` AND nombre LIKE ?`;
      p.push(`%${s}%`);
    }
    const [c] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_plantilla_clinica WHERE ${w}`,
      p,
    );
    const data = await this.db.query(
      `SELECT * FROM cli_plantilla_clinica WHERE ${w} ORDER BY nombre LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return {
      data: data.map((row: any) => ({
        ...row,
        estructura_json:
          typeof row.estructura_json === 'string'
            ? JSON.parse(row.estructura_json)
            : row.estructura_json,
      })),
      meta: this.meta(page, limit, Number(c.total || 0)),
    };
  }

  async createPlantilla(d: PlantillaDto, userId: number) {
    const r = await this.db.query(
      `INSERT INTO cli_plantilla_clinica (nombre,especialidad,id_tratamiento,estructura_json,activa,id_usuario_crea)
       VALUES (?,?,?,?,?,?)`,
      [
        d.nombre,
        d.especialidad || null,
        d.id_tratamiento || null,
        d.estructura_json ? JSON.stringify(d.estructura_json) : null,
        d.activa === false ? 0 : 1,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Plantilla creada' };
  }

  async updatePlantilla(id: number, d: UpdatePlantillaDto, userId: number) {
    const fields = ['nombre', 'especialidad', 'id_tratamiento', 'activa'].filter(
      (k) => (d as any)[k] !== undefined,
    );
    if (d.estructura_json !== undefined) fields.push('estructura_json');
    const vals = fields.map((k) =>
      k === 'estructura_json' ? JSON.stringify(d.estructura_json) : (d as any)[k],
    );
    const r = await this.db.query(
      `UPDATE cli_plantilla_clinica SET ${fields.map((k) => `${k}=?`).join(',')},id_usuario_mod=?
       WHERE id_plantilla_clinica=? AND estado_registro='ACTIVO'`,
      [...vals, userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Plantilla no encontrada');
    return { message: 'Plantilla actualizada' };
  }

  async removePlantilla(id: number, userId: number) {
    const r = await this.db.query(
      `UPDATE cli_plantilla_clinica SET estado_registro='ELIMINADO',id_usuario_mod=?
       WHERE id_plantilla_clinica=? AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Plantilla no encontrada');
    return { message: 'Plantilla eliminada' };
  }

  cie10(q: any) {
    const term = String(q.search || '').trim();
    if (term.length < 1) return [];
    const s = `%${term}%`;
    const limit = Math.min(80, Math.max(1, Number(q.limit) || 40));
    return this.db.query(
      `SELECT
          s.id_cie10_subcategoria,
          s.id_cie10_subcategoria AS id_cie10,
          s.codigo,
          s.nombre AS descripcion,
          s.codigo_categoria AS categoria,
          c.nombre AS categoria_nombre
       FROM cli_cie10_subcategoria s
       JOIN cli_cie10_categoria c
         ON c.codigo = s.codigo_categoria AND c.estado_registro = 'ACTIVO'
       WHERE s.estado_registro = 'ACTIVO'
         AND (s.codigo LIKE ? OR s.nombre LIKE ? OR s.codigo_categoria LIKE ? OR c.nombre LIKE ?)
       ORDER BY
         CASE WHEN s.codigo LIKE ? THEN 0 WHEN s.codigo LIKE ? THEN 1 ELSE 2 END,
         s.codigo
       LIMIT ?`,
      [s, s, s, s, `${term}%`, `${term}%`, limit],
    );
  }

  medicamentos(q: any) {
    const s = `%${String(q.search || '').trim()}%`;
    return this.db.query(
      `SELECT id_medicamento, nombre, concentracion, forma
       FROM cli_medicamento
       WHERE estado_registro='ACTIVO' AND nombre LIKE ?
       ORDER BY nombre LIMIT 40`,
      [s],
    );
  }

  async consultas(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const w = [`c.estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (q.id_paciente) {
      w.push('c.id_paciente=?');
      p.push(Number(q.id_paciente));
    }
    if (q.estado) {
      w.push('c.estado=?');
      p.push(q.estado);
    }
    if (q.search) {
      w.push(`(c.motivo_consulta LIKE ? OR pa.nombres LIKE ? OR pa.apellidos LIKE ?)`);
      const s = `%${q.search}%`;
      p.push(s, s, s);
    }
    const [c] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_consulta c
       JOIN cli_paciente pa ON pa.id_paciente=c.id_paciente
       WHERE ${w.join(' AND ')}`,
      p,
    );
    const data = await this.db.query(
      `SELECT c.*, CONCAT(pa.nombres,' ',pa.apellidos) paciente,
              CONCAT(pe.nombres,' ',pe.apellidos) personal,
              pl.nombre plantilla
       FROM cli_consulta c
       JOIN cli_paciente pa ON pa.id_paciente=c.id_paciente
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       LEFT JOIN cli_plantilla_clinica pl ON pl.id_plantilla_clinica=c.id_plantilla_clinica
       WHERE ${w.join(' AND ')}
       ORDER BY c.fecha_consulta DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c.total || 0)) };
  }

  private parseJson(v: any) {
    if (v == null) return null;
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }
    return v;
  }

  async getConsulta(id: number) {
    const [c] = await this.db.query(
      `SELECT c.*, CONCAT(pa.nombres,' ',pa.apellidos) paciente,
              CONCAT(pe.nombres,' ',pe.apellidos) personal
       FROM cli_consulta c
       JOIN cli_paciente pa ON pa.id_paciente=c.id_paciente
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       WHERE c.id_consulta=? AND c.estado_registro='ACTIVO'`,
      [id],
    );
    if (!c) throw new NotFoundException('Consulta no encontrada');
    const diagnosticos = await this.db.query(
      `SELECT * FROM cli_consulta_diagnostico WHERE id_consulta=? AND estado_registro='ACTIVO'`,
      [id],
    );
    const [plan] = await this.db.query(
      `SELECT * FROM cli_consulta_plan WHERE id_consulta=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (plan) {
      plan.tratamientos = await this.db.query(
        `SELECT * FROM cli_consulta_plan_tratamiento WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
        [plan.id_consulta_plan],
      );
      plan.examenes = await this.db.query(
        `SELECT * FROM cli_consulta_plan_examen WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
        [plan.id_consulta_plan],
      );
      plan.imagenes = await this.db.query(
        `SELECT * FROM cli_consulta_plan_imagen WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
        [plan.id_consulta_plan],
      );
      plan.medicamentos = await this.db.query(
        `SELECT * FROM cli_consulta_plan_medicamento WHERE id_consulta_plan=? AND estado_registro='ACTIVO' ORDER BY orden`,
        [plan.id_consulta_plan],
      );
    }
    return {
      ...c,
      examen_json: this.parseJson(c.examen_json),
      datos_plantilla_json: this.parseJson(c.datos_plantilla_json),
      adjuntos_json: this.parseJson(c.adjuntos_json),
      diagnosticos,
      plan: plan || null,
    };
  }

  private async guardarDetalles(qr: QueryRunner, id: number, d: any, userId: number) {
    if (d.diagnosticos) {
      await qr.query(
        `UPDATE cli_consulta_diagnostico SET estado_registro='ELIMINADO',id_usuario_mod=?
         WHERE id_consulta=? AND estado_registro='ACTIVO'`,
        [userId, id],
      );
      for (const x of d.diagnosticos) {
        await qr.query(
          `INSERT INTO cli_consulta_diagnostico
            (id_consulta,id_cie10,id_cie10_subcategoria,codigo_cie10,descripcion,tipo,id_usuario_crea)
           VALUES (?,?,?,?,?,?,?)`,
          [
            id,
            null,
            x.id_cie10_subcategoria || x.id_cie10 || null,
            x.codigo_cie10 || null,
            String(x.descripcion || '').slice(0, 500),
            x.tipo || 'PRESUNTIVO',
            userId,
          ],
        );
      }
    }

    if (d.plan) {
      await qr.query(
        `INSERT INTO cli_consulta_plan (id_consulta,indicaciones_generales,observaciones,id_usuario_crea)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE
           indicaciones_generales=VALUES(indicaciones_generales),
           observaciones=VALUES(observaciones),
           estado_registro='ACTIVO', id_usuario_mod=?`,
        [
          id,
          d.plan.indicaciones_generales || null,
          d.plan.observaciones || null,
          userId,
          userId,
        ],
      );
      const [p] = await qr.query(
        `SELECT id_consulta_plan FROM cli_consulta_plan WHERE id_consulta=?`,
        [id],
      );

      if (d.plan.medicamentos) {
        await qr.query(
          `UPDATE cli_consulta_plan_medicamento SET estado_registro='ELIMINADO',id_usuario_mod=?
           WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
          [userId, p.id_consulta_plan],
        );
        let orden = 1;
        for (const m of d.plan.medicamentos) {
          await qr.query(
            `INSERT INTO cli_consulta_plan_medicamento
              (id_consulta_plan,id_medicamento,medicamento,dosis,via,frecuencia,duracion,indicaciones,orden,id_usuario_crea)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [
              p.id_consulta_plan,
              m.id_medicamento || null,
              m.medicamento,
              m.dosis || null,
              m.via || null,
              m.frecuencia || null,
              m.duracion || null,
              m.indicaciones || null,
              m.orden || orden++,
              userId,
            ],
          );
        }
      }

      for (const [tipo, table, cols] of [
        ['tratamientos', 'cli_consulta_plan_tratamiento', ['id_tratamiento', 'descripcion', 'cantidad_sesiones', 'orden']],
        ['examenes', 'cli_consulta_plan_examen', ['nombre_examen', 'indicaciones', 'orden']],
        ['imagenes', 'cli_consulta_plan_imagen', ['nombre_estudio', 'indicaciones', 'orden']],
      ] as any[]) {
        if (!d.plan[tipo]) continue;
        await qr.query(
          `UPDATE ${table} SET estado_registro='ELIMINADO',id_usuario_mod=?
           WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
          [userId, p.id_consulta_plan],
        );
        for (const x of d.plan[tipo]) {
          await qr.query(
            `INSERT INTO ${table} (id_consulta_plan,${cols.join(',')},id_usuario_crea)
             VALUES (?,${cols.map(() => '?').join(',')},?)`,
            [p.id_consulta_plan, ...cols.map((k: string) => x[k] ?? null), userId],
          );
        }
      }
    }
  }

  async createConsulta(d: ConsultaDto, userId: number) {
    if (!d.motivo_consulta?.trim()) {
      throw new BadRequestException('motivo_consulta requerido');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const r = await qr.query(
        `INSERT INTO cli_consulta
          (id_paciente,id_sede,id_personal,id_cita,id_plantilla_clinica,fecha_consulta,
           motivo_consulta,tiempo_enfermedad,tipo_enfermedad,relato,anamnesis,examen_fisico,
           apreciacion,examen_json,datos_plantilla_json,adjuntos_json,id_usuario_crea)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d.id_paciente,
          d.id_sede,
          d.id_personal,
          d.id_cita || null,
          d.id_plantilla_clinica || null,
          d.fecha_consulta,
          d.motivo_consulta,
          d.tiempo_enfermedad || null,
          d.tipo_enfermedad || null,
          d.relato || null,
          d.anamnesis || d.relato || null,
          d.examen_fisico || null,
          d.apreciacion || null,
          d.examen_json ? JSON.stringify(d.examen_json) : null,
          d.datos_plantilla_json ? JSON.stringify(d.datos_plantilla_json) : null,
          d.adjuntos_json ? JSON.stringify(d.adjuntos_json) : null,
          userId,
        ],
      );
      const id = Number(r.insertId);
      await this.guardarDetalles(qr, id, d, userId);
      await qr.commitTransaction();
      await this.auditoria.registrar('cli_consulta', id, 'CREAR', userId, null, {
        id_paciente: d.id_paciente,
      });
      return { id, message: 'Consulta guardada' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async updateConsulta(id: number, d: UpdateConsultaDto, userId: number) {
    const old = await this.getConsulta(id);
    if (old.estado !== 'BORRADOR') {
      throw new BadRequestException('La consulta finalizada es inmutable');
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE cli_consulta SET
          id_paciente=COALESCE(?,id_paciente),
          id_sede=COALESCE(?,id_sede),
          id_personal=COALESCE(?,id_personal),
          id_cita=COALESCE(?,id_cita),
          id_plantilla_clinica=COALESCE(?,id_plantilla_clinica),
          fecha_consulta=COALESCE(?,fecha_consulta),
          motivo_consulta=COALESCE(?,motivo_consulta),
          tiempo_enfermedad=COALESCE(?,tiempo_enfermedad),
          tipo_enfermedad=COALESCE(?,tipo_enfermedad),
          relato=COALESCE(?,relato),
          anamnesis=COALESCE(?,anamnesis),
          examen_fisico=COALESCE(?,examen_fisico),
          apreciacion=COALESCE(?,apreciacion),
          examen_json=COALESCE(?,examen_json),
          datos_plantilla_json=COALESCE(?,datos_plantilla_json),
          adjuntos_json=COALESCE(?,adjuntos_json),
          id_usuario_mod=?
         WHERE id_consulta=? AND estado_registro='ACTIVO'`,
        [
          d.id_paciente ?? null,
          d.id_sede ?? null,
          d.id_personal ?? null,
          d.id_cita ?? null,
          d.id_plantilla_clinica ?? null,
          d.fecha_consulta ?? null,
          d.motivo_consulta ?? null,
          d.tiempo_enfermedad ?? null,
          d.tipo_enfermedad ?? null,
          d.relato ?? null,
          d.anamnesis ?? null,
          d.examen_fisico ?? null,
          d.apreciacion ?? null,
          d.examen_json != null ? JSON.stringify(d.examen_json) : null,
          d.datos_plantilla_json != null ? JSON.stringify(d.datos_plantilla_json) : null,
          d.adjuntos_json != null ? JSON.stringify(d.adjuntos_json) : null,
          userId,
          id,
        ],
      );
      await this.guardarDetalles(qr, id, d, userId);
      await qr.commitTransaction();
      return { message: 'Consulta actualizada' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async finalizar(id: number, userId: number) {
    const c = await this.getConsulta(id);
    if (c.estado !== 'BORRADOR') throw new BadRequestException('Solo se finalizan borradores');
    if (!String(c.motivo_consulta || '').trim()) {
      throw new BadRequestException('La consulta requiere motivo');
    }
    if (!c.diagnosticos.length) {
      throw new BadRequestException('La consulta requiere al menos un diagnóstico');
    }
    await this.db.query(
      `UPDATE cli_consulta SET estado='FINALIZADA',fecha_finalizacion=NOW(),id_usuario_mod=? WHERE id_consulta=?`,
      [userId, id],
    );
    await this.auditoria.registrar('cli_consulta', id, 'ACTUALIZAR', userId, c, {
      estado: 'FINALIZADA',
    });
    return { message: 'Consulta finalizada' };
  }

  async removeConsulta(id: number, userId: number) {
    const c = await this.getConsulta(id);
    if (c.estado === 'FINALIZADA') {
      throw new BadRequestException(
        'Una consulta finalizada no se elimina; debe anularse mediante proceso clínico',
      );
    }
    await this.db.query(
      `UPDATE cli_consulta SET estado_registro='ELIMINADO',estado='ANULADA',id_usuario_mod=? WHERE id_consulta=?`,
      [userId, id],
    );
    return { message: 'Consulta eliminada' };
  }
}
