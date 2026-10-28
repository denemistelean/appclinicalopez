import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { UnidadScopeService } from '@app/auth';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly unidad: UnidadScopeService,
  ) {}

  async resumen(q: any) {
    const desde = q.desde || '1900-01-01';
    const hasta = q.hasta || '2999-12-31';
    const sede = q.id_sede ? Number(q.id_sede) : null;
    if (sede) await this.unidad.exigirSede(sede);
    const citasEmpresa = this.unidad.sqlEmpresa('id_unidad', 'id_sede');
    const pagosEmpresa = this.unidad.sqlEmpresa('p.id_unidad', 'p.id_sede');
    const extraCitas = citasEmpresa.sql ? ` AND ${citasEmpresa.sql}` : '';
    const extraPagos = pagosEmpresa.sql ? ` AND ${pagosEmpresa.sql}` : '';
    const stockEmpresa = this.unidad.sqlPorSede('l.id_sede');
    const extraStock = stockEmpresa.sql ? ` AND (l.id_sede IS NULL OR ${stockEmpresa.sql})` : '';
    const [citas, ingresos, [stock]] = await Promise.all([
      this.db.query(
        `SELECT estado, COUNT(*) total FROM cli_cita
         WHERE estado_registro='ACTIVO' AND fecha_cita BETWEEN ? AND ?
           AND (? IS NULL OR id_sede=?)${extraCitas} GROUP BY estado`,
        [desde, hasta, sede, sede, ...citasEmpresa.params],
      ),
      this.db.query(
        `SELECT p.id_sede, s.nombre sede, SUM(p.monto) ingresos
         FROM cli_pago p JOIN cli_sede s ON s.id_sede=p.id_sede
         WHERE p.estado='REGISTRADO' AND p.estado_registro='ACTIVO'
           AND DATE(p.fecha_pago) BETWEEN ? AND ?
           AND (? IS NULL OR p.id_sede=?)${extraPagos}
         GROUP BY p.id_sede, s.nombre`,
        [desde, hasta, sede, sede, ...pagosEmpresa.params],
      ),
      this.db.query(
        `SELECT COUNT(*) total FROM (
           SELECT i.id_insumo, l.id_sede, SUM(l.cantidad_actual) stock, i.stock_minimo
           FROM cli_insumo i
           LEFT JOIN cli_lote l ON l.id_insumo=i.id_insumo AND l.estado_registro='ACTIVO'
           WHERE i.estado_registro='ACTIVO' AND (? IS NULL OR l.id_sede=?)${extraStock}
           GROUP BY i.id_insumo, l.id_sede, i.stock_minimo
           HAVING stock <= i.stock_minimo
         ) x`,
        [sede, sede, ...stockEmpresa.params],
      ),
    ]);
    return {
      citas_por_estado: citas,
      ingresos_por_sede: ingresos,
      stock_bajo_count: Number(stock?.total || 0),
    };
  }

  /** Padrón de pacientes: KPIs + listado paginado. */
  async pacientes(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 10));
    const offset = (page - 1) * limit;
    const search = String(q.search || '').trim();
    const w = [`p.estado_registro='ACTIVO'`];
    const params: any[] = [];
    if (search) {
      const like = `%${search}%`;
      w.push(`(
        p.nombres LIKE ? OR p.apellidos LIKE ? OR p.numero_documento LIKE ?
        OR CONCAT(p.apellidos,' ',p.nombres) LIKE ?
        OR CONCAT(p.nombres,' ',p.apellidos) LIKE ?
        OR p.telefono LIKE ? OR p.telefono_alterno LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like);
    }
    const where = w.join(' AND ');

    const [kpis] = await this.db.query(
      `SELECT
         COUNT(*) AS total,
         SUM(p.sexo='M') AS masculinos,
         SUM(p.sexo='F') AS femeninos,
         SUM(
           p.fecha_registro IS NOT NULL
           AND YEAR(p.fecha_registro)=YEAR(CURDATE())
           AND MONTH(p.fecha_registro)=MONTH(CURDATE())
         ) AS nuevos_mes
       FROM cli_paciente p
       WHERE p.estado_registro='ACTIVO'`,
    );
    const [countRow] = await this.db.query(
      `SELECT COUNT(*) AS total FROM cli_paciente p WHERE ${where}`,
      params,
    );
    const data = await this.db.query(
      `SELECT
         p.id_paciente,
         p.tipo_documento,
         p.numero_documento,
         p.nombres,
         p.apellidos,
         TRIM(CONCAT(p.apellidos, ', ', p.nombres)) AS nombre_completo,
         p.fecha_nacimiento,
         TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, CURDATE()) AS edad,
         p.sexo,
         p.telefono,
         p.telefono_alterno,
         p.fecha_registro
       FROM cli_paciente p
       WHERE ${where}
       ORDER BY p.apellidos, p.nombres
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    const total = Number(countRow?.total || 0);
    return {
      kpis: {
        total: Number(kpis?.total || 0),
        masculinos: Number(kpis?.masculinos || 0),
        femeninos: Number(kpis?.femeninos || 0),
        nuevos_mes: Number(kpis?.nuevos_mes || 0),
      },
      data,
      meta: {
        total,
        page,
        limit,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
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

    const activa = this.unidad.exigirEmpresa();
    const mismaEmpresa = Number(paciente.id_unidad_registro) === Number(activa);
    const filtroCita = this.unidad.sqlEmpresa('c.id_unidad', 'c.id_sede');
    const extraCita = filtroCita.sql ? ` AND ${filtroCita.sql}` : '';
    const filtroConsulta = this.unidad.sqlEmpresa('c.id_unidad', 'c.id_sede');
    const extraConsulta = filtroConsulta.sql ? ` AND ${filtroConsulta.sql}` : '';
    const filtroPaquete = this.unidad.sqlEmpresa('pp.id_unidad', 'pp.id_sede');
    const extraPaquete = filtroPaquete.sql ? ` AND ${filtroPaquete.sql}` : '';
    const filtroDoc = this.unidad.sqlOrigen('d', {
      consulta: true,
      cita: true,
      sede: false,
      suelto: 'registro',
    });
    const extraDoc = filtroDoc.sql ? ` AND ${filtroDoc.sql}` : '';
    const filtroMapa = this.unidad.sqlOrigen('m', {
      consulta: true,
      cita: true,
      sede: false,
      suelto: 'registro',
    });
    const extraMapa = filtroMapa.sql ? ` AND ${filtroMapa.sql}` : '';

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

    const historiaEntries = mismaEmpresa
      ? await Promise.all(
          Object.entries(histTablas).map(async ([key, table]) => {
            const rows = await this.db.query(
              `SELECT * FROM ${table}
               WHERE id_paciente=? AND estado_registro='ACTIVO'
               ORDER BY 1 DESC LIMIT 200`,
              [id],
            );
            return [key, rows] as const;
          }),
        )
      : Object.keys(histTablas).map((key) => [key, []] as const);
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
       WHERE c.id_paciente=? AND c.estado_registro='ACTIVO'${extraCita}
       ORDER BY c.fecha_cita DESC, c.hora_inicio DESC
       LIMIT 300`,
      [id, ...filtroCita.params],
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
       WHERE pp.id_paciente=? AND pp.estado_registro='ACTIVO'${extraPaquete}
       ORDER BY pp.fecha_compra DESC`,
      [id, ...filtroPaquete.params],
    );

    const consultaRows = await this.db.query(
      `SELECT c.*,
              CONCAT(pe.nombres,' ',pe.apellidos) AS personal,
              pl.nombre AS plantilla, s.nombre AS sede
       FROM cli_consulta c
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       LEFT JOIN cli_plantilla_clinica pl ON pl.id_plantilla_clinica=c.id_plantilla_clinica
       LEFT JOIN cli_sede s ON s.id_sede=c.id_sede
       WHERE c.id_paciente=? AND c.estado_registro='ACTIVO'${extraConsulta}
       ORDER BY c.fecha_consulta DESC
       LIMIT 100`,
      [id, ...filtroConsulta.params],
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
       WHERE d.id_paciente=? AND d.estado_registro='ACTIVO'${extraDoc}
       ORDER BY d.fecha_documento DESC, d.id_documento DESC
       LIMIT 300`,
      [id, ...filtroDoc.params],
    );

    const documentosLegacy = mismaEmpresa
      ? await this.db.query(
          `SELECT id_documento_paciente, tipo_documento, nombre_archivo, mime_type,
                  tamano_bytes, fecha_documento, observaciones
           FROM cli_documento_paciente
           WHERE id_paciente=? AND estado_registro='ACTIVO'
           ORDER BY fecha_documento DESC, id_documento_paciente DESC
           LIMIT 100`,
          [id],
        )
      : [];

    const mapaCorporal = await this.db.query(
      `SELECT m.id_mapa_marcador, m.zona_codigo, m.zona_label, m.lado, m.procedimiento,
              m.estado, m.fecha_plan, m.notas, m.pos_x, m.pos_y, m.pos_z,
              m.vista_2d, m.pos_2d_x, m.pos_2d_y, m.origen,
              m.id_consulta, m.id_cita
       FROM cli_mapa_marcador m
       WHERE m.id_paciente=? AND m.estado_registro='ACTIVO'${extraMapa}
       ORDER BY
         CASE m.estado WHEN 'REALIZADO' THEN 0 WHEN 'SEGUIMIENTO' THEN 1 ELSE 2 END,
         m.fecha_plan DESC, m.id_mapa_marcador DESC
       LIMIT 200`,
      [id, ...filtroMapa.params],
    );

    const tratamientosUnicos = await this.db.query(
      `SELECT DISTINCT t.id_tratamiento, t.codigo, t.nombre, t.categoria, t.duracion_minutos,
              t.precio_base, e.nombre AS especialidad
       FROM cli_cita c
       JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento AND t.estado_registro='ACTIVO'
       LEFT JOIN cli_especialidad e ON e.id_especialidad=t.id_especialidad
       WHERE c.id_paciente=? AND c.estado_registro='ACTIVO' AND c.id_tratamiento IS NOT NULL${extraCita}
       ORDER BY t.nombre`,
      [id, ...filtroCita.params],
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

  /** Reportes operativos Sorela (7.1–7.10). */
  async sorela(tipo: string, q: any) {
    const desde = String(q.desde || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const hasta = String(q.hasta || desde).slice(0, 10);
    const sede = q.id_sede ? Number(q.id_sede) : null;
    if (sede) await this.unidad.exigirSede(sede);
    const u = this.unidad.sqlEmpresa('h.id_unidad');
    const idUnidad = this.unidad.empresaActiva();
    const extraU = u.sql ? ` AND ${u.sql}` : idUnidad ? ' AND h.id_unidad = ?' : '';
    const paramsU = u.sql ? u.params : idUnidad ? [idUnidad] : [];

    const key = String(tipo || 'resumen').toLowerCase().replace(/_/g, '-');
    switch (key) {
      case 'resumen':
      case '7.1':
        return this.sorelaResumen(desde, hasta, sede, extraU, paramsU);
      case 'cosmiatra':
      case '7.2':
        return this.sorelaCosmiatra(desde, hasta, sede, extraU, paramsU);
      case 'canales':
      case '7.3':
        return this.sorelaCanales(extraU, paramsU);
      case 'nuevos-recurrentes':
      case '7.4':
        return this.sorelaNuevosRecurrentes(desde, hasta, extraU, paramsU);
      case 'servicios':
      case '7.5':
        return this.sorelaServicios(desde, hasta, extraU, paramsU);
      case 'sesiones-pendientes':
      case '7.6':
        return this.sorelaSesionesPendientes(extraU, paramsU);
      case 'seguimiento':
      case '7.7':
        return this.sorelaSeguimiento(desde, hasta, sede, extraU, paramsU);
      case 'saldos':
      case '7.8':
        return this.sorelaSaldos(extraU, paramsU);
      case 'historico':
      case '7.9':
        return this.sorelaHistorico(extraU, paramsU);
      case 'comision-externa':
      case '7.10':
        return this.sorelaComisionExterna(desde, hasta, sede, extraU, paramsU);
      default:
        return {
          generado_en: new Date().toISOString(),
          tipos: [
            'resumen',
            'cosmiatra',
            'canales',
            'nuevos-recurrentes',
            'servicios',
            'sesiones-pendientes',
            'seguimiento',
            'saldos',
            'historico',
            'comision-externa',
          ],
        };
    }
  }

  private async sorelaResumen(
    desde: string,
    hasta: string,
    sede: number | null,
    extraU: string,
    paramsU: any[],
  ) {
    const cobrosEmpresa = this.unidad.sqlEmpresa('p.id_unidad', 'p.id_sede');
    const extraCobros = cobrosEmpresa.sql ? ` AND ${cobrosEmpresa.sql}` : '';
    const [[ventas], [cobros], [atenciones], [paquetes], [sesiones]] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*) total, COALESCE(SUM(v.monto_total),0) importe
         FROM cli_hd_venta v
         JOIN cli_hd_paquete pk ON pk.id_hd_paquete = v.id_hd_paquete
         JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
         WHERE v.estado_registro='ACTIVO' AND v.estado<>'ANULADA'
           AND DATE(v.fecha) BETWEEN ? AND ?${extraU}`,
        [desde, hasta, ...paramsU],
      ),
      this.db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN UPPER(COALESCE(p.tipo_pago,''))='DEVOLUCION' THEN -p.monto ELSE p.monto END),0) cobrado,
           COUNT(*) movimientos
         FROM cli_pago p
         WHERE p.estado='REGISTRADO' AND p.estado_registro='ACTIVO'
           AND DATE(p.fecha_pago) BETWEEN ? AND ?
           AND (? IS NULL OR p.id_sede=?)${extraCobros}`,
        [desde, hasta, sede, sede, ...cobrosEmpresa.params],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT a.id_paciente) pacientes, COUNT(*) atenciones
         FROM cli_hd_atencion a
         JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
         LEFT JOIN cli_cita c ON c.id_cita = a.id_cita
         WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'
           AND DATE(COALESCE(a.fecha_cierre, c.fecha_cita)) BETWEEN ? AND ?${extraU}`,
        [desde, hasta, ...paramsU],
      ),
      this.db.query(
        `SELECT COUNT(*) total
         FROM cli_hd_paquete pk
         JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
         WHERE pk.estado_registro='ACTIVO'
           AND EXISTS (
             SELECT 1 FROM cli_hd_venta v
             WHERE v.id_hd_paquete=pk.id_hd_paquete AND v.estado_registro='ACTIVO'
               AND DATE(v.fecha) BETWEEN ? AND ?
           )${extraU}`,
        [desde, hasta, ...paramsU],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(pk.sesiones_usadas),0) realizadas
         FROM cli_hd_paquete pk
         JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
         WHERE pk.estado_registro='ACTIVO'${extraU}`,
        paramsU,
      ),
    ]);
    return {
      tipo: 'resumen',
      desde,
      hasta,
      ventas: { total: Number(ventas?.total || 0), importe: Number(ventas?.importe || 0) },
      cobros: { cobrado: Number(cobros?.cobrado || 0), movimientos: Number(cobros?.movimientos || 0) },
      pacientes_atendidos: Number(atenciones?.pacientes || 0),
      atenciones: Number(atenciones?.atenciones || 0),
      paquetes_vendidos: Number(paquetes?.total || 0),
      sesiones_realizadas: Number(sesiones?.realizadas || 0),
    };
  }

  private async sorelaCosmiatra(
    desde: string,
    hasta: string,
    sede: number | null,
    extraU: string,
    paramsU: any[],
  ) {
    const atenciones = await this.db.query(
      `SELECT a.id_personal,
              CONCAT(pe.nombres,' ',pe.apellidos) cosmiatra,
              COUNT(*) atenciones
       FROM cli_hd_atencion a
       JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
       JOIN cli_personal pe ON pe.id_personal = a.id_personal
       WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'
         AND a.id_personal IS NOT NULL
         AND DATE(COALESCE(a.fecha_cierre, CURDATE())) BETWEEN ? AND ?${extraU}
       GROUP BY a.id_personal, pe.nombres, pe.apellidos`,
      [desde, hasta, ...paramsU],
    );
    const citasEmpresa = this.unidad.sqlEmpresa('c.id_unidad', 'c.id_sede');
    const extraC = citasEmpresa.sql ? ` AND ${citasEmpresa.sql}` : '';
    const citas = await this.db.query(
      `SELECT c.id_personal,
              COUNT(CASE WHEN c.estado='FINALIZADA' THEN 1 END) asistencias,
              COUNT(CASE WHEN c.estado='NO_ASISTIO' THEN 1 END) inasistencias
       FROM cli_cita c
       WHERE c.estado_registro='ACTIVO'
         AND c.fecha_cita BETWEEN ? AND ?
         AND (? IS NULL OR c.id_sede=?)${extraC}
       GROUP BY c.id_personal`,
      [desde, hasta, sede, sede, ...citasEmpresa.params],
    );
    const ventas = await this.db.query(
      `SELECT a.id_personal, COALESCE(SUM(v.monto_total),0) ventas_atribuidas
       FROM cli_hd_atencion a
       JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
       JOIN cli_hd_venta v
         ON v.id_hd_paquete = a.id_hd_paquete AND v.estado_registro='ACTIVO' AND v.estado<>'ANULADA'
       WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'
         AND a.id_personal IS NOT NULL
         AND DATE(COALESCE(a.fecha_cierre, CURDATE())) BETWEEN ? AND ?${extraU}
       GROUP BY a.id_personal`,
      [desde, hasta, ...paramsU],
    );
    const byId = new Map<number, any>();
    for (const r of atenciones) {
      byId.set(Number(r.id_personal), {
        id_personal: Number(r.id_personal),
        cosmiatra: r.cosmiatra,
        atenciones: Number(r.atenciones || 0),
        asistencias: 0,
        inasistencias: 0,
        ventas_atribuidas: 0,
      });
    }
    for (const r of citas) {
      const id = Number(r.id_personal);
      const cur = byId.get(id) || {
        id_personal: id,
        cosmiatra: null,
        atenciones: 0,
        asistencias: 0,
        inasistencias: 0,
        ventas_atribuidas: 0,
      };
      cur.asistencias = Number(r.asistencias || 0);
      cur.inasistencias = Number(r.inasistencias || 0);
      byId.set(id, cur);
    }
    for (const r of ventas) {
      const id = Number(r.id_personal);
      const cur = byId.get(id);
      if (cur) cur.ventas_atribuidas = Number(r.ventas_atribuidas || 0);
    }
    const filas = [...byId.values()].sort(
      (a, b) => b.atenciones - a.atenciones || String(a.cosmiatra || '').localeCompare(String(b.cosmiatra || '')),
    );
    return { tipo: 'cosmiatra', desde, hasta, filas };
  }

  private async sorelaCanales(extraU: string, paramsU: any[]) {
    const filas = await this.db.query(
      `SELECT COALESCE(NULLIF(TRIM(h.procedencia),''), 'SIN_DATO') canal,
              COUNT(*) cantidad
       FROM cli_historia_digital h
       WHERE h.estado_registro='ACTIVO'${extraU}
       GROUP BY canal
       ORDER BY cantidad DESC`,
      paramsU,
    );
    const total = filas.reduce((s: number, r: any) => s + Number(r.cantidad || 0), 0) || 1;
    return {
      tipo: 'canales',
      filas: filas.map((r: any) => ({
        ...r,
        porcentaje: Math.round((Number(r.cantidad) * 10000) / total) / 100,
      })),
      total: total === 1 && !filas.length ? 0 : total,
    };
  }

  private async sorelaNuevosRecurrentes(
    desde: string,
    hasta: string,
    extraU: string,
    paramsU: any[],
  ) {
    const atendidos = await this.db.query(
      `SELECT a.id_paciente,
              MIN(DATE(COALESCE(a.fecha_cierre, CURDATE()))) primera_sorela
       FROM cli_hd_atencion a
       JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
       WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'${extraU}
       GROUP BY a.id_paciente`,
      paramsU,
    );
    const ids = atendidos.map((x: any) => Number(x.id_paciente));
    let primerasOrg: Record<number, string> = {};
    if (ids.length) {
      const rows = await this.db.query(
        `SELECT id_paciente, MIN(fecha_cita) primera
         FROM cli_cita
         WHERE estado_registro='ACTIVO' AND estado NOT IN ('CANCELADA')
           AND id_paciente IN (${ids.map(() => '?').join(',')})
         GROUP BY id_paciente`,
        ids,
      );
      primerasOrg = Object.fromEntries(
        rows.map((r: any) => [Number(r.id_paciente), String(r.primera).slice(0, 10)]),
      );
    }
    let nuevosSorela = 0;
    let recurrentesSorela = 0;
    let nuevosOrg = 0;
    for (const a of atendidos) {
      const ps = String(a.primera_sorela).slice(0, 10);
      if (ps >= desde && ps <= hasta) nuevosSorela++;
      else if (ps < desde) recurrentesSorela++;
      const po = primerasOrg[Number(a.id_paciente)];
      if (po && po >= desde && po <= hasta) nuevosOrg++;
    }
    const totalPeriodo = await this.db.query(
      `SELECT COUNT(DISTINCT a.id_paciente) total
       FROM cli_hd_atencion a
       JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
       WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'
         AND DATE(COALESCE(a.fecha_cierre, CURDATE())) BETWEEN ? AND ?${extraU}`,
      [desde, hasta, ...paramsU],
    );
    const total = Number(totalPeriodo[0]?.total || 0) || 1;
    return {
      tipo: 'nuevos-recurrentes',
      desde,
      hasta,
      pacientes_periodo: Number(totalPeriodo[0]?.total || 0),
      primera_atencion_sorela: {
        nuevos: nuevosSorela,
        porcentaje_nuevos: Math.round((nuevosSorela * 10000) / total) / 100,
      },
      recurrentes_sorela: {
        cantidad: recurrentesSorela,
        porcentaje: Math.round((recurrentesSorela * 10000) / total) / 100,
      },
      primera_atencion_organizacion: { nuevos: nuevosOrg },
    };
  }

  private async sorelaServicios(desde: string, hasta: string, extraU: string, paramsU: any[]) {
    const filas = await this.db.query(
      `SELECT v.nombre servicio, COUNT(*) cantidad, SUM(v.monto_total) importe
       FROM cli_hd_venta v
       JOIN cli_hd_paquete pk ON pk.id_hd_paquete = v.id_hd_paquete
       JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
       WHERE v.estado_registro='ACTIVO' AND v.estado<>'ANULADA'
         AND DATE(v.fecha) BETWEEN ? AND ?${extraU}
       GROUP BY v.nombre
       ORDER BY importe DESC`,
      [desde, hasta, ...paramsU],
    );
    const totalImp = filas.reduce((s: number, r: any) => s + Number(r.importe || 0), 0) || 1;
    return {
      tipo: 'servicios',
      desde,
      hasta,
      filas: filas.map((r: any) => ({
        ...r,
        importe: Number(r.importe || 0),
        participacion: Math.round((Number(r.importe || 0) * 10000) / totalImp) / 100,
      })),
    };
  }

  private async sorelaSesionesPendientes(extraU: string, paramsU: any[]) {
    const filas = await this.db.query(
      `SELECT pk.id_hd_paquete, pk.nombre paquete,
              CONCAT(pa.apellidos, ', ', pa.nombres) paciente,
              pk.sesiones_total, pk.sesiones_usadas,
              (pk.sesiones_total - pk.sesiones_usadas) pendientes,
              (SELECT GROUP_CONCAT(CONCAT(c.nombre, ' (', c.sesiones_usadas, '/', c.sesiones_total, ')')
                      ORDER BY c.id_hd_componente SEPARATOR '; ')
                 FROM cli_hd_paquete_componente c
                WHERE c.id_hd_paquete = pk.id_hd_paquete AND c.estado_registro='ACTIVO') componentes
       FROM cli_hd_paquete pk
       JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
       JOIN cli_paciente pa ON pa.id_paciente = h.id_paciente
       WHERE pk.estado_registro='ACTIVO'
         AND pk.sesiones_usadas < pk.sesiones_total${extraU}
       ORDER BY pendientes DESC, paciente`,
      paramsU,
    );
    return { tipo: 'sesiones-pendientes', filas };
  }

  private async sorelaSeguimiento(
    desde: string,
    hasta: string,
    sede: number | null,
    extraU: string,
    paramsU: any[],
  ) {
    const citasEmpresa = this.unidad.sqlEmpresa('c.id_unidad', 'c.id_sede');
    const extraC = citasEmpresa.sql ? ` AND ${citasEmpresa.sql}` : '';
    const [sinProxima, inasistencias, controles] = await Promise.all([
      this.db.query(
        `SELECT CONCAT(pa.apellidos, ', ', pa.nombres) paciente, pa.id_paciente,
                MAX(a.fecha_cierre) ultima_atencion, MAX(a.proxima_revision) proxima_revision
         FROM cli_hd_atencion a
         JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
         JOIN cli_paciente pa ON pa.id_paciente = a.id_paciente
         WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'${extraU}
         GROUP BY pa.id_paciente, pa.apellidos, pa.nombres
         HAVING (proxima_revision IS NULL OR proxima_revision < CURDATE())
            AND NOT EXISTS (
              SELECT 1 FROM cli_cita c
              WHERE c.id_paciente = pa.id_paciente AND c.estado_registro='ACTIVO'
                AND c.estado IN ('PENDIENTE','CONFIRMADA','EN_ATENCION')
                AND c.fecha_cita >= CURDATE()
            )
         ORDER BY ultima_atencion DESC
         LIMIT 200`,
        paramsU,
      ),
      this.db.query(
        `SELECT c.fecha_cita, CONCAT(pa.apellidos, ', ', pa.nombres) paciente,
                CONCAT(pe.nombres, ' ', pe.apellidos) personal
         FROM cli_cita c
         JOIN cli_paciente pa ON pa.id_paciente = c.id_paciente
         JOIN cli_personal pe ON pe.id_personal = c.id_personal
         WHERE c.estado_registro='ACTIVO' AND c.estado='NO_ASISTIO'
           AND c.fecha_cita BETWEEN ? AND ?
           AND (? IS NULL OR c.id_sede=?)${extraC}
         ORDER BY c.fecha_cita DESC
         LIMIT 200`,
        [desde, hasta, sede, sede, ...citasEmpresa.params],
      ),
      this.db.query(
        `SELECT CONCAT(pa.apellidos, ', ', pa.nombres) paciente, a.proxima_revision, a.zona
         FROM cli_hd_atencion a
         JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
         JOIN cli_paciente pa ON pa.id_paciente = a.id_paciente
         WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'
           AND a.proxima_revision BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)${extraU}
         ORDER BY a.proxima_revision
         LIMIT 200`,
        paramsU,
      ),
    ]);
    return {
      tipo: 'seguimiento',
      sin_proxima_cita: sinProxima,
      inasistencias,
      controles_pendientes: controles,
    };
  }

  private async sorelaSaldos(extraU: string, paramsU: any[]) {
    const filas = await this.db.query(
      `SELECT pk.id_hd_paquete, pk.nombre paquete,
              CONCAT(pa.apellidos, ', ', pa.nombres) paciente,
              pk.precio_acordado,
              COALESCE((
                SELECT SUM(CASE WHEN UPPER(COALESCE(pg.tipo_pago,''))='DEVOLUCION' THEN -pg.monto ELSE pg.monto END)
                FROM cli_pago pg
                WHERE pg.id_hd_paquete = pk.id_hd_paquete
                  AND pg.estado='REGISTRADO' AND pg.estado_registro='ACTIVO'
              ), 0) pagado,
              (pk.precio_acordado - COALESCE((
                SELECT SUM(CASE WHEN UPPER(COALESCE(pg.tipo_pago,''))='DEVOLUCION' THEN -pg.monto ELSE pg.monto END)
                FROM cli_pago pg
                WHERE pg.id_hd_paquete = pk.id_hd_paquete
                  AND pg.estado='REGISTRADO' AND pg.estado_registro='ACTIVO'
              ), 0)) saldo,
              (
                SELECT MAX(DATE(pg.fecha_pago)) FROM cli_pago pg
                WHERE pg.id_hd_paquete = pk.id_hd_paquete
                  AND pg.estado='REGISTRADO' AND pg.estado_registro='ACTIVO'
                  AND UPPER(COALESCE(pg.tipo_pago,'')) <> 'DEVOLUCION'
              ) ultimo_abono
       FROM cli_hd_paquete pk
       JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
       JOIN cli_paciente pa ON pa.id_paciente = h.id_paciente
       WHERE pk.estado_registro='ACTIVO'${extraU}
       HAVING saldo > 0.009
       ORDER BY saldo DESC`,
      paramsU,
    );
    return {
      tipo: 'saldos',
      filas: filas.map((r: any) => ({
        ...r,
        precio_acordado: Number(r.precio_acordado || 0),
        pagado: Number(r.pagado || 0),
        saldo: Number(r.saldo || 0),
        fecha_limite_pago: null,
      })),
    };
  }

  private async sorelaHistorico(extraU: string, paramsU: any[]) {
    const filas = await this.db.query(
      `SELECT DATE_FORMAT(v.fecha, '%Y-%m') periodo,
              COUNT(*) ventas,
              SUM(v.monto_total) importe
       FROM cli_hd_venta v
       JOIN cli_hd_paquete pk ON pk.id_hd_paquete = v.id_hd_paquete
       JOIN cli_historia_digital h ON h.id_historia_digital = pk.id_historia_digital
       WHERE v.estado_registro='ACTIVO' AND v.estado<>'ANULADA'
         AND v.fecha >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)${extraU}
       GROUP BY DATE_FORMAT(v.fecha, '%Y-%m')
       ORDER BY periodo`,
      paramsU,
    );
    return {
      tipo: 'historico',
      filas: filas.map((r: any) => ({
        ...r,
        importe: Number(r.importe || 0),
        dias_habiles: null,
        meta: null,
        avance_meta: null,
      })),
      nota: 'Metas mensuales aún no configuradas; se muestra comparación histórica de ventas.',
    };
  }

  private async sorelaComisionExterna(
    desde: string,
    hasta: string,
    sede: number | null,
    extraU: string,
    paramsU: any[],
  ) {
    const filas = await this.db.query(
      `SELECT CONCAT(pa.apellidos, ', ', pa.nombres) paciente,
              DATE(COALESCE(a.fecha_cierre, c.fecha_cita)) fecha,
              COALESCE(ci.nombre, pk.nombre, t.nombre, 'Procedimiento') procedimiento,
              COALESCE(v.monto_total, pk.precio_acordado, 0) importe,
              COALESCE((
                SELECT pg.moneda FROM cli_pago pg
                WHERE pg.id_hd_paquete = a.id_hd_paquete AND pg.estado_registro='ACTIVO'
                ORDER BY pg.id_pago DESC LIMIT 1
              ), 'PEN') moneda,
              h.detalle_referido referido,
              CONCAT(pe.nombres, ' ', pe.apellidos) cosmiatra
       FROM cli_hd_atencion a
       JOIN cli_historia_digital h ON h.id_historia_digital = a.id_historia_digital
       JOIN cli_paciente pa ON pa.id_paciente = a.id_paciente
       LEFT JOIN cli_cita c ON c.id_cita = a.id_cita
       LEFT JOIN cli_personal pe ON pe.id_personal = a.id_personal
       LEFT JOIN cli_hd_paquete pk ON pk.id_hd_paquete = a.id_hd_paquete
       LEFT JOIN cli_catalogo_item ci ON ci.id_item = a.id_item
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento = c.id_tratamiento
       LEFT JOIN cli_hd_venta v ON v.id_hd_paquete = a.id_hd_paquete AND v.estado_registro='ACTIVO'
       WHERE a.estado_registro='ACTIVO' AND a.estado='FINALIZADA'
         AND DATE(COALESCE(a.fecha_cierre, c.fecha_cita, CURDATE())) BETWEEN ? AND ?
         AND (? IS NULL OR c.id_sede=?)${extraU}
       ORDER BY fecha DESC, paciente
       LIMIT 500`,
      [desde, hasta, sede, sede, ...paramsU],
    );
    return {
      tipo: 'comision-externa',
      desde,
      hasta,
      filas: filas.map((r: any) => ({ ...r, importe: Number(r.importe || 0) })),
    };
  }
}
