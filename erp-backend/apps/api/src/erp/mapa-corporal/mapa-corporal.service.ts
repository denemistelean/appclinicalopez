import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { resolverDocumentosRoot } from '../../core/archivos/documentos-root';
import { AuditoriaService } from '../../common/auditoria/auditoria.service';
import { UnidadScopeService } from '@app/auth';
import { MapaMarcadorDto, UpdateMapaMarcadorDto } from './mapa-corporal.dto';

type CapturaRef = { id_cita?: number | null; id_consulta?: number | null };

@Injectable()
export class MapaCorporalService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
    private readonly unidad: UnidadScopeService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / Math.max(limit, 1))) };
  }

  private rootDocs(): string {
    return resolverDocumentosRoot({
      configurada: this.config.get<string>('DOCUMENTOS_ROOT'),
      respaldo: join('D:', 'xampp', 'htdocs', 'appClinicaLopez', 'storage', 'ClinicaDigital'),
    });
  }

  private padPac(id: number) {
    return String(id).padStart(9, '0');
  }

  private capturaDir(idPaciente: number, idUnidad: number, idUnidadRegistro: number | null) {
    const base = join(this.rootDocs(), 'PACIENTES', this.padPac(idPaciente), 'MAPA');
    if (idUnidadRegistro != null && idUnidad === idUnidadRegistro) return base;
    return join(base, `unidad-${idUnidad}`);
  }

  private capturaPath(
    idPaciente: number,
    vista: 'frontal' | 'posterior',
    idUnidad: number,
    idUnidadRegistro: number | null,
  ) {
    return join(this.capturaDir(idPaciente, idUnidad, idUnidadRegistro), `vista_${vista}.png`);
  }

  async estadoCapturas(idPaciente: number, ref?: CapturaRef) {
    const acceso = await this.accesoCaptura(idPaciente, ref);
    const frontal = existsSync(this.capturaPath(idPaciente, 'frontal', acceso.idUnidad, acceso.idUnidadRegistro));
    const posterior = existsSync(this.capturaPath(idPaciente, 'posterior', acceso.idUnidad, acceso.idUnidadRegistro));
    return { frontal, posterior, actualizado: frontal || posterior };
  }

  async getCaptura(idPaciente: number, vista: 'frontal' | 'posterior', ref?: CapturaRef) {
    const acceso = await this.accesoCaptura(idPaciente, ref);
    const path = this.capturaPath(idPaciente, vista, acceso.idUnidad, acceso.idUnidadRegistro);
    if (!existsSync(path)) throw new NotFoundException(`Captura ${vista} no encontrada`);
    return new StreamableFile(createReadStream(path), {
      type: 'image/png',
      disposition: `inline; filename="mapa_${vista}_${idPaciente}.png"`,
    });
  }

  /** Guarda PNG base64 (data URL o puro) de ambas vistas. */
  async guardarCapturas(
    idPaciente: number,
    body: { frontal?: string; posterior?: string; id_cita?: number | null; id_consulta?: number | null },
    userId: number,
  ) {
    const acceso = await this.accesoCaptura(idPaciente, body);
    if (!body?.frontal && !body?.posterior) {
      throw new BadRequestException('Envíe al menos una captura (frontal o posterior)');
    }
    const dir = this.capturaDir(idPaciente, acceso.idUnidad, acceso.idUnidadRegistro);
    mkdirSync(dir, { recursive: true });

    const saved: string[] = [];
    for (const vista of ['frontal', 'posterior'] as const) {
      const raw = body[vista];
      if (!raw) continue;
      const buf = this.decodeDataUrlPng(raw);
      writeFileSync(this.capturaPath(idPaciente, vista, acceso.idUnidad, acceso.idUnidadRegistro), buf);
      saved.push(vista);
    }

    await this.auditoria.registrar('cli_mapa_captura', idPaciente, 'ACTUALIZAR', userId, null, {
      vistas: saved,
    });
    return { message: 'Capturas guardadas', vistas: saved };
  }

  async eliminarCapturas(idPaciente: number, userId: number, ref?: CapturaRef) {
    const acceso = await this.accesoCaptura(idPaciente, ref);
    for (const vista of ['frontal', 'posterior'] as const) {
      const p = this.capturaPath(idPaciente, vista, acceso.idUnidad, acceso.idUnidadRegistro);
      if (existsSync(p)) unlinkSync(p);
    }
    await this.auditoria.registrar('cli_mapa_captura', idPaciente, 'ELIMINAR', userId, null, null);
    return { message: 'Capturas eliminadas' };
  }

  private decodeDataUrlPng(raw: string): Buffer {
    const s = String(raw || '').trim();
    const m = /^data:image\/png;base64,(.+)$/i.exec(s);
    const b64 = m ? m[1] : s.replace(/\s/g, '');
    if (!b64 || b64.length < 32) throw new BadRequestException('Imagen PNG inválida');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 12_000_000) throw new BadRequestException('Imagen demasiado grande');
    return buf;
  }

  /**
   * La captura de la empresa de registro sigue en MAPA/.
   * Si el paciente fue registrado en la otra empresa pero tiene cita o consulta
   * en la empresa activa, la captura se autoriza y se guarda aparte.
   */
  private async accesoCaptura(idPaciente: number, ref?: CapturaRef) {
    const [pac] = await this.db.query(
      `SELECT id_paciente, id_unidad_registro
       FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [idPaciente],
    );
    if (!pac) throw new NotFoundException('Paciente no encontrado');
    const idCita = Number(ref?.id_cita) || 0;
    const idConsulta = Number(ref?.id_consulta) || 0;
    if (idCita) {
      const [cita] = await this.db.query(
        `SELECT id_paciente FROM cli_cita WHERE id_cita=? AND estado_registro='ACTIVO'`,
        [idCita],
      );
      if (!cita || Number(cita.id_paciente) !== Number(idPaciente)) {
        throw new BadRequestException('La cita no corresponde al paciente');
      }
    }
    if (idConsulta) {
      const [consulta] = await this.db.query(
        `SELECT id_paciente FROM cli_consulta WHERE id_consulta=? AND estado_registro='ACTIVO'`,
        [idConsulta],
      );
      if (!consulta || Number(consulta.id_paciente) !== Number(idPaciente)) {
        throw new BadRequestException('La consulta no corresponde al paciente');
      }
    }
    const activa = this.unidad.exigirEmpresa();
    const registro = pac.id_unidad_registro == null ? null : Number(pac.id_unidad_registro);
    if (idCita || idConsulta) {
      await this.unidad.exigirOrigen(
        { id_paciente: idPaciente, id_cita: idCita || null, id_consulta: idConsulta || null },
        { sede: false, suelto: 'registro' },
      );
    } else if (registro !== activa) {
      const [cita] = await this.db.query(
        `SELECT id_cita FROM cli_cita
         WHERE id_paciente=? AND id_unidad=? AND estado_registro='ACTIVO' LIMIT 1`,
        [idPaciente, activa],
      );
      const [consulta] = cita
        ? [null]
        : await this.db.query(
            `SELECT id_consulta FROM cli_consulta
             WHERE id_paciente=? AND id_unidad=? AND estado_registro='ACTIVO' LIMIT 1`,
            [idPaciente, activa],
          );
      if (!cita && !consulta) await this.unidad.exigirHistoriaPaciente(idPaciente);
    }
    return { idUnidad: activa, idUnidadRegistro: registro };
  }

  async list(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const w = [`m.estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (q.id_paciente) {
      w.push('m.id_paciente=?');
      p.push(Number(q.id_paciente));
    }
    if (q.id_cita) {
      w.push('m.id_cita=?');
      p.push(Number(q.id_cita));
    }
    if (q.id_consulta) {
      w.push('m.id_consulta=?');
      p.push(Number(q.id_consulta));
    }
    if (q.search) {
      const s = `%${String(q.search).trim()}%`;
      w.push(`(m.zona_label LIKE ? OR m.procedimiento LIKE ? OR CONCAT(pa.nombres,' ',pa.apellidos) LIKE ?)`);
      p.push(s, s, s);
    }
    const origen = this.unidad.sqlOrigen('m', {
      consulta: true,
      cita: true,
      sede: false,
      suelto: 'registro',
    });
    if (origen.sql) {
      w.push(origen.sql);
      p.push(...origen.params);
    }
    const where = w.join(' AND ');
    const [c] = await this.db.query(
      `SELECT COUNT(*) total
       FROM cli_mapa_marcador m
       JOIN cli_paciente pa ON pa.id_paciente=m.id_paciente
       WHERE ${where}`,
      p,
    );
    const data = await this.db.query(
      `SELECT m.*,
              CONCAT(pa.nombres,' ',pa.apellidos) AS nombre_paciente,
              pa.numero_documento
       FROM cli_mapa_marcador m
       JOIN cli_paciente pa ON pa.id_paciente=m.id_paciente
       WHERE ${where}
       ORDER BY m.id_mapa_marcador DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c?.total || 0)) };
  }

  async findOne(id: number) {
    const [row] = await this.db.query(
      `SELECT m.*, CONCAT(pa.nombres,' ',pa.apellidos) AS nombre_paciente
       FROM cli_mapa_marcador m
       JOIN cli_paciente pa ON pa.id_paciente=m.id_paciente
       WHERE m.id_mapa_marcador=? AND m.estado_registro='ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Marcador no encontrado');
    await this.unidad.exigirOrigen(row, { sede: false, suelto: 'registro' });
    return row;
  }

  async create(d: MapaMarcadorDto, userId: number) {
    const [pac] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [d.id_paciente],
    );
    if (!pac) throw new BadRequestException('Paciente no válido');
    await this.unidad.exigirOrigen(
      {
        id_paciente: d.id_paciente,
        id_consulta: d.id_consulta || null,
        id_cita: d.id_cita || null,
      },
      { sede: false, suelto: 'registro' },
    );
    const r = await this.db.query(
      `INSERT INTO cli_mapa_marcador
        (id_paciente,id_consulta,id_cita,zona_codigo,zona_label,lado,procedimiento,estado,
         fecha_plan,notas,pos_x,pos_y,pos_z,vista_2d,pos_2d_x,pos_2d_y,origen,id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.id_paciente,
        d.id_consulta || null,
        d.id_cita || null,
        d.zona_codigo,
        d.zona_label,
        d.lado || 'Frontal',
        d.procedimiento,
        d.estado || 'PLANIFICADO',
        d.fecha_plan || null,
        d.notas || null,
        d.pos_x,
        d.pos_y,
        d.pos_z,
        d.vista_2d || null,
        d.pos_2d_x ?? null,
        d.pos_2d_y ?? null,
        d.origen || 'CATALOGO',
        userId,
      ],
    );
    const id = Number(r.insertId);
    await this.auditoria.registrar('cli_mapa_marcador', id, 'CREAR', userId, null, d);
    return { id, message: 'Marcador guardado' };
  }

  async update(id: number, d: UpdateMapaMarcadorDto, userId: number) {
    const old = await this.findOne(id);
    await this.unidad.exigirOrigen(
      {
        id_paciente: old.id_paciente,
        id_consulta: d.id_consulta ?? old.id_consulta,
        id_cita: d.id_cita ?? old.id_cita,
      },
      { sede: false, suelto: 'registro' },
    );
    await this.db.query(
      `UPDATE cli_mapa_marcador SET
         id_consulta=COALESCE(?,id_consulta),
         id_cita=COALESCE(?,id_cita),
         zona_label=COALESCE(?,zona_label),
         lado=COALESCE(?,lado),
         procedimiento=COALESCE(?,procedimiento),
         estado=COALESCE(?,estado),
         fecha_plan=COALESCE(?,fecha_plan),
         notas=COALESCE(?,notas),
         pos_x=COALESCE(?,pos_x),
         pos_y=COALESCE(?,pos_y),
         pos_z=COALESCE(?,pos_z),
         vista_2d=COALESCE(?,vista_2d),
         pos_2d_x=COALESCE(?,pos_2d_x),
         pos_2d_y=COALESCE(?,pos_2d_y),
         id_usuario_mod=?
       WHERE id_mapa_marcador=? AND estado_registro='ACTIVO'`,
      [
        d.id_consulta ?? null,
        d.id_cita ?? null,
        d.zona_label ?? null,
        d.lado ?? null,
        d.procedimiento ?? null,
        d.estado ?? null,
        d.fecha_plan ?? null,
        d.notas ?? null,
        d.pos_x ?? null,
        d.pos_y ?? null,
        d.pos_z ?? null,
        d.vista_2d ?? null,
        d.pos_2d_x ?? null,
        d.pos_2d_y ?? null,
        userId,
        id,
      ],
    );
    await this.auditoria.registrar('cli_mapa_marcador', id, 'ACTUALIZAR', userId, old, d);
    return { message: 'Marcador actualizado' };
  }

  /** Asocia marcadores de la cita a la consulta/atención. */
  async vincularAConsulta(opts: {
    id_consulta: number;
    id_cita?: number | null;
    userId: number;
  }) {
    const idConsulta = Number(opts.id_consulta);
    const idCita = opts.id_cita ? Number(opts.id_cita) : 0;
    if (!idConsulta || !idCita) return { vinculados: 0 };
    const r = await this.db.query(
      `UPDATE cli_mapa_marcador
       SET id_consulta=?, id_usuario_mod=?
       WHERE id_cita=? AND estado_registro='ACTIVO'
         AND (id_consulta IS NULL OR id_consulta=?)`,
      [idConsulta, opts.userId, idCita, idConsulta],
    );
    const afectados = Number(r?.affectedRows || 0);
    if (afectados) {
      await this.auditoria.registrar('cli_mapa_marcador', idConsulta, 'ACTUALIZAR', opts.userId, null, {
        accion: 'vincular_consulta',
        id_consulta: idConsulta,
        id_cita: idCita,
        vinculados: afectados,
      });
    }
    return { vinculados: afectados };
  }

  async remove(id: number, userId: number) {
    const old = await this.findOne(id);
    await this.db.query(
      `UPDATE cli_mapa_marcador SET estado_registro='ELIMINADO', id_usuario_mod=? WHERE id_mapa_marcador=?`,
      [userId, id],
    );
    await this.auditoria.registrar('cli_mapa_marcador', id, 'ELIMINAR', userId, old, null);
    return { message: 'Marcador eliminado' };
  }
}
