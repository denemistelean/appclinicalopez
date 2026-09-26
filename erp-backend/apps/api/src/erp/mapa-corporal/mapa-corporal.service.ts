import { BadRequestException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { AuditoriaService } from '../../common/auditoria/auditoria.service';
import { MapaMarcadorDto, UpdateMapaMarcadorDto } from './mapa-corporal.dto';

@Injectable()
export class MapaCorporalService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / Math.max(limit, 1))) };
  }

  private rootDocs(): string {
    return (
      this.config.get<string>('DOCUMENTOS_ROOT') ||
      join('D:', 'xampp', 'htdocs', 'appClinicaLopez', 'storage', 'ClinicaDigital')
    );
  }

  private padPac(id: number) {
    return String(id).padStart(9, '0');
  }

  private capturaDir(idPaciente: number) {
    return join(this.rootDocs(), 'PACIENTES', this.padPac(idPaciente), 'MAPA');
  }

  private capturaPath(idPaciente: number, vista: 'frontal' | 'posterior') {
    return join(this.capturaDir(idPaciente), `vista_${vista}.png`);
  }

  async estadoCapturas(idPaciente: number) {
    await this.assertPaciente(idPaciente);
    const frontal = existsSync(this.capturaPath(idPaciente, 'frontal'));
    const posterior = existsSync(this.capturaPath(idPaciente, 'posterior'));
    return { frontal, posterior, actualizado: frontal || posterior };
  }

  async getCaptura(idPaciente: number, vista: 'frontal' | 'posterior') {
    await this.assertPaciente(idPaciente);
    const path = this.capturaPath(idPaciente, vista);
    if (!existsSync(path)) throw new NotFoundException(`Captura ${vista} no encontrada`);
    return new StreamableFile(createReadStream(path), {
      type: 'image/png',
      disposition: `inline; filename="mapa_${vista}_${idPaciente}.png"`,
    });
  }

  /** Guarda PNG base64 (data URL o puro) de ambas vistas. */
  async guardarCapturas(
    idPaciente: number,
    body: { frontal?: string; posterior?: string },
    userId: number,
  ) {
    await this.assertPaciente(idPaciente);
    if (!body?.frontal && !body?.posterior) {
      throw new BadRequestException('Envíe al menos una captura (frontal o posterior)');
    }
    const dir = this.capturaDir(idPaciente);
    mkdirSync(dir, { recursive: true });

    const saved: string[] = [];
    for (const vista of ['frontal', 'posterior'] as const) {
      const raw = body[vista];
      if (!raw) continue;
      const buf = this.decodeDataUrlPng(raw);
      writeFileSync(this.capturaPath(idPaciente, vista), buf);
      saved.push(vista);
    }

    await this.auditoria.registrar('cli_mapa_captura', idPaciente, 'ACTUALIZAR', userId, null, {
      vistas: saved,
    });
    return { message: 'Capturas guardadas', vistas: saved };
  }

  async eliminarCapturas(idPaciente: number, userId: number) {
    await this.assertPaciente(idPaciente);
    for (const vista of ['frontal', 'posterior'] as const) {
      const p = this.capturaPath(idPaciente, vista);
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

  private async assertPaciente(id: number) {
    const [pac] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!pac) throw new NotFoundException('Paciente no encontrado');
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
    if (q.search) {
      const s = `%${String(q.search).trim()}%`;
      w.push(`(m.zona_label LIKE ? OR m.procedimiento LIKE ? OR CONCAT(pa.nombres,' ',pa.apellidos) LIKE ?)`);
      p.push(s, s, s);
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
    return row;
  }

  async create(d: MapaMarcadorDto, userId: number) {
    const [pac] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [d.id_paciente],
    );
    if (!pac) throw new BadRequestException('Paciente no válido');
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
    await this.db.query(
      `UPDATE cli_mapa_marcador SET
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
