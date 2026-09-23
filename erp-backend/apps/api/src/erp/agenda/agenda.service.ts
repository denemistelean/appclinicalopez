import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import {
  CancelarCitaDto,
  CreateCitaDto,
  ListaEsperaDto,
  PacientePaqueteDto,
  ParticipanteCitaDto,
  UpdateCitaDto,
} from './agenda.dto';

type Step = { pass: boolean; soft?: boolean; msg: string; codigo?: string };

@Injectable()
export class AgendaService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly events: EventEmitter2,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }

  private toMin(hora: string): number {
    const [h, m] = String(hora).slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  }

  private fromMin(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  }

  private sumarMinutos(hora: string, min: number): string {
    return this.fromMin(this.toMin(hora) + min);
  }

  private overlaps(aS: number, aE: number, bS: number, bE: number) {
    return aS < bE && bS < aE;
  }

  /**
   * ¿El personal puede atender el tratamiento?
   * Prioridad: especialidad asignada → nombre de especialidad → texto legado → certificación.
   * No usa rol de recurso ESPECIALISTA/MEDICO.
   */
  private async personalCubreTratamiento(
    idPersonal: number,
    t: any,
    fecha: string,
  ): Promise<{ ok: boolean; via: string }> {
    if (!t?.id_tratamiento) return { ok: true, via: 'sin_tratamiento' };

    if (t.id_especialidad) {
      const [pe] = await this.db.query(
        `SELECT id_personal_especialidad FROM cli_personal_especialidad
         WHERE id_personal=? AND id_especialidad=? AND estado_registro='ACTIVO'`,
        [idPersonal, t.id_especialidad],
      );
      if (pe) return { ok: true, via: 'especialidad' };
    }

    const [matchNombre] = await this.db.query(
      `SELECT pe.id_personal_especialidad
       FROM cli_personal_especialidad pe
       JOIN cli_especialidad e ON e.id_especialidad=pe.id_especialidad AND e.estado_registro='ACTIVO'
       WHERE pe.id_personal=? AND pe.estado_registro='ACTIVO'
         AND UPPER(TRIM(e.nombre)) = UPPER(TRIM(?))
       LIMIT 1`,
      [idPersonal, t.nombre],
    );
    if (matchNombre) return { ok: true, via: 'especialidad_nombre' };

    const [p] = await this.db.query(
      `SELECT especialidad FROM cli_personal WHERE id_personal=? AND estado_registro='ACTIVO'`,
      [idPersonal],
    );
    if (p?.especialidad && t.nombre) {
      const esp = String(p.especialidad).toUpperCase().trim();
      const nom = String(t.nombre).toUpperCase().trim();
      if (esp === nom || esp.includes(nom) || nom.includes(esp)) {
        return { ok: true, via: 'especialidad_texto' };
      }
    }

    const [cert] = await this.db.query(
      `SELECT id_personal_tratamiento FROM cli_personal_tratamiento
       WHERE id_personal=? AND id_tratamiento=? AND estado_registro='ACTIVO'
         AND (fecha_vencimiento IS NULL OR fecha_vencimiento>=?)`,
      [idPersonal, t.id_tratamiento, fecha],
    );
    if (cert) return { ok: true, via: 'certificacion' };

    return { ok: false, via: '' };
  }

  // ---------------------------------------------------------------------------
  // Listados / detalle
  // ---------------------------------------------------------------------------
  async list(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const w = [`c.estado_registro='ACTIVO'`];
    const p: any[] = [];
    for (const [k, col] of [
      ['id_sede', 'c.id_sede'],
      ['id_personal', 'c.id_personal'],
      ['id_paciente', 'c.id_paciente'],
      ['estado', 'c.estado'],
      ['fecha', 'c.fecha_cita'],
    ] as const) {
      if (q[k]) {
        w.push(`${col}=?`);
        p.push(String(k).startsWith('id_') ? Number(q[k]) : q[k]);
      }
    }
    const [c] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_cita c WHERE ${w.join(' AND ')}`,
      p,
    );
    const data = await this.db.query(
      `SELECT c.*,
              CONCAT(p.nombres,' ',p.apellidos) paciente,
              t.nombre tratamiento, COALESCE(t.color_agenda, tc.color_agenda) color_agenda, t.categoria,
              tc.nombre tipo_cita, tc.codigo tipo_cita_codigo,
              CONCAT(pe.nombres,' ',pe.apellidos) personal
       FROM cli_cita c
       JOIN cli_paciente p ON p.id_paciente=c.id_paciente
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita=c.id_tipo_cita
       WHERE ${w.join(' AND ')}
       ORDER BY c.fecha_cita DESC, c.hora_inicio
       LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c.total || 0)) };
  }

  async get(id: number) {
    const [r] = await this.db.query(
      `SELECT c.*, t.nombre tratamiento, t.duracion_minutos, t.intervalo_minutos,
              tc.nombre tipo_cita, tc.codigo tipo_cita_codigo,
              tc.requiere_tratamiento, tc.requiere_sala, tc.requiere_equipo,
              CONCAT(p.nombres,' ',p.apellidos) paciente,
              CONCAT(pe.nombres,' ',pe.apellidos) personal
       FROM cli_cita c
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita=c.id_tipo_cita
       JOIN cli_paciente p ON p.id_paciente=c.id_paciente
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       WHERE c.id_cita=? AND c.estado_registro='ACTIVO'`,
      [id],
    );
    if (!r) throw new NotFoundException('Cita no encontrada');
    const participantes = await this.db.query(
      `SELECT rh.*, CONCAT(pe.nombres,' ',pe.apellidos) personal, rr.codigo rol_codigo, rr.nombre rol_nombre
       FROM cli_cita_recurso_humano rh
       JOIN cli_personal pe ON pe.id_personal=rh.id_personal
       LEFT JOIN cli_rol_recurso rr ON rr.id_rol_recurso=rh.id_rol_recurso
       WHERE rh.id_cita=? AND rh.estado_registro='ACTIVO'`,
      [id],
    );
    return { ...r, participantes };
  }

  /** Vista día: carriles + citas para timeline multi-recurso */
  async dia(q: any) {
    const fecha = String(q.fecha || '').slice(0, 10);
    const idSede = Number(q.id_sede);
    if (!fecha || !idSede) throw new BadRequestException('fecha e id_sede requeridos');

    const profesionales = await this.db.query(
      `SELECT p.id_personal AS id, CONCAT(p.nombres,' ',p.apellidos) AS nombre,
              p.especialidad AS rol, 'prof' AS kind
       FROM cli_personal p
       WHERE p.estado='ACTIVO' AND p.estado_registro='ACTIVO'
         AND (
           p.id_sede_principal=?
           OR EXISTS (
             SELECT 1 FROM cli_personal_sede ps
             WHERE ps.id_personal=p.id_personal AND ps.id_sede=? AND ps.estado_registro='ACTIVO'
           )
         )
       ORDER BY p.apellidos, p.nombres`,
      [idSede, idSede],
    );

    const salas = await this.db.query(
      `SELECT id_sala AS id, nombre, capacidad_equipo AS cap, 'room' AS kind
       FROM cli_sala WHERE id_sede=? AND estado_registro='ACTIVO' ORDER BY nombre`,
      [idSede],
    );

    const equipos = await this.db.query(
      `SELECT id_equipo AS id, nombre, COALESCE(tipo,'') AS cap, 'equipment' AS kind
       FROM cli_equipo WHERE id_sede=? AND estado_registro='ACTIVO' AND estado<>'DE_BAJA'
       ORDER BY nombre`,
      [idSede],
    );

    const citas = await this.db.query(
      `SELECT c.id_cita, c.id_paciente, c.id_personal, c.id_tratamiento, c.id_tipo_cita,
              c.id_sala, c.id_equipo,
              c.fecha_cita, c.hora_inicio, c.hora_fin, c.hora_fin_recurso, c.estado,
              CONCAT(pa.nombres,' ',pa.apellidos) paciente,
              COALESCE(t.nombre, tc.nombre, 'Cita') tratamiento,
              COALESCE(t.color_agenda, tc.color_agenda, '#5B6960') color_agenda,
              COALESCE(t.intervalo_minutos, 0) AS buffer_minutos,
              tc.nombre tipo_cita, tc.codigo tipo_cita_codigo,
              CONCAT(pe.nombres,' ',pe.apellidos) personal
       FROM cli_cita c
       JOIN cli_paciente pa ON pa.id_paciente=c.id_paciente
       JOIN cli_personal pe ON pe.id_personal=c.id_personal
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita=c.id_tipo_cita
       WHERE c.id_sede=? AND c.fecha_cita=? AND c.estado_registro='ACTIVO'
         AND c.estado NOT IN ('CANCELADA','NO_ASISTIO')
       ORDER BY c.hora_inicio`,
      [idSede, fecha],
    );

    const ids = citas.map((c: any) => Number(c.id_cita));
    let participantes: any[] = [];
    if (ids.length) {
      participantes = await this.db.query(
        `SELECT rh.id_cita, rh.id_personal, rh.id_rol_recurso, rh.es_principal,
                CONCAT(pe.nombres,' ',pe.apellidos) personal, rr.codigo rol_codigo
         FROM cli_cita_recurso_humano rh
         JOIN cli_personal pe ON pe.id_personal=rh.id_personal
         LEFT JOIN cli_rol_recurso rr ON rr.id_rol_recurso=rh.id_rol_recurso
         WHERE rh.estado_registro='ACTIVO' AND rh.id_cita IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
    }

    const byCita = new Map<number, any[]>();
    for (const p of participantes) {
      const list = byCita.get(Number(p.id_cita)) || [];
      list.push(p);
      byCita.set(Number(p.id_cita), list);
    }

    return {
      fecha,
      id_sede: idSede,
      day_start: '09:00',
      day_end: '19:00',
      lanes: [
        { group: 'Profesionales', items: profesionales },
        { group: 'Salas', items: salas },
        { group: 'Equipos', items: equipos },
      ],
      citas: citas.map((c: any) => ({
        ...c,
        participantes: byCita.get(Number(c.id_cita)) || [],
        hora_fin_recurso:
          c.hora_fin_recurso ||
          this.sumarMinutos(c.hora_fin, Number(c.buffer_minutos || 0)),
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Motor de validación (orden HTML + roles)
  // ---------------------------------------------------------------------------
  async validar(d: any, excludeId?: number) {
    const steps: Step[] = [];
    const warnings: string[] = [];
    let ok = true;

    const idSede = Number(d.id_sede);
    const idPaciente = Number(d.id_paciente);
    const idTipo = Number(d.id_tipo_cita);
    const fecha = String(d.fecha_cita).slice(0, 10);
    const horaInicio = String(d.hora_inicio).slice(0, 8);

    if (!idTipo) throw new BadRequestException('Debe indicar el tipo de cita');

    const [tipo] = await this.db.query(
      `SELECT * FROM cli_tipo_cita WHERE id_tipo_cita=? AND estado_registro='ACTIVO'`,
      [idTipo],
    );
    if (!tipo) throw new BadRequestException('Tipo de cita no válido');

    const requiereTrat = !!Number(tipo.requiere_tratamiento);
    let idTrat = d.id_tratamiento ? Number(d.id_tratamiento) : null;
    let t: any = null;

    if (requiereTrat) {
      if (!idTrat) {
        return {
          ok: false,
          valida: false,
          steps: [
            {
              pass: false,
              codigo: 'TRATAMIENTO',
              msg: `El tipo "${tipo.nombre}" requiere tratamiento.`,
            },
          ],
          warnings: [],
          assignedProf: null,
          participantes: [],
          hora_fin: null,
          hora_fin_recurso: null,
          hard: { codigo: 'TRATAMIENTO', mensaje: 'Tratamiento requerido' },
          tipo,
        };
      }
      [t] = await this.db.query(
        `SELECT * FROM cli_tratamiento WHERE id_tratamiento=? AND estado='ACTIVO' AND estado_registro='ACTIVO'`,
        [idTrat],
      );
      if (!t) throw new BadRequestException('Tratamiento no disponible');
      steps.push({
        pass: true,
        codigo: 'TIPO',
        msg: `Tipo: ${tipo.nombre} (con tratamiento).`,
      });
    } else {
      idTrat = null;
      steps.push({
        pass: true,
        codigo: 'TIPO',
        msg: `Tipo: ${tipo.nombre} — solo personal, sede, fecha y hora.`,
      });
    }

    const duracion = Number(t?.duracion_minutos || tipo.duracion_default_minutos || 30);
    const buffer = Number(t?.intervalo_minutos || 0);
    const horaFin = d.hora_fin || this.sumarMinutos(horaInicio, duracion);
    const horaFinRecurso = this.sumarMinutos(horaFin, buffer);
    const startM = this.toMin(horaInicio);
    const endProfM = this.toMin(horaFin);
    const endResM = this.toMin(horaFinRecurso);

    let idPersonal = d.id_personal ? Number(d.id_personal) : null;
    let assignedProf: number | null = idPersonal;

    /** Afinidad por especialidad (o certificación alternativa); no exige rol ESPECIALISTA */
    const requiereAfinidad = !!Number(tipo.requiere_certificacion) && !!idTrat;

    if (!idPersonal) {
      let candidatos: any[] = [];
      if (requiereAfinidad && t) {
        candidatos = await this.db.query(
          `SELECT p.id_personal
           FROM cli_personal p
           WHERE p.estado = 'ACTIVO' AND p.estado_registro = 'ACTIVO'
             AND (
               (? IS NOT NULL AND EXISTS (
                 SELECT 1 FROM cli_personal_especialidad pe
                 WHERE pe.id_personal = p.id_personal AND pe.id_especialidad = ?
                   AND pe.estado_registro = 'ACTIVO'
               ))
               OR EXISTS (
                 SELECT 1 FROM cli_personal_especialidad pe
                 JOIN cli_especialidad e ON e.id_especialidad = pe.id_especialidad
                   AND e.estado_registro = 'ACTIVO'
                 WHERE pe.id_personal = p.id_personal AND pe.estado_registro = 'ACTIVO'
                   AND UPPER(TRIM(e.nombre)) = UPPER(TRIM(?))
               )
               OR EXISTS (
                 SELECT 1 FROM cli_personal_tratamiento ct
                 WHERE ct.id_personal = p.id_personal AND ct.id_tratamiento = ?
                   AND ct.estado_registro = 'ACTIVO'
                   AND (ct.fecha_vencimiento IS NULL OR ct.fecha_vencimiento >= ?)
               )
               OR UPPER(IFNULL(p.especialidad, '')) LIKE CONCAT('%', UPPER(TRIM(?)), '%')
             )
           ORDER BY p.apellidos`,
          [
            t.id_especialidad || null,
            t.id_especialidad || null,
            t.nombre,
            idTrat,
            fecha,
            t.nombre,
          ],
        );
      } else {
        candidatos = await this.db.query(
          `SELECT p.id_personal FROM cli_personal p
           WHERE p.estado='ACTIVO' AND p.estado_registro='ACTIVO'
           ORDER BY p.apellidos`,
        );
      }
      for (const cand of candidatos) {
        if (await this.personalLibre(cand.id_personal, fecha, startM, endProfM, excludeId)) {
          assignedProf = Number(cand.id_personal);
          break;
        }
      }
      if (assignedProf) {
        steps.push({
          pass: true,
          codigo: 'PERSONAL',
          msg: requiereAfinidad
            ? 'Personal con especialidad compatible asignado automáticamente.'
            : 'Personal disponible asignado automáticamente.',
        });
      } else {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'PERSONAL',
          msg: requiereAfinidad
            ? 'No hay personal con la especialidad del tratamiento libre en ese horario.'
            : 'No hay personal libre. Indique profesional.',
        });
      }
    } else {
      let personalOk = true;
      if (requiereAfinidad && t) {
        const apto = await this.personalCubreTratamiento(idPersonal, t, fecha);
        if (!apto.ok) {
          personalOk = false;
          ok = false;
          steps.push({
            pass: false,
            codigo: 'ESPECIALIDAD',
            msg:
              'El personal no tiene la especialidad requerida para este tratamiento/intervención.' +
              ' Asígnele la especialidad en Personal (puede tener una o varias).',
          });
        } else {
          steps.push({
            pass: true,
            codigo: 'ESPECIALIDAD',
            msg:
              apto.via === 'certificacion'
                ? 'Personal certificado para el tratamiento.'
                : 'Personal con especialidad compatible con el tratamiento.',
          });
        }
      }
      if (personalOk) {
        const libre = await this.personalLibre(idPersonal, fecha, startM, endProfM, excludeId);
        if (!libre) {
          ok = false;
          steps.push({
            pass: false,
            codigo: 'PROF_BUSY',
            msg: 'El personal ya tiene otra cita en ese intervalo.',
          });
        } else {
          steps.push({
            pass: true,
            codigo: 'PERSONAL',
            msg: 'Personal disponible en el horario.',
          });
        }
      }
    }

    // Roles adicionales (anestesista, etc.). No se exige rol genérico ESPECIALISTA/MEDICO
    // para cubrir la especialidad del tratamiento: eso va por cli_personal_especialidad.
    const rolesReq = await this.db.query(
      `SELECT id_rol_recurso, codigo, nombre, MAX(obligatorio) obligatorio FROM (
         SELECT tr.id_rol_recurso, rr.codigo, rr.nombre, tr.obligatorio
         FROM cli_tipo_cita_rol_requerido tr
         JOIN cli_rol_recurso rr ON rr.id_rol_recurso=tr.id_rol_recurso
         WHERE tr.id_tipo_cita=? AND tr.estado_registro='ACTIVO' AND rr.estado_registro='ACTIVO'
           AND rr.codigo NOT IN ('PRINCIPAL', 'MEDICO')
         UNION ALL
         SELECT tr.id_rol_recurso, rr.codigo, rr.nombre, tr.obligatorio
         FROM cli_tratamiento_rol_requerido tr
         JOIN cli_rol_recurso rr ON rr.id_rol_recurso=tr.id_rol_recurso
         WHERE ? IS NOT NULL AND tr.id_tratamiento=? AND tr.estado_registro='ACTIVO' AND rr.estado_registro='ACTIVO'
           AND rr.codigo NOT IN ('PRINCIPAL', 'MEDICO')
       ) x GROUP BY id_rol_recurso, codigo, nombre`,
      [idTipo, idTrat, idTrat],
    );

    const participantesIn: ParticipanteCitaDto[] = Array.isArray(d.participantes)
      ? d.participantes
      : [];
    const participantesResolved: ParticipanteCitaDto[] = [];
    if (assignedProf) {
      participantesResolved.push({
        id_personal: assignedProf,
        id_rol_recurso: null,
        es_principal: true,
      });
    }

    for (const rol of rolesReq) {
      const propuesto = participantesIn.find(
        (x) => Number(x.id_rol_recurso) === Number(rol.id_rol_recurso),
      );
      let idPersRol = propuesto ? Number(propuesto.id_personal) : null;
      if (!idPersRol) {
        const cands = await this.db.query(
          `SELECT p.id_personal FROM cli_personal p
           JOIN cli_personal_rol pr ON pr.id_personal=p.id_personal AND pr.id_rol_recurso=?
             AND pr.estado_registro='ACTIVO' AND (pr.vigente_hasta IS NULL OR pr.vigente_hasta>=?)
           WHERE p.estado='ACTIVO' AND p.estado_registro='ACTIVO'
             AND (? IS NULL OR p.id_personal<>?)
           ORDER BY p.apellidos`,
          [rol.id_rol_recurso, fecha, assignedProf, assignedProf],
        );
        for (const c of cands) {
          if (await this.personalLibre(c.id_personal, fecha, startM, endProfM, excludeId)) {
            idPersRol = Number(c.id_personal);
            break;
          }
        }
      }
      if (!idPersRol) {
        if (rol.obligatorio) {
          ok = false;
          steps.push({
            pass: false,
            codigo: 'ROL',
            msg: `No hay personal con rol ${rol.nombre} libre.`,
          });
        } else {
          steps.push({
            pass: true,
            soft: true,
            codigo: 'ROL',
            msg: `Rol opcional ${rol.nombre} no asignado.`,
          });
        }
        continue;
      }
      const [tieneRol] = await this.db.query(
        `SELECT id_personal_rol FROM cli_personal_rol
         WHERE id_personal=? AND id_rol_recurso=? AND estado_registro='ACTIVO'
           AND (vigente_hasta IS NULL OR vigente_hasta>=?)`,
        [idPersRol, rol.id_rol_recurso, fecha],
      );
      if (!tieneRol) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'ROL',
          msg: `El personal no tiene el rol ${rol.nombre}.`,
        });
        continue;
      }
      if (!(await this.personalLibre(idPersRol, fecha, startM, endProfM, excludeId))) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'ROL',
          msg: `Personal con rol ${rol.nombre} ocupado.`,
        });
        continue;
      }
      participantesResolved.push({
        id_personal: idPersRol,
        id_rol_recurso: Number(rol.id_rol_recurso),
        es_principal: false,
      });
      steps.push({ pass: true, codigo: 'ROL', msg: `Rol ${rol.nombre} cubierto.` });
    }

    const needSala = !!Number(tipo.requiere_sala) || !!(t && Number(t.requiere_sala));
    let idSala = d.id_sala != null && d.id_sala !== '' ? Number(d.id_sala) : null;
    if (needSala) {
      if (!idSala) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'SALA',
          msg: 'Este tipo/tratamiento requiere sala.',
        });
      } else {
        const [s] = await this.db.query(
          `SELECT id_sala, nombre FROM cli_sala
           WHERE id_sala=? AND id_sede=? AND estado='DISPONIBLE' AND estado_registro='ACTIVO'`,
          [idSala, idSede],
        );
        if (!s) {
          ok = false;
          steps.push({ pass: false, codigo: 'SALA', msg: 'Sala no disponible en la sede.' });
        } else if (!(await this.salaLibre(idSala, fecha, startM, endResM, excludeId))) {
          ok = false;
          steps.push({
            pass: false,
            codigo: 'SALA',
            msg: `${s.nombre} ocupada (incluye buffer).`,
          });
        } else {
          steps.push({ pass: true, codigo: 'SALA', msg: `${s.nombre} disponible.` });
        }
      }
    } else if (idSala) {
      // Sala opcional informada: se valida y se guarda (aparece ocupada en el timeline)
      const [s] = await this.db.query(
        `SELECT id_sala, nombre FROM cli_sala
         WHERE id_sala=? AND id_sede=? AND estado='DISPONIBLE' AND estado_registro='ACTIVO'`,
        [idSala, idSede],
      );
      if (!s) {
        ok = false;
        steps.push({ pass: false, codigo: 'SALA', msg: 'Sala no disponible en la sede.' });
      } else if (!(await this.salaLibre(idSala, fecha, startM, endResM, excludeId))) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'SALA',
          msg: `${s.nombre} ocupada (incluye buffer).`,
        });
      } else {
        steps.push({
          pass: true,
          soft: true,
          codigo: 'SALA',
          msg: `${s.nombre} reservada (opcional).`,
        });
      }
    } else {
      steps.push({
        pass: true,
        soft: true,
        codigo: 'SALA',
        msg: 'Sala no requerida para este tipo de cita.',
      });
    }

    const needEquipo = !!Number(tipo.requiere_equipo) || !!(t && Number(t.requiere_equipo));
    let idEquipo = d.id_equipo != null && d.id_equipo !== '' ? Number(d.id_equipo) : null;
    if (needEquipo) {
      if (!idEquipo) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'EQUIPO',
          msg: 'Este tipo/tratamiento requiere equipo.',
        });
      } else {
        const [e] = await this.db.query(
          `SELECT id_equipo, nombre FROM cli_equipo
           WHERE id_equipo=? AND id_sede=? AND estado='OPERATIVO' AND estado_registro='ACTIVO'`,
          [idEquipo, idSede],
        );
        if (!e) {
          ok = false;
          steps.push({ pass: false, codigo: 'EQUIPO', msg: 'Equipo no disponible.' });
        } else if (!(await this.equipoLibre(idEquipo, fecha, startM, endResM, excludeId))) {
          ok = false;
          steps.push({
            pass: false,
            codigo: 'EQUIPO',
            msg: `${e.nombre} ocupado (incluye buffer).`,
          });
        } else {
          steps.push({ pass: true, codigo: 'EQUIPO', msg: `${e.nombre} disponible.` });
        }
      }
    } else if (idEquipo) {
      // Equipo opcional informado: se valida y se guarda (aparece ocupado en el timeline)
      const [e] = await this.db.query(
        `SELECT id_equipo, nombre FROM cli_equipo
         WHERE id_equipo=? AND id_sede=? AND estado='OPERATIVO' AND estado_registro='ACTIVO'`,
        [idEquipo, idSede],
      );
      if (!e) {
        ok = false;
        steps.push({ pass: false, codigo: 'EQUIPO', msg: 'Equipo no disponible.' });
      } else if (!(await this.equipoLibre(idEquipo, fecha, startM, endResM, excludeId))) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'EQUIPO',
          msg: `${e.nombre} ocupado (incluye buffer).`,
        });
      } else {
        steps.push({
          pass: true,
          soft: true,
          codigo: 'EQUIPO',
          msg: `${e.nombre} reservado (opcional).`,
        });
      }
    } else {
      steps.push({
        pass: true,
        soft: true,
        codigo: 'EQUIPO',
        msg: 'Equipo no requerido para este tipo de cita.',
      });
    }

    if (idTrat && t) {
      const minDias = Number(t.intervalo_minimo_dias || 0);
      if (minDias > 0) {
        const [last] = await this.db.query(
          `SELECT fecha_cita FROM cli_cita
           WHERE id_paciente=? AND id_tratamiento=? AND estado='FINALIZADA'
             AND estado_registro='ACTIVO' AND (? IS NULL OR id_cita<>?)
           ORDER BY fecha_cita DESC LIMIT 1`,
          [idPaciente, idTrat, excludeId || null, excludeId || 0],
        );
        if (last) {
          const [gapRow] = await this.db.query(`SELECT DATEDIFF(?, ?) AS gap`, [
            fecha,
            last.fecha_cita,
          ]);
          const gap = Number(gapRow?.gap || 0);
          if (gap < minDias) {
            ok = false;
            steps.push({
              pass: false,
              codigo: 'INTERVALO_DIAS',
              msg: `Intervalo mínimo no cumplido (${gap}/${minDias} días).`,
            });
          } else {
            steps.push({
              pass: true,
              codigo: 'INTERVALO_DIAS',
              msg: `Intervalo mínimo cumplido (${gap} días).`,
            });
          }
        }
      }

      const cruzadas = await this.db.query(
        `SELECT dias_minimos,
                CASE WHEN id_tratamiento=? THEN id_tratamiento_conflicto ELSE id_tratamiento END AS id_conflicto
         FROM cli_contraindicacion_cruzada
         WHERE estado_registro='ACTIVO' AND (id_tratamiento=? OR id_tratamiento_conflicto=?)`,
        [idTrat, idTrat, idTrat],
      );
      for (const cx of cruzadas) {
        const idConflicto = Number(cx.id_conflicto);
        if (!idConflicto || idConflicto === idTrat) continue;
        const [lastOther] = await this.db.query(
          `SELECT c.fecha_cita, t.nombre FROM cli_cita c
           JOIN cli_tratamiento t ON t.id_tratamiento=c.id_tratamiento
           WHERE c.id_paciente=? AND c.id_tratamiento=? AND c.estado='FINALIZADA'
             AND c.estado_registro='ACTIVO'
           ORDER BY c.fecha_cita DESC LIMIT 1`,
          [idPaciente, idConflicto],
        );
        if (lastOther) {
          const [gapRow] = await this.db.query(`SELECT DATEDIFF(?, ?) AS gap`, [
            fecha,
            lastOther.fecha_cita,
          ]);
          const gap = Number(gapRow?.gap || 0);
          if (gap < Number(cx.dias_minimos)) {
            ok = false;
            steps.push({
              pass: false,
              codigo: 'CONTRA_CRUZADA',
              msg: `Contraindicación: tuvo ${lastOther.nombre} hace ${gap} días.`,
            });
          }
        }
      }

      const contraAbs = await this.db.query(
        `SELECT descripcion FROM cli_contraindicacion
         WHERE id_tratamiento=? AND severidad='ABSOLUTA' AND estado_registro='ACTIVO'`,
        [idTrat],
      );
      if (contraAbs.length && !d.aceptar_contraindicaciones) {
        ok = false;
        steps.push({
          pass: false,
          codigo: 'CONTRAINDICACION',
          msg: `Contraindicaciones absolutas: ${contraAbs.map((x: any) => x.descripcion).join(', ')}.`,
        });
      }
    }

    if (d.id_paciente_paquete && idTrat) {
      const [pq] = await this.db.query(
        `SELECT sesiones_total, sesiones_usadas, estado FROM cli_paciente_paquete
         WHERE id_paciente_paquete=? AND id_paciente=? AND estado_registro='ACTIVO'`,
        [Number(d.id_paciente_paquete), idPaciente],
      );
      if (!pq || pq.estado !== 'VIGENTE' || Number(pq.sesiones_usadas) >= Number(pq.sesiones_total)) {
        steps.push({
          pass: false,
          soft: true,
          codigo: 'PAQUETE',
          msg: 'Paquete sin sesiones disponibles.',
        });
        warnings.push('Paquete sin sesiones disponibles');
      } else {
        steps.push({
          pass: true,
          codigo: 'PAQUETE',
          msg: `Sesión ${Number(pq.sesiones_usadas) + 1} de ${pq.sesiones_total}.`,
        });
      }
    }

    const alergias = await this.db.query(
      `SELECT sustancia FROM cli_paciente_alergia_ram
       WHERE id_paciente=? AND activa=1 AND estado_registro='ACTIVO'`,
      [idPaciente],
    );
    if (alergias.length) {
      const msg = `Alergias activas: ${alergias.map((x: any) => x.sustancia).join(', ')}`;
      warnings.push(msg);
      steps.push({ pass: true, soft: true, codigo: 'ALERGIAS', msg });
    }

    return {
      ok,
      valida: ok,
      steps,
      warnings,
      assignedProf,
      participantes: participantesResolved,
      hora_fin: horaFin,
      hora_fin_recurso: horaFinRecurso,
      id_tratamiento: idTrat,
      id_sala: idSala,
      id_equipo: idEquipo,
      id_tipo_cita: idTipo,
      tipo,
      hard: ok ? null : steps.find((s) => !s.pass && !s.soft) || null,
    };
  }

  private async personalLibre(
    idPersonal: number,
    fecha: string,
    startM: number,
    endM: number,
    excludeId?: number,
  ) {
    const citas = await this.db.query(
      `SELECT hora_inicio, hora_fin FROM cli_cita
       WHERE fecha_cita=? AND estado_registro='ACTIVO'
         AND estado NOT IN ('CANCELADA','NO_ASISTIO','REPROGRAMADA')
         AND id_personal=? AND (? IS NULL OR id_cita<>?)`,
      [fecha, idPersonal, excludeId || null, excludeId || 0],
    );
    for (const c of citas) {
      if (this.overlaps(startM, endM, this.toMin(c.hora_inicio), this.toMin(c.hora_fin))) {
        return false;
      }
    }
    // También en participantes
    const part = await this.db.query(
      `SELECT rh.hora_inicio, rh.hora_fin FROM cli_cita_recurso_humano rh
       JOIN cli_cita c ON c.id_cita=rh.id_cita
       WHERE rh.id_personal=? AND rh.estado_registro='ACTIVO'
         AND c.fecha_cita=? AND c.estado_registro='ACTIVO'
         AND c.estado NOT IN ('CANCELADA','NO_ASISTIO','REPROGRAMADA')
         AND (? IS NULL OR c.id_cita<>?)`,
      [idPersonal, fecha, excludeId || null, excludeId || 0],
    );
    for (const c of part) {
      if (this.overlaps(startM, endM, this.toMin(c.hora_inicio), this.toMin(c.hora_fin))) {
        return false;
      }
    }
    return true;
  }

  private async salaLibre(
    idSala: number,
    fecha: string,
    startM: number,
    endResM: number,
    excludeId?: number,
  ) {
    const citas = await this.db.query(
      `SELECT hora_inicio, COALESCE(hora_fin_recurso, hora_fin) AS fin FROM cli_cita
       WHERE fecha_cita=? AND id_sala=? AND estado_registro='ACTIVO'
         AND estado NOT IN ('CANCELADA','NO_ASISTIO','REPROGRAMADA')
         AND (? IS NULL OR id_cita<>?)`,
      [fecha, idSala, excludeId || null, excludeId || 0],
    );
    return !citas.some((c: any) =>
      this.overlaps(startM, endResM, this.toMin(c.hora_inicio), this.toMin(c.fin)),
    );
  }

  private async equipoLibre(
    idEquipo: number,
    fecha: string,
    startM: number,
    endResM: number,
    excludeId?: number,
  ) {
    const citas = await this.db.query(
      `SELECT hora_inicio, COALESCE(hora_fin_recurso, hora_fin) AS fin FROM cli_cita
       WHERE fecha_cita=? AND id_equipo=? AND estado_registro='ACTIVO'
         AND estado NOT IN ('CANCELADA','NO_ASISTIO','REPROGRAMADA')
         AND (? IS NULL OR id_cita<>?)`,
      [fecha, idEquipo, excludeId || null, excludeId || 0],
    );
    return !citas.some((c: any) =>
      this.overlaps(startM, endResM, this.toMin(c.hora_inicio), this.toMin(c.fin)),
    );
  }

  /** Sugiere próximo hueco en incrementos de 15 min el mismo día */
  async sugerirHorario(d: CreateCitaDto) {
    const dayStart = 9 * 60;
    const dayEnd = 19 * 60;
    let dur = 30;
    if (d.id_tratamiento) {
      const [t] = await this.db.query(
        `SELECT duracion_minutos FROM cli_tratamiento WHERE id_tratamiento=? AND estado_registro='ACTIVO'`,
        [Number(d.id_tratamiento)],
      );
      dur = Number(t?.duracion_minutos || 30);
    } else if (d.id_tipo_cita) {
      const [tipo] = await this.db.query(
        `SELECT duracion_default_minutos FROM cli_tipo_cita WHERE id_tipo_cita=? AND estado_registro='ACTIVO'`,
        [Number(d.id_tipo_cita)],
      );
      dur = Number(tipo?.duracion_default_minutos || 30);
    }
    for (let m = dayStart; m + dur <= dayEnd; m += 15) {
      const trial = await this.validar({ ...d, hora_inicio: this.fromMin(m) }, undefined);
      if (trial.ok) {
        return { encontrado: true, hora_inicio: this.fromMin(m).slice(0, 5), validacion: trial };
      }
    }
    return { encontrado: false, hora_inicio: null, validacion: null };
  }

  // ---------------------------------------------------------------------------
  // CRUD citas
  // ---------------------------------------------------------------------------
  private throwValidacion(v: any): never {
    const fail = (v.steps || []).find((s: any) => !s.pass);
    const mensaje =
      v.hard?.mensaje || fail?.msg || 'La cita no cumple las reglas de agenda';
    throw new BadRequestException({ ...v, data: v, mensaje });
  }

  async create(d: CreateCitaDto, userId: number) {
    const v = await this.validar(d);
    if (!v.ok) this.throwValidacion(v);

    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const r = await qr.query(
        `INSERT INTO cli_cita
          (id_sede,id_tipo_cita,id_paciente,id_personal,id_tratamiento,id_sala,id_equipo,id_paciente_paquete,
           fecha_cita,hora_inicio,hora_fin,hora_fin_recurso,estado,notas,precio_acordado,id_usuario_crea)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'PENDIENTE',?,?,?)`,
        [
          d.id_sede,
          d.id_tipo_cita,
          d.id_paciente,
          v.assignedProf,
          v.id_tratamiento,
          v.id_sala,
          v.id_equipo,
          d.id_paciente_paquete || null,
          d.fecha_cita,
          d.hora_inicio,
          v.hora_fin,
          v.hora_fin_recurso,
          d.notas || null,
          d.precio_acordado ?? null,
          userId,
        ],
      );
      const id = Number(r.insertId);

      for (const p of v.participantes || []) {
        await qr.query(
          `INSERT INTO cli_cita_recurso_humano
            (id_cita,id_personal,id_rol_recurso,es_principal,hora_inicio,hora_fin,id_usuario_crea)
           VALUES (?,?,?,?,?,?,?)`,
          [
            id,
            p.id_personal,
            p.id_rol_recurso || null,
            p.es_principal ? 1 : 0,
            d.hora_inicio,
            v.hora_fin,
            userId,
          ],
        );
      }

      await qr.commitTransaction();
      await this.auditoria.registrar('cli_cita', id, 'CREAR', userId, null, d);
      return { id, message: 'Cita creada', warnings: v.warnings, steps: v.steps };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async update(id: number, d: UpdateCitaDto, userId: number) {
    const old = await this.get(id);
    if (['FINALIZADA', 'CANCELADA'].includes(old.estado)) {
      throw new BadRequestException('La cita ya está cerrada');
    }
    const merged = { ...old, ...d };
    const v = await this.validar(merged, id);
    if (!v.ok) this.throwValidacion(v);

    await this.db.query(
      `UPDATE cli_cita SET
        id_sede=?, id_tipo_cita=?, id_paciente=?, id_personal=?, id_tratamiento=?,
        id_sala=?, id_equipo=?, id_paciente_paquete=?,
        fecha_cita=?, hora_inicio=?, hora_fin=?, hora_fin_recurso=?,
        notas=?, precio_acordado=?, id_usuario_mod=?
       WHERE id_cita=? AND estado_registro='ACTIVO'`,
      [
        merged.id_sede,
        merged.id_tipo_cita,
        merged.id_paciente,
        v.assignedProf,
        v.id_tratamiento,
        v.id_sala,
        v.id_equipo,
        merged.id_paciente_paquete || null,
        merged.fecha_cita,
        merged.hora_inicio,
        v.hora_fin,
        v.hora_fin_recurso,
        merged.notas || null,
        merged.precio_acordado ?? null,
        userId,
        id,
      ],
    );

    await this.db.query(
      `UPDATE cli_cita_recurso_humano SET estado_registro='ELIMINADO', id_usuario_mod=?
       WHERE id_cita=? AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    for (const p of v.participantes || []) {
      await this.db.query(
        `INSERT INTO cli_cita_recurso_humano
          (id_cita,id_personal,id_rol_recurso,es_principal,hora_inicio,hora_fin,id_usuario_crea)
         VALUES (?,?,?,?,?,?,?)`,
        [
          id,
          p.id_personal,
          p.id_rol_recurso || null,
          p.es_principal ? 1 : 0,
          merged.hora_inicio,
          v.hora_fin,
          userId,
        ],
      );
    }

    return { message: 'Cita actualizada', warnings: v.warnings, steps: v.steps };
  }

  async cancelar(id: number, d: CancelarCitaDto, userId: number) {
    const old = await this.get(id);
    if (old.estado === 'FINALIZADA') {
      throw new BadRequestException('No se puede cancelar una cita finalizada');
    }

    const [diff] = await this.db.query(
      `SELECT TIMESTAMPDIFF(HOUR, NOW(), CONCAT(fecha_cita,' ',hora_inicio)) AS horas
       FROM cli_cita WHERE id_cita=?`,
      [id],
    );
    const penalidad = Number(diff?.horas) < 24 ? 1 : 0;

    await this.db.query(
      `UPDATE cli_cita SET estado='CANCELADA', motivo_cancelacion=?, penalidad_aplicada=?, id_usuario_mod=?
       WHERE id_cita=?`,
      [d.motivo, penalidad, userId, id],
    );

    // Reofertar lista de espera compatible
    const wait = await this.db.query(
      `SELECT * FROM cli_lista_espera
       WHERE id_sede=? AND id_tratamiento=? AND estado='PENDIENTE' AND estado_registro='ACTIVO'
       ORDER BY prioridad ASC, id_lista_espera ASC LIMIT 5`,
      [old.id_sede, old.id_tratamiento],
    );

    let reasignado: any = null;
    for (const w of wait) {
      const trial = await this.validar({
        id_sede: old.id_sede,
        id_tipo_cita: old.id_tipo_cita,
        id_paciente: w.id_paciente,
        id_tratamiento: old.id_tratamiento,
        id_personal: w.id_personal_preferido || null,
        id_sala: old.id_sala,
        id_equipo: old.id_equipo,
        fecha_cita: old.fecha_cita,
        hora_inicio: old.hora_inicio,
      });
      if (trial.ok) {
        const created = await this.create(
          {
            id_sede: old.id_sede,
            id_tipo_cita: Number(old.id_tipo_cita),
            id_paciente: Number(w.id_paciente),
            id_tratamiento: old.id_tratamiento ? Number(old.id_tratamiento) : null,
            id_personal: trial.assignedProf,
            id_sala: old.id_sala,
            id_equipo: old.id_equipo,
            fecha_cita: String(old.fecha_cita).slice(0, 10),
            hora_inicio: String(old.hora_inicio).slice(0, 8),
            participantes: trial.participantes,
          } as CreateCitaDto,
          userId,
        );
        await this.db.query(
          `UPDATE cli_lista_espera SET estado='AGENDADO', id_usuario_mod=? WHERE id_lista_espera=?`,
          [userId, w.id_lista_espera],
        );
        reasignado = { id_lista_espera: w.id_lista_espera, id_cita: created.id };
        break;
      }
    }

    return {
      message: 'Cita cancelada',
      penalidad_aplicada: !!penalidad,
      reasignado,
    };
  }

  async cambiarEstado(id: number, estado: string, userId: number) {
    const c = await this.get(id);
    if (estado === 'FINALIZADA') return this.completar(id, userId);
    if (['CANCELADA', 'FINALIZADA'].includes(c.estado)) {
      throw new BadRequestException('La cita ya está cerrada');
    }
    const transitions: Record<string, string[]> = {
      PENDIENTE: ['CONFIRMADA', 'EN_ATENCION'],
      CONFIRMADA: ['EN_ATENCION', 'PENDIENTE'],
      EN_ATENCION: [],
    };
    const allowed = transitions[c.estado] || [];
    if (!allowed.includes(estado)) {
      throw new BadRequestException(`No se puede pasar de ${c.estado} a ${estado}`);
    }
    await this.db.query(`UPDATE cli_cita SET estado=?, id_usuario_mod=? WHERE id_cita=?`, [
      estado,
      userId,
      id,
    ]);
    return { message: `Estado actualizado a ${estado}`, estado };
  }

  async completar(id: number, userId: number) {
    const c = await this.get(id);
    if (c.estado === 'FINALIZADA') throw new BadRequestException('Cita ya finalizada');
    if (c.estado === 'CANCELADA') throw new BadRequestException('Cita cancelada');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`UPDATE cli_cita SET estado='FINALIZADA', id_usuario_mod=? WHERE id_cita=?`, [
        userId,
        id,
      ]);
      if (c.id_paciente_paquete) {
        await qr.query(
          `UPDATE cli_paciente_paquete
           SET sesiones_usadas=LEAST(sesiones_total,sesiones_usadas+1),
               estado=IF(sesiones_usadas+1>=sesiones_total,'AGOTADO','VIGENTE'),
               id_usuario_mod=?
           WHERE id_paciente_paquete=? AND estado_registro='ACTIVO'`,
          [userId, c.id_paciente_paquete],
        );
      }
      await qr.commitTransaction();
      if (c.id_tratamiento) {
        this.events.emit('cita.completada', {
          id_cita: id,
          id_tratamiento: Number(c.id_tratamiento),
          id_sede: Number(c.id_sede),
          userId: Number(userId),
        });
      }
      return { message: 'Cita finalizada', estado: 'FINALIZADA' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async remove(id: number, userId: number) {
    await this.get(id);
    await this.db.query(
      `UPDATE cli_cita SET estado_registro='ELIMINADO', id_usuario_mod=? WHERE id_cita=?`,
      [userId, id],
    );
    return { message: 'Cita eliminada' };
  }

  disponibilidad(q: any) {
    if (!q.fecha || !q.id_sede) {
      return Promise.reject(new BadRequestException('fecha e id_sede requeridos'));
    }
    return this.db.query(
      `SELECT p.id_personal, CONCAT(p.nombres,' ',p.apellidos) personal, h.hora_inicio, h.hora_fin
       FROM cli_personal p
       JOIN cli_horario_trabajo h ON h.id_personal=p.id_personal AND h.id_sede=?
         AND h.dia_semana=DAYOFWEEK(?)-1 AND h.estado_registro='ACTIVO'
       WHERE p.estado='ACTIVO' AND p.estado_registro='ACTIVO'`,
      [Number(q.id_sede), q.fecha],
    );
  }

  async listaEspera(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const w = [`le.estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (q.id_sede) {
      w.push('le.id_sede=?');
      p.push(Number(q.id_sede));
    }
    if (q.estado) {
      w.push('le.estado=?');
      p.push(q.estado);
    }
    const [c] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_lista_espera le WHERE ${w.join(' AND ')}`,
      p,
    );
    const data = await this.db.query(
      `SELECT le.*, CONCAT(pa.nombres,' ',pa.apellidos) paciente, t.nombre tratamiento
       FROM cli_lista_espera le
       JOIN cli_paciente pa ON pa.id_paciente=le.id_paciente
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento=le.id_tratamiento
       WHERE ${w.join(' AND ')}
       ORDER BY le.prioridad, le.fecha_preferida
       LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c.total || 0)) };
  }

  async addEspera(d: ListaEsperaDto, userId: number) {
    const r = await this.db.query(
      `INSERT INTO cli_lista_espera
        (id_sede,id_paciente,id_tratamiento,id_personal_preferido,fecha_preferida,turno_preferido,prioridad,observaciones,id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        d.id_sede,
        d.id_paciente,
        d.id_tratamiento || null,
        d.id_personal_preferido || null,
        d.fecha_preferida || null,
        d.turno_preferido || 'CUALQUIERA',
        d.prioridad || 5,
        d.observaciones || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Paciente agregado a lista de espera' };
  }

  async paquetes(idPaciente: number) {
    return this.db.query(
      `SELECT pp.*, p.nombre paquete FROM cli_paciente_paquete pp
       JOIN cli_paquete p ON p.id_paquete=pp.id_paquete
       WHERE pp.id_paciente=? AND pp.estado_registro='ACTIVO'`,
      [idPaciente],
    );
  }

  async addPaquete(d: PacientePaqueteDto, userId: number) {
    const r = await this.db.query(
      `INSERT INTO cli_paciente_paquete
        (id_paciente,id_paquete,id_sede,fecha_compra,fecha_vencimiento,sesiones_total,precio_pagado,observaciones,id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        d.id_paciente,
        d.id_paquete,
        d.id_sede || null,
        d.fecha_compra,
        d.fecha_vencimiento || null,
        d.sesiones_total,
        d.precio_pagado || 0,
        d.observaciones || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Paquete asignado' };
  }

  // Roles catálogo / asignación
  listTiposCita() {
    return this.db.query(
      `SELECT id_tipo_cita, codigo, nombre, descripcion, duracion_default_minutos,
              requiere_tratamiento, requiere_sala, requiere_equipo, requiere_certificacion, color_agenda
       FROM cli_tipo_cita WHERE estado_registro='ACTIVO' ORDER BY nombre`,
    );
  }

  listRoles() {
    return this.db.query(
      `SELECT id_rol_recurso, codigo, nombre, descripcion FROM cli_rol_recurso
       WHERE estado_registro='ACTIVO' ORDER BY nombre`,
    );
  }

  async rolesDePersonal(idPersonal: number) {
    return this.db.query(
      `SELECT pr.id_personal_rol, pr.id_rol_recurso, rr.codigo, rr.nombre,
              pr.vigente_desde, pr.vigente_hasta
       FROM cli_personal_rol pr
       JOIN cli_rol_recurso rr ON rr.id_rol_recurso=pr.id_rol_recurso
       WHERE pr.id_personal=? AND pr.estado_registro='ACTIVO'`,
      [idPersonal],
    );
  }

  async asignarRol(idPersonal: number, idRol: number, userId: number) {
    const [exists] = await this.db.query(
      `SELECT id_personal_rol FROM cli_personal_rol
       WHERE id_personal=? AND id_rol_recurso=? AND estado_registro='ACTIVO'`,
      [idPersonal, idRol],
    );
    if (exists) return { message: 'Rol ya asignado', id: exists.id_personal_rol };
    const r = await this.db.query(
      `INSERT INTO cli_personal_rol (id_personal, id_rol_recurso, id_usuario_crea) VALUES (?,?,?)`,
      [idPersonal, idRol, userId],
    );
    return { id: Number(r.insertId), message: 'Rol asignado' };
  }

  async quitarRol(idPersonalRol: number, userId: number) {
    await this.db.query(
      `UPDATE cli_personal_rol SET estado_registro='ELIMINADO', id_usuario_mod=? WHERE id_personal_rol=?`,
      [userId, idPersonalRol],
    );
    return { message: 'Rol removido' };
  }
}
