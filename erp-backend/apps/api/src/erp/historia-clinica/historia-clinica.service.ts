import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgendaService } from '../agenda/agenda.service';
import { DocumentosService } from '../documentos/documentos.service';
import { MapaCorporalService } from '../mapa-corporal/mapa-corporal.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService, PdfService, htmlFirmaPie, htmlLogoHeader } from '@app/common';
import { UnidadScopeService } from '@app/auth';
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
    private readonly agenda: AgendaService,
    private readonly pdf: PdfService,
    private readonly documentos: DocumentosService,
    private readonly mapa: MapaCorporalService,
    private readonly unidad: UnidadScopeService,
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

  async crearMedicamento(dto: { nombre?: string }, userId: number) {
    const nombre = String(dto?.nombre || '').trim().toUpperCase().slice(0, 150);
    if (nombre.length < 2) throw new BadRequestException('Indique el nombre del medicamento.');
    const [existe] = await this.db.query(
      `SELECT id_medicamento, nombre, concentracion, forma
       FROM cli_medicamento
       WHERE estado_registro = 'ACTIVO' AND UPPER(nombre) = ?
       LIMIT 1`,
      [nombre],
    );
    if (existe) return existe;
    const r = await this.db.query(
      `INSERT INTO cli_medicamento (nombre, id_usuario_crea) VALUES (?, ?)`,
      [nombre, userId],
    );
    return { id_medicamento: Number(r.insertId), nombre, concentracion: null, forma: null };
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
    if (q.id_cita) {
      w.push('c.id_cita=?');
      p.push(Number(q.id_cita));
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
    if (q.id_sede) await this.unidad.exigirSede(Number(q.id_sede));
    const filtro = this.unidad.sqlEmpresa('c.id_unidad', 'c.id_sede');
    if (filtro.sql) {
      w.push(filtro.sql);
      p.push(...filtro.params);
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
    await this.unidad.exigirRegistro(c.id_unidad, c.id_sede);
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
    if (d.id_cita) {
      const [ya] = await this.db.query(
        `SELECT id_consulta FROM cli_consulta
         WHERE id_cita=? AND estado_registro='ACTIVO' LIMIT 1`,
        [d.id_cita],
      );
      if (ya) {
        throw new BadRequestException('Esta cita de agenda ya tiene una cita clínica');
      }
    }
    const sede = await this.unidad.exigirSede(Number(d.id_sede), (d as any).id_unidad);
    if (d.id_cita) {
      const [cita] = await this.db.query(
        `SELECT id_unidad, estado FROM cli_cita WHERE id_cita=? AND estado_registro='ACTIVO'`,
        [d.id_cita],
      );
      if (!cita) throw new BadRequestException('La cita no existe');
      if (String(cita.estado) === 'FINALIZADA') {
        throw new BadRequestException('La cita ya está finalizada.');
      }
      this.unidad.exigirCambio(cita.id_unidad, sede.id_unidad);
      if (cita.id_unidad == null) {
        throw new BadRequestException('La cita no tiene empresa asignada');
      }
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const r = await qr.query(
        `INSERT INTO cli_consulta
          (id_paciente,id_sede,id_unidad,id_personal,id_cita,id_plantilla_clinica,fecha_consulta,
           motivo_consulta,tiempo_enfermedad,tipo_enfermedad,relato,anamnesis,examen_fisico,
           apreciacion,examen_json,datos_plantilla_json,adjuntos_json,id_usuario_crea)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          d.id_paciente,
          d.id_sede,
          sede.id_unidad,
          d.id_personal,
          d.id_cita || null,
          d.id_plantilla_clinica || null,
          d.fecha_consulta,
          d.motivo_consulta?.trim() || '',
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
      if (d.id_cita) {
        try {
          await this.mapa.vincularAConsulta({
            id_consulta: id,
            id_cita: Number(d.id_cita),
            userId,
          });
        } catch {
          /* no bloquear guardado de consulta */
        }
      }
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
    let idUnidad = old.id_unidad == null ? null : Number(old.id_unidad);
    if (d.id_sede) {
      const sede = await this.unidad.exigirSede(Number(d.id_sede), (d as any).id_unidad);
      this.unidad.exigirCambio(old.id_unidad, sede.id_unidad);
      idUnidad = sede.id_unidad;
    }
    const idCitaLigada = Number(d.id_cita || old.id_cita || 0);
    if (idCitaLigada) {
      const [cita] = await this.db.query(
        `SELECT id_unidad, estado FROM cli_cita WHERE id_cita=? AND estado_registro='ACTIVO'`,
        [idCitaLigada],
      );
      if (cita && String(cita.estado) === 'FINALIZADA') {
        throw new BadRequestException('La cita ya está finalizada.');
      }
      if (d.id_cita) {
        if (!cita || cita.id_unidad == null) {
          throw new BadRequestException('La cita no tiene empresa asignada');
        }
        this.unidad.exigirCambio(idUnidad, Number(cita.id_unidad));
      }
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE cli_consulta SET
          id_paciente=COALESCE(?,id_paciente),
          id_sede=COALESCE(?,id_sede),
          id_unidad=COALESCE(?,id_unidad),
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
          idUnidad,
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
    if (c.id_cita) {
      try {
        await this.agenda.completar(Number(c.id_cita), userId);
      } catch {
        // La cita ya estaba cerrada o cancelada; la consulta igual queda finalizada.
      }
      try {
        await this.mapa.vincularAConsulta({
          id_consulta: id,
          id_cita: Number(c.id_cita),
          userId,
        });
      } catch {
        /* mapa opcional */
      }
    }

    let pdfs: any[] = [];
    try {
      pdfs = await this.generarPdfsAtencion(c, userId);
    } catch (err) {
      console.error('Error generando PDFs de atención:', err);
    }

    return { message: 'Consulta finalizada', pdfs };
  }

  /** Genera y guarda 4 PDFs (Anamnesis, EF, Diagnóstico, Plan) en cli_documento */
  private async generarPdfsAtencion(c: any, userId: number) {
    const paciente = c.paciente || 'Paciente';
    const fecha = c.fecha_consulta
      ? new Date(c.fecha_consulta).toLocaleString('es-PE')
      : '';
    const header = (titulo: string) => `
      ${htmlLogoHeader({ titulo, subtitulo: 'Consulta ambulatoria' })}
      <div style="font-size:12px;color:#4a524c;margin-bottom:14px;padding:8px 10px;background:#f6f7f5;border-radius:8px">
        <b>Paciente:</b> ${this.esc(paciente)}
        &nbsp;·&nbsp; <b>Fecha:</b> ${this.esc(fecha)}
        &nbsp;·&nbsp; <b>Profesional:</b> ${this.esc(c.personal || '—')}
      </div>`;
    const wrap = (titulo: string, body: string) => `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        @page{margin:16mm 14mm 18mm 14mm}
        body{font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#1c2620;margin:0;line-height:1.45}
        h2{font-size:14px;margin:14px 0 6px;color:#0d9488}
        .box{border:1px solid #e4e7e3;border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#fafbfa}
        .label{font-size:11px;color:#6b756e;text-transform:uppercase;letter-spacing:.03em}
        table{width:100%;border-collapse:collapse} td,th{border:1px solid #e4e7e3;padding:6px 8px;text-align:left}
        th{background:#f0f3f1;font-size:12px}
      </style></head><body>
        ${header(titulo)}
        <div class="doc-body">${body}</div>
        ${htmlFirmaPie()}
      </body></html>`;

    const ex = c.examen_json || {};
    const plan = c.plan || {};
    const meds = plan.medicamentos || [];

    const docs: { codigo: string; titulo: string; html: string }[] = [
      {
        codigo: 'HC_ANAMNESIS',
        titulo: 'Anamnesis',
        html: wrap(
          'Anamnesis',
          `<div class="box"><div class="label">Motivo de consulta</div>${this.esc(c.motivo_consulta)}</div>
           <div class="box"><div class="label">Tipo de enfermedad</div>${this.esc(c.tipo_enfermedad || '—')}
             &nbsp;·&nbsp; <span class="label">Tiempo</span> ${this.esc(c.tiempo_enfermedad || '—')}</div>
           <h2>Relato</h2><div class="box">${this.nl(c.relato || c.anamnesis || 'Sin relato')}</div>`,
        ),
      },
      {
        codigo: 'HC_EXAMEN_FISICO',
        titulo: 'Examen físico',
        html: wrap(
          'Examen físico',
          `<h2>General</h2>
           <div class="box">Peso: ${ex.peso ?? '—'} kg · Talla: ${ex.talla ?? '—'} cm · IMC: ${ex.imc ?? '—'}<br>
           Estado general: ${this.esc(ex.estado_general || '—')}<br>
           Estado mental: ${this.esc(ex.estado_mental || '—')}</div>
           <h2>Funciones vitales</h2>
           <div class="box">PA ${ex.pa_sistolica ?? '—'}/${ex.pa_diastolica ?? '—'} mmHg ·
             FC ${ex.fc ?? '—'} lpm · FR ${ex.fr ?? '—'} rpm · SatO₂ ${ex.sat_o2 ?? '—'}% · T° ${ex.temperatura ?? '—'} °C</div>
           <h2>Resumen</h2><div class="box">${this.nl(c.examen_fisico || 'Sin hallazgos')}</div>
           ${await this.htmlMarcadoresExamen(Number(c.id_paciente))}`,
        ),
      },
      {
        codigo: 'HC_DIAGNOSTICO',
        titulo: 'Diagnóstico',
        html: wrap(
          'Diagnóstico',
          `<table><thead><tr><th>#</th><th>CIE-10</th><th>Descripción</th><th>Tipo</th></tr></thead><tbody>
           ${(c.diagnosticos || [])
             .map(
               (d: any, i: number) =>
                 `<tr><td>${i + 1}</td><td>${this.esc(d.codigo_cie10 || '')}</td>
                  <td>${this.esc(d.descripcion)}</td><td>${this.esc(d.tipo)}</td></tr>`,
             )
             .join('')}
           </tbody></table>
           <h2>Apreciación</h2><div class="box">${this.nl(c.apreciacion || '—')}</div>`,
        ),
      },
      {
        codigo: 'HC_PLAN',
        titulo: 'Plan terapéutico',
        html: wrap(
          'Plan terapéutico',
          `<h2>Medicamentos</h2>
           ${
             meds.length
               ? `<table><thead><tr><th>Medicamento</th><th>Dosis</th><th>Vía</th><th>Frecuencia</th><th>Duración</th></tr></thead><tbody>
                  ${meds
                    .map(
                      (m: any) =>
                        `<tr><td>${this.esc(m.medicamento)}</td><td>${this.esc(m.dosis || '')}</td>
                         <td>${this.esc(m.via || '')}</td><td>${this.esc(m.frecuencia || '')}</td>
                         <td>${this.esc(m.duracion || '')}</td></tr>`,
                    )
                    .join('')}
                  </tbody></table>`
               : '<div class="box">Sin medicamentos</div>'
           }
           <h2>Indicaciones generales</h2>
           <div class="box">${this.nl(plan.indicaciones_generales || '—')}</div>`,
        ),
      },
    ];

    const saved: any[] = [];
    for (const d of docs) {
      const buffer = await this.pdf.generarPdfBuffer(d.html, {
        sinMargenPagina: true,
        preferCssPageSize: true,
      });
      const row = await this.documentos.guardarPdfGenerado({
        buffer,
        idPaciente: Number(c.id_paciente),
        codigoTipo: d.codigo,
        idConsulta: Number(c.id_consulta),
        idCita: c.id_cita ? Number(c.id_cita) : null,
        titulo: `${d.titulo} — ${paciente}`,
        userId,
      });
      saved.push(row);
    }
    return saved;
  }

  private async htmlMarcadoresExamen(idPaciente: number): Promise<string> {
    if (!idPaciente) return '';
    const rows = await this.db.query(
      `SELECT zona_label, lado, procedimiento, estado, notas
       FROM cli_mapa_marcador
       WHERE id_paciente=? AND estado_registro='ACTIVO'
       ORDER BY id_mapa_marcador`,
      [idPaciente],
    );
    if (!rows?.length) return '';
    const body = rows
      .map(
        (m: any) =>
          `<tr><td>${this.esc(m.zona_label || '')}</td><td>${this.esc(m.lado || '')}</td>
           <td>${this.esc(m.procedimiento || '')}</td><td>${this.esc(m.estado || '')}</td>
           <td>${this.esc(m.notas || '')}</td></tr>`,
      )
      .join('');
    return `<h2>Mapa corporal 3D</h2>
      <table><thead><tr><th>Zona</th><th>Lado</th><th>Procedimiento</th><th>Estado</th><th>Notas</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  }

  private esc(v: any): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private nl(v: any): string {
    return this.esc(v).replace(/\n/g, '<br>');
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
