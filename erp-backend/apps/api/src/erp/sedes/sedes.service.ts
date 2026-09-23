import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '@app/common';
import {
  CreateEquipoDto,
  CreateSalaDto,
  CreateSedeDto,
  MantenimientoEquipoDto,
  UpdateEquipoDto,
  UpdateSalaDto,
  UpdateSedeDto,
} from './sedes.dto';

@Injectable()
export class SedesService {
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
    const estado = query.estado ? String(query.estado) : null;

    const where: string[] = [`s.estado_registro = 'ACTIVO'`];
    const params: any[] = [];
    if (search) {
      where.push(`(s.nombre LIKE ? OR s.ciudad LIKE ? OR s.direccion LIKE ?)`);
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (estado) {
      where.push(`s.estado = ?`);
      params.push(estado);
    }

    const sqlWhere = where.join(' AND ');
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM cli_sede s WHERE ${sqlWhere}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT s.id_sede, s.nombre, s.razon_social, s.direccion, s.ciudad, s.distrito,
              s.telefono, s.email_contacto, s.horario_apertura, s.horario_cierre,
              s.logo_url, s.estado
       FROM cli_sede s
       WHERE ${sqlWhere}
       ORDER BY s.nombre ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { data, meta: this.pageMeta(page, limit, Number(countRow?.total || 0)) };
  }

  async findOne(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT * FROM cli_sede WHERE id_sede = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Sede no encontrada');
    return row;
  }

  async create(dto: CreateSedeDto, userId: number) {
    const nombre = String(dto.nombre || '').trim().toUpperCase();
    const res = await this.dataSource.query(
      `INSERT INTO cli_sede
        (nombre, razon_social, direccion, ciudad, distrito, telefono, email_contacto,
         horario_apertura, horario_cierre, dias_atencion, logo_url, estado, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre,
        dto.razon_social?.trim() || null,
        dto.direccion?.trim() || null,
        dto.ciudad?.trim() || null,
        dto.distrito?.trim() || null,
        dto.telefono?.trim() || null,
        dto.email_contacto?.trim()?.toLowerCase() || null,
        dto.horario_apertura || null,
        dto.horario_cierre || null,
        dto.dias_atencion ? JSON.stringify(dto.dias_atencion) : null,
        dto.logo_url || null,
        dto.estado || 'ACTIVA',
        userId,
      ],
    );
    const id = Number(res.insertId);
    await this.auditoriaService.registrar('cli_sede', id, 'CREAR', userId, null, { nombre });
    return { id, message: 'Sede creada' };
  }

  async update(id: number, dto: UpdateSedeDto, userId: number) {
    const antiguo = await this.findOne(id);
    const res = await this.dataSource.query(
      `UPDATE cli_sede SET
        nombre = COALESCE(?, nombre),
        razon_social = COALESCE(?, razon_social),
        direccion = COALESCE(?, direccion),
        ciudad = COALESCE(?, ciudad),
        distrito = COALESCE(?, distrito),
        telefono = COALESCE(?, telefono),
        email_contacto = COALESCE(?, email_contacto),
        horario_apertura = COALESCE(?, horario_apertura),
        horario_cierre = COALESCE(?, horario_cierre),
        dias_atencion = COALESCE(?, dias_atencion),
        logo_url = COALESCE(?, logo_url),
        estado = COALESCE(?, estado),
        id_usuario_mod = ?
       WHERE id_sede = ? AND estado_registro = 'ACTIVO'`,
      [
        dto.nombre != null ? String(dto.nombre).trim().toUpperCase() : null,
        dto.razon_social !== undefined ? dto.razon_social?.trim() || null : null,
        dto.direccion !== undefined ? dto.direccion?.trim() || null : null,
        dto.ciudad !== undefined ? dto.ciudad?.trim() || null : null,
        dto.distrito !== undefined ? dto.distrito?.trim() || null : null,
        dto.telefono !== undefined ? dto.telefono?.trim() || null : null,
        dto.email_contacto !== undefined ? dto.email_contacto?.trim()?.toLowerCase() || null : null,
        dto.horario_apertura !== undefined ? dto.horario_apertura || null : null,
        dto.horario_cierre !== undefined ? dto.horario_cierre || null : null,
        dto.dias_atencion !== undefined ? JSON.stringify(dto.dias_atencion) : null,
        dto.logo_url !== undefined ? dto.logo_url || null : null,
        dto.estado || null,
        userId,
        id,
      ],
    );
    if (!res.affectedRows) throw new NotFoundException('Sede no encontrada');
    await this.auditoriaService.registrar('cli_sede', id, 'ACTUALIZAR', userId, antiguo, dto);
    return { message: 'Sede actualizada' };
  }

  async remove(id: number, userId: number) {
    const antiguo = await this.findOne(id);
    const res = await this.dataSource.query(
      `UPDATE cli_sede SET estado_registro = 'ELIMINADO', estado = 'INACTIVA', id_usuario_mod = ?
       WHERE id_sede = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (!res.affectedRows) throw new NotFoundException('Sede no encontrada');
    await this.auditoriaService.registrar('cli_sede', id, 'ELIMINAR', userId, antiguo, null);
    return { message: 'Sede eliminada' };
  }

  async listSalas(idSede: number) {
    await this.findOne(idSede);
    return this.dataSource.query(
      `SELECT id_sala, id_sede, nombre, capacidad_equipo, estado
       FROM cli_sala WHERE id_sede = ? AND estado_registro = 'ACTIVO' ORDER BY nombre`,
      [idSede],
    );
  }

  async createSala(idSede: number, dto: CreateSalaDto, userId: number) {
    await this.findOne(idSede);
    const res = await this.dataSource.query(
      `INSERT INTO cli_sala (id_sede, nombre, capacidad_equipo, estado, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?)`,
      [idSede, dto.nombre.trim(), dto.capacidad_equipo?.trim() || null, dto.estado || 'DISPONIBLE', userId],
    );
    const id = Number(res.insertId);
    await this.auditoriaService.registrar('cli_sala', id, 'CREAR', userId, null, dto);
    return { id, message: 'Sala creada' };
  }

  async updateSala(idSala: number, dto: UpdateSalaDto, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_sala WHERE id_sala = ? AND estado_registro = 'ACTIVO'`,
      [idSala],
    );
    if (!antiguo) throw new NotFoundException('Sala no encontrada');
    const res = await this.dataSource.query(
      `UPDATE cli_sala SET
        nombre = COALESCE(?, nombre),
        capacidad_equipo = COALESCE(?, capacidad_equipo),
        estado = COALESCE(?, estado),
        id_usuario_mod = ?
       WHERE id_sala = ? AND estado_registro = 'ACTIVO'`,
      [
        dto.nombre != null ? dto.nombre.trim() : null,
        dto.capacidad_equipo !== undefined ? dto.capacidad_equipo?.trim() || null : null,
        dto.estado || null,
        userId,
        idSala,
      ],
    );
    if (!res.affectedRows) throw new NotFoundException('Sala no encontrada');
    await this.auditoriaService.registrar('cli_sala', idSala, 'ACTUALIZAR', userId, antiguo, dto);
    return { message: 'Sala actualizada' };
  }

  async removeSala(idSala: number, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_sala WHERE id_sala = ? AND estado_registro = 'ACTIVO'`,
      [idSala],
    );
    if (!antiguo) throw new NotFoundException('Sala no encontrada');
    await this.dataSource.query(
      `UPDATE cli_sala SET estado_registro = 'ELIMINADO', id_usuario_mod = ? WHERE id_sala = ? AND estado_registro = 'ACTIVO'`,
      [userId, idSala],
    );
    await this.auditoriaService.registrar('cli_sala', idSala, 'ELIMINAR', userId, antiguo, null);
    return { message: 'Sala eliminada' };
  }

  async listEquipos(idSede: number) {
    await this.findOne(idSede);
    return this.dataSource.query(
      `SELECT e.id_equipo, e.id_sede, e.id_tipo_equipo, e.nombre, e.tipo, e.numero_serie,
              e.fecha_adquisicion, e.fecha_ultimo_mantenimiento, e.proximo_mantenimiento, e.estado,
              t.nombre AS tipo_nombre
       FROM cli_equipo e
       LEFT JOIN cli_tipo_equipo t ON t.id_tipo_equipo = e.id_tipo_equipo AND t.estado_registro = 'ACTIVO'
       WHERE e.id_sede = ? AND e.estado_registro = 'ACTIVO'
       ORDER BY e.nombre`,
      [idSede],
    );
  }

  async createEquipo(idSede: number, dto: CreateEquipoDto, userId: number) {
    await this.findOne(idSede);
    const res = await this.dataSource.query(
      `INSERT INTO cli_equipo
        (id_sede, id_tipo_equipo, nombre, tipo, numero_serie, fecha_adquisicion, estado, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        idSede,
        dto.id_tipo_equipo || null,
        dto.nombre.trim(),
        dto.tipo?.trim() || null,
        dto.numero_serie?.trim() || null,
        dto.fecha_adquisicion || null,
        dto.estado || 'OPERATIVO',
        userId,
      ],
    );
    const id = Number(res.insertId);
    await this.auditoriaService.registrar('cli_equipo', id, 'CREAR', userId, null, dto);
    return { id, message: 'Equipo creado' };
  }

  async updateEquipo(idEquipo: number, dto: UpdateEquipoDto, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_equipo WHERE id_equipo = ? AND estado_registro = 'ACTIVO'`,
      [idEquipo],
    );
    if (!antiguo) throw new NotFoundException('Equipo no encontrado');
    await this.dataSource.query(
      `UPDATE cli_equipo SET
        id_tipo_equipo = COALESCE(?, id_tipo_equipo),
        nombre = COALESCE(?, nombre),
        tipo = COALESCE(?, tipo),
        numero_serie = COALESCE(?, numero_serie),
        fecha_adquisicion = COALESCE(?, fecha_adquisicion),
        estado = COALESCE(?, estado),
        id_usuario_mod = ?
       WHERE id_equipo = ? AND estado_registro = 'ACTIVO'`,
      [
        dto.id_tipo_equipo !== undefined ? dto.id_tipo_equipo : null,
        dto.nombre != null ? dto.nombre.trim() : null,
        dto.tipo !== undefined ? dto.tipo?.trim() || null : null,
        dto.numero_serie !== undefined ? dto.numero_serie?.trim() || null : null,
        dto.fecha_adquisicion !== undefined ? dto.fecha_adquisicion || null : null,
        dto.estado || null,
        userId,
        idEquipo,
      ],
    );
    await this.auditoriaService.registrar('cli_equipo', idEquipo, 'ACTUALIZAR', userId, antiguo, dto);
    return { message: 'Equipo actualizado' };
  }

  async mantenimiento(idEquipo: number, dto: MantenimientoEquipoDto, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_equipo WHERE id_equipo = ? AND estado_registro = 'ACTIVO'`,
      [idEquipo],
    );
    if (!antiguo) throw new NotFoundException('Equipo no encontrado');
    if (!dto.fecha_ultimo_mantenimiento && !dto.proximo_mantenimiento && !dto.estado) {
      throw new BadRequestException('Indique datos de mantenimiento');
    }
    await this.dataSource.query(
      `UPDATE cli_equipo SET
        fecha_ultimo_mantenimiento = COALESCE(?, fecha_ultimo_mantenimiento),
        proximo_mantenimiento = COALESCE(?, proximo_mantenimiento),
        estado = COALESCE(?, estado),
        id_usuario_mod = ?
       WHERE id_equipo = ? AND estado_registro = 'ACTIVO'`,
      [
        dto.fecha_ultimo_mantenimiento || null,
        dto.proximo_mantenimiento || null,
        dto.estado || null,
        userId,
        idEquipo,
      ],
    );
    await this.auditoriaService.registrar('cli_equipo', idEquipo, 'ACTUALIZAR', userId, antiguo, dto);
    return { message: 'Mantenimiento registrado' };
  }

  async listTiposEquipo() {
    return this.dataSource.query(
      `SELECT id_tipo_equipo, nombre, descripcion FROM cli_tipo_equipo WHERE estado_registro = 'ACTIVO' ORDER BY nombre`,
    );
  }
}
