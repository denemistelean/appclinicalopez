import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { UnidadScopeService } from '@app/auth';
import { DataSource } from 'typeorm';
import { NotificacionDto, UpdateNotificacionDto } from './notificaciones.dto';

/**
 * La empresa de una notificación es la de su sede. No hay columna id_unidad
 * y el usuario creador no define la empresa. Sin sede, la fila no se muestra
 * ni se modifica en ninguna empresa.
 * No existe un permiso para leer notificaciones privadas de otro usuario.
 * `todas=1` conserva el mismo alcance de destinatario que el listado normal.
 */
@Injectable()
export class NotificacionesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly unidad: UnidadScopeService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }

  private exigirDestinatario(destino: number | null | undefined, userId: number) {
    if (destino != null && Number(destino) !== Number(userId)) {
      throw new ForbiddenException('La notificación está dirigida a otro usuario');
    }
  }

  private filtroLista(userId: number) {
    const sede = this.unidad.sqlPorSede('n.id_sede');
    if (!sede.sql) throw new ForbiddenException('No tiene una empresa asignada');
    return {
      sql: `n.estado_registro='ACTIVO'
        AND (n.id_usuario_destino=? OR n.id_usuario_destino IS NULL)
        AND n.id_sede IS NOT NULL
        AND ${sede.sql}`,
      params: [userId, ...sede.params],
    };
  }

  private async cargarAutorizada(id: number, userId: number) {
    const [row] = await this.db.query(
      `SELECT * FROM cli_notificacion WHERE id_notificacion=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Notificación no encontrada');
    if (row.id_sede == null) {
      throw new ForbiddenException('El registro no pertenece a la empresa activa');
    }
    await this.unidad.exigirSede(Number(row.id_sede));
    this.exigirDestinatario(row.id_usuario_destino, userId);
    return row;
  }

  async list(q: any, userId: number) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    void q.todas;
    const filtro = this.filtroLista(userId);
    const [c] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_notificacion n WHERE ${filtro.sql}`,
      filtro.params,
    );
    const data = await this.db.query(
      `SELECT * FROM cli_notificacion n WHERE ${filtro.sql} ORDER BY n.id_notificacion DESC LIMIT ? OFFSET ?`,
      [...filtro.params, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c?.total || 0)) };
  }

  async findOne(id: number, userId: number) {
    return this.cargarAutorizada(id, userId);
  }

  async create(d: NotificacionDto, userId: number) {
    if (d.id_sede == null) {
      throw new BadRequestException('La notificación necesita una sede de la empresa activa');
    }
    await this.unidad.exigirSede(Number(d.id_sede));
    const r = await this.db.query(
      `INSERT INTO cli_notificacion (id_usuario_destino,id_paciente,id_sede,canal,tipo,titulo,mensaje,referencia_tipo,referencia_id,fecha_programada,id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.id_usuario_destino || null,
        d.id_paciente || null,
        d.id_sede,
        d.canal || 'SISTEMA',
        d.tipo,
        d.titulo,
        d.mensaje,
        d.referencia_tipo || null,
        d.referencia_id || null,
        d.fecha_programada || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Notificación creada' };
  }

  async update(id: number, d: UpdateNotificacionDto, userId: number) {
    await this.cargarAutorizada(id, userId);
    if (d.id_sede !== undefined) {
      if (d.id_sede == null) {
        throw new BadRequestException('La notificación necesita una sede de la empresa activa');
      }
      await this.unidad.exigirSede(Number(d.id_sede));
    }
    const campos = [
      'id_usuario_destino',
      'id_paciente',
      'id_sede',
      'canal',
      'tipo',
      'titulo',
      'mensaje',
      'referencia_tipo',
      'referencia_id',
      'fecha_programada',
    ].filter((k) => (d as any)[k] !== undefined);
    const sets = [...campos.map((k) => `${k}=?`), 'id_usuario_mod=?'];
    const r = await this.db.query(
      `UPDATE cli_notificacion SET ${sets.join(',')} WHERE id_notificacion=? AND estado_registro='ACTIVO'`,
      [...campos.map((k) => (d as any)[k]), userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Notificación no encontrada');
    return { message: 'Notificación actualizada' };
  }

  async leer(id: number, userId: number) {
    await this.cargarAutorizada(id, userId);
    const r = await this.db.query(
      `UPDATE cli_notificacion SET leida=1,id_usuario_mod=? WHERE id_notificacion=? AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Notificación no encontrada');
    return { message: 'Notificación leída' };
  }

  async remove(id: number, userId: number) {
    await this.cargarAutorizada(id, userId);
    await this.db.query(
      `UPDATE cli_notificacion SET estado_registro='ELIMINADO',estado='CANCELADA',id_usuario_mod=? WHERE id_notificacion=? AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    await this.auditoria.registrar('cli_notificacion', id, 'ELIMINAR', userId, null, null);
    return { message: 'Notificación eliminada' };
  }
}
