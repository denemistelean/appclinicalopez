import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { UnidadScopeService } from '@app/auth';
import { DataSource } from 'typeorm';
import { FotoEvolucionDto, UpdateFotoEvolucionDto } from './fotos-evolucion.dto';

const ORIGEN = { sede: true, suelto: 'registro' as const };

@Injectable()
export class FotosEvolucionService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly unidad: UnidadScopeService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }

  async list(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const w = [`estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (q.id_paciente) {
      w.push('id_paciente=?');
      p.push(Number(q.id_paciente));
    }
    const origen = this.unidad.sqlOrigen('cli_foto_evolucion', ORIGEN);
    if (origen.sql) {
      w.push(origen.sql);
      p.push(...origen.params);
    }
    const where = w.join(' AND ');
    const [c] = await this.db.query(`SELECT COUNT(*) total FROM cli_foto_evolucion WHERE ${where}`, p);
    const data = await this.db.query(
      `SELECT * FROM cli_foto_evolucion WHERE ${where} ORDER BY fecha_foto DESC LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c.total || 0)) };
  }

  private async cargar(id: number) {
    const [row] = await this.db.query(
      `SELECT * FROM cli_foto_evolucion WHERE id_foto_evolucion=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Foto no encontrada');
    await this.unidad.exigirOrigen(row, ORIGEN);
    return row;
  }

  async create(d: FotoEvolucionDto, userId: number) {
    await this.unidad.exigirOrigen(
      {
        id_paciente: d.id_paciente,
        id_sede: d.id_sede || null,
        id_consulta: d.id_consulta || null,
        id_cita: d.id_cita || null,
      },
      ORIGEN,
    );
    const r = await this.db.query(
      `INSERT INTO cli_foto_evolucion (id_paciente,id_sede,id_consulta,id_cita,fecha_foto,tipo_vista,ruta_archivo,miniatura_url,descripcion,id_usuario_crea) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        d.id_paciente,
        d.id_sede || null,
        d.id_consulta || null,
        d.id_cita || null,
        d.fecha_foto,
        d.tipo_vista || null,
        d.ruta_archivo,
        d.miniatura_url || null,
        d.descripcion || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Foto agregada' };
  }

  async update(id: number, d: UpdateFotoEvolucionDto, userId: number) {
    const old = await this.cargar(id);
    await this.unidad.exigirOrigen({ ...old, ...d }, ORIGEN);
    const f = ['id_sede', 'id_consulta', 'id_cita', 'fecha_foto', 'tipo_vista', 'ruta_archivo', 'miniatura_url', 'descripcion'].filter(
      (k) => (d as any)[k] !== undefined,
    );
    if (!f.length) return { message: 'Foto actualizada' };
    const r = await this.db.query(
      `UPDATE cli_foto_evolucion SET ${f.map((k) => `${k}=?`).join(',')},id_usuario_mod=? WHERE id_foto_evolucion=? AND estado_registro='ACTIVO'`,
      [...f.map((k) => (d as any)[k]), userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Foto no encontrada');
    return { message: 'Foto actualizada' };
  }

  async remove(id: number, userId: number) {
    await this.cargar(id);
    const r = await this.db.query(
      `UPDATE cli_foto_evolucion SET estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_foto_evolucion=? AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Foto no encontrada');
    await this.auditoria.registrar('cli_foto_evolucion', id, 'ELIMINAR', userId, null, null);
    return { message: 'Foto eliminada' };
  }
}
