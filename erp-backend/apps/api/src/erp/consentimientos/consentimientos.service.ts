import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { UnidadScopeService } from '@app/auth';
import { DataSource } from 'typeorm';
import {
  ConsentimientoDto,
  FirmarConsentimientoDto,
  PlantillaConsentimientoDto,
  UpdatePlantillaConsentimientoDto,
} from './consentimientos.dto';

const ORIGEN = { sede: true, suelto: 'registro' as const };

@Injectable()
export class ConsentimientosService {
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
    const w = [`c.estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (q.id_paciente) {
      w.push('c.id_paciente=?');
      p.push(Number(q.id_paciente));
    }
    const origen = this.unidad.sqlOrigen('c', ORIGEN);
    if (origen.sql) {
      w.push(origen.sql);
      p.push(...origen.params);
    }
    const where = w.join(' AND ');
    const [n] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_consentimiento c WHERE ${where}`,
      p,
    );
    const data = await this.db.query(
      `SELECT c.*, p.nombre plantilla
       FROM cli_consentimiento c
       JOIN cli_consentimiento_plantilla p ON p.id_consentimiento_plantilla=c.id_consentimiento_plantilla
       WHERE ${where}
       ORDER BY c.id_consentimiento DESC LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(n.total || 0)) };
  }

  plantillas() {
    return this.db.query(
      `SELECT * FROM cli_consentimiento_plantilla WHERE estado_registro='ACTIVO' ORDER BY nombre`,
    );
  }

  async createPlantilla(d: PlantillaConsentimientoDto, userId: number) {
    const r = await this.db.query(
      `INSERT INTO cli_consentimiento_plantilla (nombre,version,contenido_html,id_tratamiento,activa,id_usuario_crea) VALUES (?,?,?,?,?,?)`,
      [d.nombre, d.version || '1.0', d.contenido_html, d.id_tratamiento || null, d.activa === false ? 0 : 1, userId],
    );
    return { id: Number(r.insertId), message: 'Plantilla creada' };
  }

  async updatePlantilla(id: number, d: UpdatePlantillaConsentimientoDto, userId: number) {
    const f = ['nombre', 'version', 'contenido_html', 'id_tratamiento', 'activa'].filter(
      (k) => (d as any)[k] !== undefined,
    );
    if (!f.length) return { message: 'Plantilla actualizada' };
    const r = await this.db.query(
      `UPDATE cli_consentimiento_plantilla SET ${f.map((k) => `${k}=?`).join(',')},id_usuario_mod=? WHERE id_consentimiento_plantilla=? AND estado_registro='ACTIVO'`,
      [...f.map((k) => (d as any)[k]), userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Plantilla no encontrada');
    return { message: 'Plantilla actualizada' };
  }

  async removePlantilla(id: number, userId: number) {
    await this.db.query(
      `UPDATE cli_consentimiento_plantilla SET estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_consentimiento_plantilla=?`,
      [userId, id],
    );
    return { message: 'Plantilla eliminada' };
  }

  private async cargar(id: number) {
    const [c] = await this.db.query(
      `SELECT * FROM cli_consentimiento WHERE id_consentimiento=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!c) throw new NotFoundException('Consentimiento no encontrado');
    await this.unidad.exigirOrigen(c, ORIGEN);
    return c;
  }

  async create(d: ConsentimientoDto, userId: number) {
    await this.unidad.exigirOrigen(
      {
        id_paciente: d.id_paciente,
        id_sede: d.id_sede || null,
        id_cita: d.id_cita || null,
        id_consulta: d.id_consulta || null,
      },
      ORIGEN,
    );
    const r = await this.db.query(
      `INSERT INTO cli_consentimiento (id_consentimiento_plantilla,id_paciente,id_sede,id_cita,id_consulta,id_usuario_crea) VALUES (?,?,?,?,?,?)`,
      [
        d.id_consentimiento_plantilla,
        d.id_paciente,
        d.id_sede || null,
        d.id_cita || null,
        d.id_consulta || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Consentimiento creado' };
  }

  async firmar(id: number, d: FirmarConsentimientoDto, userId: number) {
    const c = await this.cargar(id);
    const [plantilla] = await this.db.query(
      `SELECT contenido_html FROM cli_consentimiento_plantilla WHERE id_consentimiento_plantilla=?`,
      [c.id_consentimiento_plantilla],
    );
    if (c.estado !== 'PENDIENTE') throw new BadRequestException('Consentimiento no pendiente');
    await this.db.query(
      `UPDATE cli_consentimiento SET firma_url=?,contenido_snapshot_html=?,fecha_firma=NOW(),estado='FIRMADO',id_usuario_mod=? WHERE id_consentimiento=?`,
      [d.firma_url, plantilla?.contenido_html || null, userId, id],
    );
    await this.auditoria.registrar('cli_consentimiento', id, 'ACTUALIZAR', userId, c, { estado: 'FIRMADO' });
    return { message: 'Consentimiento firmado' };
  }

  async remove(id: number, userId: number) {
    await this.cargar(id);
    await this.db.query(
      `UPDATE cli_consentimiento SET estado='ANULADO',estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_consentimiento=?`,
      [userId, id],
    );
    return { message: 'Consentimiento eliminado' };
  }
}
