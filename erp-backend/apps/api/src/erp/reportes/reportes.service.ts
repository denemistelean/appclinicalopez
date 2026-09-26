import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async resumen(q: any) {
    const desde = q.desde || '1900-01-01';
    const hasta = q.hasta || '2999-12-31';
    const sede = q.id_sede ? Number(q.id_sede) : null;
    const [citas, ingresos, [stock]] = await Promise.all([
      this.db.query(
        `SELECT estado, COUNT(*) total FROM cli_cita
         WHERE estado_registro='ACTIVO' AND fecha_cita BETWEEN ? AND ?
           AND (? IS NULL OR id_sede=?) GROUP BY estado`,
        [desde, hasta, sede, sede],
      ),
      this.db.query(
        `SELECT p.id_sede, s.nombre sede, SUM(p.monto) ingresos
         FROM cli_pago p JOIN cli_sede s ON s.id_sede=p.id_sede
         WHERE p.estado='REGISTRADO' AND p.estado_registro='ACTIVO'
           AND DATE(p.fecha_pago) BETWEEN ? AND ?
           AND (? IS NULL OR p.id_sede=?)
         GROUP BY p.id_sede, s.nombre`,
        [desde, hasta, sede, sede],
      ),
      this.db.query(
        `SELECT COUNT(*) total FROM (
           SELECT i.id_insumo, l.id_sede, SUM(l.cantidad_actual) stock, i.stock_minimo
           FROM cli_insumo i
           LEFT JOIN cli_lote l ON l.id_insumo=i.id_insumo AND l.estado_registro='ACTIVO'
           WHERE i.estado_registro='ACTIVO' AND (? IS NULL OR l.id_sede=?)
           GROUP BY i.id_insumo, l.id_sede, i.stock_minimo
           HAVING stock <= i.stock_minimo
         ) x`,
        [sede, sede],
      ),
    ]);
    return {
      citas_por_estado: citas,
      ingresos_por_sede: ingresos,
      stock_bajo_count: Number(stock?.total || 0),
    };
  }

  /** Informe integral por paciente (JSON). El FE filtra vacíos al renderizar. */
  async informePaciente(idPaciente: number) {
    const id = Number(idPaciente);
    const [paciente] = await this.db.query(
      `SELECT p.*, s.nombre AS sede_nombre
       FROM cli_paciente p
       LEFT JOIN cli_sede s ON s.id_sede = p.id_sede_registro
       WHERE p.id_paciente=? AND p.estado_registro='ACTIVO'`,
      [id],
    );
    if (!paciente) throw new NotFoundException('Paciente no encontrado');

    const histTablas: Record<string, string> = {
      medidas: 'cli_paciente_medida',
      vitales: 'cli_paciente_funcion_vital',
      vacunas: 'cli_paciente_vacuna',
      antecedentes_patologicos: 'cli_paciente_antecedente_patologico',
      antecedentes_personales: 'cli_paciente_antecedente_personal',
      antecedentes_quirurgicos: 'cli_paciente_antecedente_quirurgico',
      antecedentes_familiares: 'cli_paciente_antecedente_familiar',
      alergias: 'cli_paciente_alergia_ram',
      medicaciones: 'cli_paciente_medicacion_habitual',
      gineco_obstetricos: 'cli_paciente_gineco_obstetrico',
      embarazos: 'cli_paciente_embarazo',
    };

    const historiaEntries = await Promise.all(
      Object.entries(histTablas).map(async ([key, table]) => {
        const rows = await this.db.query(
          `SELECT * FROM ${table}
           WHERE id_paciente=? AND estado_registro='ACTIVO'
           ORDER BY 1 DESC LIMIT 200`,
          [id],
        );
        return [key, rows] as const;
      }),
    );
    const historia = Object.fromEntries(historiaEntries);

    const citas = await this.db.query(
      `SELECT c.*,
              t.nombre AS tratamiento, t.categoria AS tratamiento_categoria,
              tc.nombre AS tipo_cita, tc.codigo AS tipo_cita_codigo,
              CONCAT(pe.nombres,' ',pe.apellidos) AS personal,
              s.nombre AS sede
       FROM cli_cita c
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita=c.id_tipo_cita
       LEFT JOIN cli_sede s ON s.id_sede=c.id_sede
       WHERE c.id_paciente=? AND c.estado_registro='ACTIVO'
       ORDER BY c.fecha_cita DESC, c.hora_inicio DESC
       LIMIT 300`,
      [id],
    );

    const citaIds = citas.map((c: any) => Number(c.id_cita)).filter(Boolean);
    let participantesPorCita: Record<number, any[]> = {};
    if (citaIds.length) {
      const parts = await this.db.query(
        `SELECT rh.*, CONCAT(pe.nombres,' ',pe.apellidos) AS personal,
                rr.nombre AS rol_nombre
         FROM cli_cita_recurso_humano rh
         JOIN cli_personal pe ON pe.id_personal=rh.id_personal
         LEFT JOIN cli_rol_recurso rr ON rr.id_rol_recurso=rh.id_rol_recurso
         WHERE rh.estado_registro='ACTIVO' AND rh.id_cita IN (${citaIds.map(() => '?').join(',')})
         ORDER BY rh.id_cita`,
        citaIds,
      );
      participantesPorCita = {};
      for (const p of parts) {
        const k = Number(p.id_cita);
        if (!participantesPorCita[k]) participantesPorCita[k] = [];
        participantesPorCita[k].push(p);
      }
    }
    const citasDetalle = citas.map((c: any) => ({
      ...c,
      participantes: participantesPorCita[Number(c.id_cita)] || [],
    }));

    const paquetes = await this.db.query(
      `SELECT pp.*, pq.nombre AS paquete_nombre, s.nombre AS sede
       FROM cli_paciente_paquete pp
       LEFT JOIN cli_paquete pq ON pq.id_paquete=pp.id_paquete
       LEFT JOIN cli_sede s ON s.id_sede=pp.id_sede
       WHERE pp.id_paciente=? AND pp.estado_registro='ACTIVO'
       ORDER BY pp.fecha_compra DESC`,
      [id],
    );

    const consultaRows = await this.db.query(
      `SELECT c.*,
              CONCAT(pe.nombres,' ',pe.apellidos) AS personal,
              pl.nombre AS plantilla, s.nombre AS sede
       FROM cli_consulta c
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       LEFT JOIN cli_plantilla_clinica pl ON pl.id_plantilla_clinica=c.id_plantilla_clinica
       LEFT JOIN cli_sede s ON s.id_sede=c.id_sede
       WHERE c.id_paciente=? AND c.estado_registro='ACTIVO'
       ORDER BY c.fecha_consulta DESC
       LIMIT 100`,
      [id],
    );

    const historiasClinicas = await Promise.all(
      consultaRows.map(async (c: any) => {
        const diagnosticos = await this.db.query(
          `SELECT * FROM cli_consulta_diagnostico
           WHERE id_consulta=? AND estado_registro='ACTIVO'`,
          [c.id_consulta],
        );
        const [plan] = await this.db.query(
          `SELECT * FROM cli_consulta_plan
           WHERE id_consulta=? AND estado_registro='ACTIVO'`,
          [c.id_consulta],
        );
        let planFull: any = null;
        if (plan) {
          const [tratamientos, examenes, imagenes, medicamentos] = await Promise.all([
            this.db.query(
              `SELECT * FROM cli_consulta_plan_tratamiento
               WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
              [plan.id_consulta_plan],
            ),
            this.db.query(
              `SELECT * FROM cli_consulta_plan_examen
               WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
              [plan.id_consulta_plan],
            ),
            this.db.query(
              `SELECT * FROM cli_consulta_plan_imagen
               WHERE id_consulta_plan=? AND estado_registro='ACTIVO'`,
              [plan.id_consulta_plan],
            ),
            this.db.query(
              `SELECT * FROM cli_consulta_plan_medicamento
               WHERE id_consulta_plan=? AND estado_registro='ACTIVO' ORDER BY orden`,
              [plan.id_consulta_plan],
            ),
          ]);
          planFull = { ...plan, tratamientos, examenes, imagenes, medicamentos };
        }
        return {
          ...c,
          examen_json: this.parseJson(c.examen_json),
          datos_plantilla_json: this.parseJson(c.datos_plantilla_json),
          adjuntos_json: this.parseJson(c.adjuntos_json),
          diagnosticos,
          plan: planFull,
        };
      }),
    );

    const documentos = await this.db.query(
      `SELECT d.id_documento, d.id_paciente, d.id_consulta, d.id_cita, d.titulo,
              d.nombre_original, d.mime_type, d.tamano_bytes, d.fecha_documento,
              d.observaciones, t.codigo AS tipo_codigo, t.nombre AS tipo_nombre
       FROM cli_documento d
       JOIN cli_tipo_documento t ON t.id_tipo_documento=d.id_tipo_documento
       WHERE d.id_paciente=? AND d.estado_registro='ACTIVO'
       ORDER BY d.fecha_documento DESC, d.id_documento DESC
       LIMIT 300`,
      [id],
    );

    const documentosLegacy = await this.db.query(
      `SELECT id_documento_paciente, tipo_documento, nombre_archivo, mime_type,
              tamano_bytes, fecha_documento, observaciones
       FROM cli_documento_paciente
       WHERE id_paciente=? AND estado_registro='ACTIVO'
       ORDER BY fecha_documento DESC, id_documento_paciente DESC
       LIMIT 100`,
      [id],
    );

    const mapaCorporal = await this.db.query(
      `SELECT m.id_mapa_marcador, m.zona_codigo, m.zona_label, m.lado, m.procedimiento,
              m.estado, m.fecha_plan, m.notas, m.pos_x, m.pos_y, m.pos_z,
              m.vista_2d, m.pos_2d_x, m.pos_2d_y, m.origen,
              m.id_consulta, m.id_cita
       FROM cli_mapa_marcador m
       WHERE m.id_paciente=? AND m.estado_registro='ACTIVO'
       ORDER BY
         CASE m.estado WHEN 'REALIZADO' THEN 0 WHEN 'SEGUIMIENTO' THEN 1 ELSE 2 END,
         m.fecha_plan DESC, m.id_mapa_marcador DESC
       LIMIT 200`,
      [id],
    );

    const tratamientosUnicos = await this.db.query(
      `SELECT DISTINCT t.id_tratamiento, t.codigo, t.nombre, t.categoria, t.duracion_minutos,
              t.precio_base, e.nombre AS especialidad
       FROM cli_cita c
       JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento AND t.estado_registro='ACTIVO'
       LEFT JOIN cli_especialidad e ON e.id_especialidad=t.id_especialidad
       WHERE c.id_paciente=? AND c.estado_registro='ACTIVO' AND c.id_tratamiento IS NOT NULL
       ORDER BY t.nombre`,
      [id],
    );

    return {
      generado_en: new Date().toISOString(),
      paciente,
      tratamientos: tratamientosUnicos,
      paquetes,
      citas: citasDetalle,
      historia_paciente: historia,
      historias_clinicas: historiasClinicas,
      documentos,
      documentos_legacy: documentosLegacy,
      mapa_corporal: mapaCorporal,
    };
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
}
