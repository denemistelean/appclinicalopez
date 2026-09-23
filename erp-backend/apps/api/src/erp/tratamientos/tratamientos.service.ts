import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '@app/common';
import {
  CreateContraindicacionDto,
  CreatePaqueteDto,
  CreateTratamientoDto,
  CreateTratamientoInsumoDto,
  TratamientoSedeDto,
  UpdatePaqueteDto,
  UpdateTratamientoDto,
} from './tratamientos.dto';

@Injectable()
export class TratamientosService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly auditoriaService: AuditoriaService,
  ) {}

  private pageMeta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }

  async findAll(query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;
    const search = String(query.search || '').trim();
    const idSede = query.id_sede ? Number(query.id_sede) : null;
    const categoria = query.categoria ? String(query.categoria) : null;
    const estado = query.estado ? String(query.estado) : null;

    const where: string[] = [`t.estado_registro = 'ACTIVO'`];
    const params: any[] = [];
    if (search) {
      where.push(`(t.nombre LIKE ? OR t.codigo LIKE ? OR t.categoria LIKE ?)`);
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (categoria) {
      where.push(`t.categoria = ?`);
      params.push(categoria);
    }
    if (estado) {
      where.push(`t.estado = ?`);
      params.push(estado);
    }
    if (idSede) {
      where.push(`EXISTS (
        SELECT 1 FROM cli_tratamiento_sede ts
        WHERE ts.id_tratamiento = t.id_tratamiento AND ts.id_sede = ?
          AND ts.disponible = 1 AND ts.estado_registro = 'ACTIVO'
      )`);
      params.push(idSede);
    }
    const sqlWhere = where.join(' AND ');
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM cli_tratamiento t WHERE ${sqlWhere}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT t.id_tratamiento, t.codigo, t.nombre, t.categoria, t.duracion_minutos,
              t.precio_base, t.requiere_equipo, t.requiere_sala, t.intervalo_minutos, t.estado
       FROM cli_tratamiento t
       WHERE ${sqlWhere}
       ORDER BY t.nombre ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { data, meta: this.pageMeta(page, limit, Number(countRow?.total || 0)) };
  }

  async findOne(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT * FROM cli_tratamiento WHERE id_tratamiento = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Tratamiento no encontrado');
    const sedes = await this.dataSource.query(
      `SELECT ts.*, s.nombre AS sede_nombre FROM cli_tratamiento_sede ts
       JOIN cli_sede s ON s.id_sede = ts.id_sede
       WHERE ts.id_tratamiento = ? AND ts.estado_registro = 'ACTIVO'`,
      [id],
    );
    return { ...row, sedes };
  }

  async getReglas(id: number) {
    const t = await this.findOne(id);
    const contraindicaciones = await this.listContraindicaciones(id);
    const insumos = await this.listInsumos(id);
    return {
      id_tratamiento: t.id_tratamiento,
      nombre: t.nombre,
      duracion_minutos: t.duracion_minutos,
      intervalo_minutos: t.intervalo_minutos,
      requiere_sala: !!t.requiere_sala,
      requiere_equipo: !!t.requiere_equipo,
      id_tipo_equipo: t.id_tipo_equipo,
      precio_base: Number(t.precio_base),
      sedes: t.sedes,
      contraindicaciones,
      insumos,
    };
  }

  async create(dto: CreateTratamientoDto, userId: number) {
    const nombre = String(dto.nombre || '').trim().toUpperCase();
    if (!nombre) throw new BadRequestException('nombre requerido');
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const res = await qr.query(
        `INSERT INTO cli_tratamiento
          (codigo, nombre, descripcion, categoria, id_especialidad, duracion_minutos, precio_base,
           requiere_equipo, requiere_sala, id_tipo_equipo, intervalo_minutos, estado, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.codigo?.trim() || null,
          nombre,
          dto.descripcion?.trim() || null,
          dto.categoria?.trim() || null,
          dto.id_especialidad || null,
          dto.duracion_minutos || 30,
          dto.precio_base ?? 0,
          dto.requiere_equipo ? 1 : 0,
          dto.requiere_sala === false ? 0 : 1,
          dto.id_tipo_equipo || null,
          dto.intervalo_minutos ?? null,
          dto.estado || 'ACTIVO',
          userId,
        ],
      );
      const id = Number(res.insertId);
      // Si no vino especialidad, enlazar/crear por nombre del tratamiento
      if (!dto.id_especialidad) {
        let [esp] = await qr.query(
          `SELECT id_especialidad FROM cli_especialidad WHERE UPPER(nombre)=? AND estado_registro='ACTIVO'`,
          [nombre],
        );
        if (!esp) {
          const codigo = nombre.replace(/\s+/g, '_').slice(0, 40);
          const ins = await qr.query(
            `INSERT INTO cli_especialidad (codigo, nombre, id_usuario_crea) VALUES (?,?,?)`,
            [codigo, nombre, userId],
          );
          esp = { id_especialidad: Number(ins.insertId) };
        }
        await qr.query(`UPDATE cli_tratamiento SET id_especialidad=? WHERE id_tratamiento=?`, [
          esp.id_especialidad,
          id,
        ]);
      }
      for (const idSede of (dto.sedes || []).map(Number).filter(Boolean)) {
        await qr.query(
          `INSERT INTO cli_tratamiento_sede (id_tratamiento, id_sede, disponible, id_usuario_crea)
           VALUES (?, ?, 1, ?)`,
          [id, idSede, userId],
        );
      }
      await qr.commitTransaction();
      await this.auditoriaService.registrar('cli_tratamiento', id, 'CREAR', userId, null, { nombre });
      return { id, message: 'Tratamiento creado' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async update(id: number, dto: UpdateTratamientoDto, userId: number) {
    const antiguo = await this.findOne(id);
    const res = await this.dataSource.query(
      `UPDATE cli_tratamiento SET
        codigo = COALESCE(?, codigo),
        nombre = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        categoria = COALESCE(?, categoria),
        id_especialidad = COALESCE(?, id_especialidad),
        duracion_minutos = COALESCE(?, duracion_minutos),
        precio_base = COALESCE(?, precio_base),
        requiere_equipo = COALESCE(?, requiere_equipo),
        requiere_sala = COALESCE(?, requiere_sala),
        id_tipo_equipo = COALESCE(?, id_tipo_equipo),
        intervalo_minutos = COALESCE(?, intervalo_minutos),
        estado = COALESCE(?, estado),
        id_usuario_mod = ?
       WHERE id_tratamiento = ? AND estado_registro = 'ACTIVO'`,
      [
        dto.codigo !== undefined ? dto.codigo?.trim() || null : null,
        dto.nombre != null ? dto.nombre.trim().toUpperCase() : null,
        dto.descripcion !== undefined ? dto.descripcion?.trim() || null : null,
        dto.categoria !== undefined ? dto.categoria?.trim() || null : null,
        dto.id_especialidad !== undefined ? dto.id_especialidad || null : null,
        dto.duracion_minutos ?? null,
        dto.precio_base ?? null,
        dto.requiere_equipo !== undefined ? (dto.requiere_equipo ? 1 : 0) : null,
        dto.requiere_sala !== undefined ? (dto.requiere_sala ? 1 : 0) : null,
        dto.id_tipo_equipo !== undefined ? dto.id_tipo_equipo || null : null,
        dto.intervalo_minutos !== undefined ? dto.intervalo_minutos : null,
        dto.estado || null,
        userId,
        id,
      ],
    );
    if (!res.affectedRows) throw new NotFoundException('Tratamiento no encontrado');
    await this.auditoriaService.registrar('cli_tratamiento', id, 'ACTUALIZAR', userId, antiguo, dto);
    return { message: 'Tratamiento actualizado' };
  }

  async remove(id: number, userId: number) {
    const antiguo = await this.findOne(id);
    const res = await this.dataSource.query(
      `UPDATE cli_tratamiento SET estado_registro = 'ELIMINADO', estado = 'INACTIVO', id_usuario_mod = ?
       WHERE id_tratamiento = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (!res.affectedRows) throw new NotFoundException('Tratamiento no encontrado');
    await this.auditoriaService.registrar('cli_tratamiento', id, 'ELIMINAR', userId, antiguo, null);
    return { message: 'Tratamiento eliminado' };
  }

  async syncSedes(id: number, sedes: TratamientoSedeDto[], userId: number) {
    await this.findOne(id);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE cli_tratamiento_sede SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
         WHERE id_tratamiento = ? AND estado_registro = 'ACTIVO'`,
        [userId, id],
      );
      for (const s of sedes || []) {
        await qr.query(
          `INSERT INTO cli_tratamiento_sede
            (id_tratamiento, id_sede, precio, disponible, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE precio = VALUES(precio), disponible = VALUES(disponible),
             estado_registro = 'ACTIVO', id_usuario_mod = ?`,
          [
            id,
            Number(s.id_sede),
            s.precio ?? null,
            s.disponible === false ? 0 : 1,
            userId,
            userId,
          ],
        );
      }
      await qr.commitTransaction();
      return { message: 'Sedes sincronizadas' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async listContraindicaciones(id: number) {
    await this.findOne(id);
    return this.dataSource.query(
      `SELECT * FROM cli_contraindicacion
       WHERE id_tratamiento = ? AND estado_registro = 'ACTIVO' ORDER BY severidad DESC`,
      [id],
    );
  }

  async createContraindicacion(id: number, dto: CreateContraindicacionDto, userId: number) {
    await this.findOne(id);
    const res = await this.dataSource.query(
      `INSERT INTO cli_contraindicacion
        (id_tratamiento, codigo, descripcion, severidad, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?)`,
      [id, dto.codigo?.trim() || null, dto.descripcion.trim(), dto.severidad || 'MEDIA', userId],
    );
    const cid = Number(res.insertId);
    await this.auditoriaService.registrar('cli_contraindicacion', cid, 'CREAR', userId, null, dto);
    return { id: cid, message: 'Contraindicación creada' };
  }

  async removeContraindicacion(id: number, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_contraindicacion WHERE id_contraindicacion = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!antiguo) throw new NotFoundException('Contraindicación no encontrada');
    await this.dataSource.query(
      `UPDATE cli_contraindicacion SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_contraindicacion = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    await this.auditoriaService.registrar('cli_contraindicacion', id, 'ELIMINAR', userId, antiguo, null);
    return { message: 'Contraindicación eliminada' };
  }

  async listInsumos(id: number) {
    await this.findOne(id);
    return this.dataSource.query(
      `SELECT ti.*, i.nombre AS insumo_nombre, i.unidad AS insumo_unidad
       FROM cli_tratamiento_insumo ti
       LEFT JOIN cli_insumo i ON i.id_insumo = ti.id_insumo AND i.estado_registro = 'ACTIVO'
       WHERE ti.id_tratamiento = ? AND ti.estado_registro = 'ACTIVO'`,
      [id],
    );
  }

  async createInsumo(id: number, dto: CreateTratamientoInsumoDto, userId: number) {
    await this.findOne(id);
    const res = await this.dataSource.query(
      `INSERT INTO cli_tratamiento_insumo
        (id_tratamiento, id_insumo, cantidad, unidad, obligatorio, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad), unidad = VALUES(unidad),
         obligatorio = VALUES(obligatorio), estado_registro = 'ACTIVO', id_usuario_mod = ?`,
      [
        id,
        Number(dto.id_insumo),
        dto.cantidad ?? 1,
        dto.unidad?.trim() || null,
        dto.obligatorio === false ? 0 : 1,
        userId,
        userId,
      ],
    );
    return { id: Number(res.insertId) || null, message: 'Insumo vinculado' };
  }

  async removeInsumo(id: number, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_tratamiento_insumo WHERE id_tratamiento_insumo = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!antiguo) throw new NotFoundException('Vínculo insumo no encontrado');
    await this.dataSource.query(
      `UPDATE cli_tratamiento_insumo SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_tratamiento_insumo = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    return { message: 'Insumo desvinculado' };
  }

  async listPaquetes(query: any) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;
    const search = String(query.search || '').trim();
    const where: string[] = [`p.estado_registro = 'ACTIVO'`];
    const params: any[] = [];
    if (search) {
      where.push(`(p.nombre LIKE ? OR p.codigo LIKE ?)`);
      const like = `%${search}%`;
      params.push(like, like);
    }
    const sqlWhere = where.join(' AND ');
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM cli_paquete p WHERE ${sqlWhere}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT p.*, t.nombre AS tratamiento_nombre
       FROM cli_paquete p
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento = p.id_tratamiento
       WHERE ${sqlWhere}
       ORDER BY p.nombre
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { data, meta: this.pageMeta(page, limit, Number(countRow?.total || 0)) };
  }

  async createPaquete(dto: CreatePaqueteDto, userId: number) {
    const res = await this.dataSource.query(
      `INSERT INTO cli_paquete
        (codigo, nombre, descripcion, id_tratamiento, cantidad_sesiones, precio_total, vigencia_dias, estado, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dto.codigo?.trim() || null,
        dto.nombre.trim().toUpperCase(),
        dto.descripcion?.trim() || null,
        dto.id_tratamiento || null,
        dto.cantidad_sesiones || 1,
        dto.precio_total ?? 0,
        dto.vigencia_dias || null,
        dto.estado || 'ACTIVO',
        userId,
      ],
    );
    const id = Number(res.insertId);
    await this.auditoriaService.registrar('cli_paquete', id, 'CREAR', userId, null, dto);
    return { id, message: 'Paquete creado' };
  }

  async updatePaquete(id: number, dto: UpdatePaqueteDto, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_paquete WHERE id_paquete = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!antiguo) throw new NotFoundException('Paquete no encontrado');
    await this.dataSource.query(
      `UPDATE cli_paquete SET
        codigo = COALESCE(?, codigo),
        nombre = COALESCE(?, nombre),
        descripcion = COALESCE(?, descripcion),
        id_tratamiento = COALESCE(?, id_tratamiento),
        cantidad_sesiones = COALESCE(?, cantidad_sesiones),
        precio_total = COALESCE(?, precio_total),
        vigencia_dias = COALESCE(?, vigencia_dias),
        estado = COALESCE(?, estado),
        id_usuario_mod = ?
       WHERE id_paquete = ? AND estado_registro = 'ACTIVO'`,
      [
        dto.codigo !== undefined ? dto.codigo?.trim() || null : null,
        dto.nombre != null ? dto.nombre.trim().toUpperCase() : null,
        dto.descripcion !== undefined ? dto.descripcion?.trim() || null : null,
        dto.id_tratamiento !== undefined ? dto.id_tratamiento || null : null,
        dto.cantidad_sesiones ?? null,
        dto.precio_total ?? null,
        dto.vigencia_dias !== undefined ? dto.vigencia_dias || null : null,
        dto.estado || null,
        userId,
        id,
      ],
    );
    await this.auditoriaService.registrar('cli_paquete', id, 'ACTUALIZAR', userId, antiguo, dto);
    return { message: 'Paquete actualizado' };
  }

  async removePaquete(id: number, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_paquete WHERE id_paquete = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!antiguo) throw new NotFoundException('Paquete no encontrado');
    await this.dataSource.query(
      `UPDATE cli_paquete SET estado_registro = 'ELIMINADO', estado = 'INACTIVO', id_usuario_mod = ?
       WHERE id_paquete = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    await this.auditoriaService.registrar('cli_paquete', id, 'ELIMINAR', userId, antiguo, null);
    return { message: 'Paquete eliminado' };
  }
}
