import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '../../common/auditoria/auditoria.service';
import { MapaMarcadorDto, UpdateMapaMarcadorDto } from './mapa-corporal.dto';

@Injectable()
export class MapaCorporalService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / Math.max(limit, 1))) };
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
         fecha_plan,notas,pos_x,pos_y,pos_z,origen,id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
