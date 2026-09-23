import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditoriaService } from '@app/common';
import {
  CreateCertificacionDto,
  CreateExcepcionDto,
  CreatePersonalDto,
  ReplaceHorarioDto,
  SyncSedesDto,
  UpdatePersonalDto,
} from './personal.dto';

@Injectable()
export class PersonalService {
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
    const estado = query.estado ? String(query.estado) : null;

    const where: string[] = [`p.estado_registro = 'ACTIVO'`];
    const params: any[] = [];
    if (search) {
      where.push(
        `(p.documento LIKE ? OR p.nombres LIKE ? OR p.apellidos LIKE ? OR p.especialidad LIKE ?)`,
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (estado) {
      where.push(`p.estado = ?`);
      params.push(estado);
    }
    if (idSede) {
      where.push(`EXISTS (
        SELECT 1 FROM cli_personal_sede ps
        WHERE ps.id_personal = p.id_personal AND ps.id_sede = ?
          AND ps.estado_registro = 'ACTIVO'
      )`);
      params.push(idSede);
    }

    const sqlWhere = where.join(' AND ');
    const [countRow] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM cli_personal p WHERE ${sqlWhere}`,
      params,
    );
    const data = await this.dataSource.query(
      `SELECT p.id_personal, p.documento, p.tipo_documento, p.nombres, p.apellidos,
              p.especialidad, p.telefono, p.email, p.id_sede_principal, p.id_usuario, p.estado
       FROM cli_personal p
       WHERE ${sqlWhere}
       ORDER BY p.apellidos ASC, p.nombres ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { data, meta: this.pageMeta(page, limit, Number(countRow?.total || 0)) };
  }

  async findOne(id: number) {
    const [row] = await this.dataSource.query(
      `SELECT * FROM cli_personal WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Personal no encontrado');
    const sedes = await this.dataSource.query(
      `SELECT ps.id_personal_sede, ps.id_sede, ps.es_principal, s.nombre AS sede_nombre
       FROM cli_personal_sede ps
       JOIN cli_sede s ON s.id_sede = ps.id_sede AND s.estado_registro = 'ACTIVO'
       WHERE ps.id_personal = ? AND ps.estado_registro = 'ACTIVO'`,
      [id],
    );
    const especialidades = await this.dataSource.query(
      `SELECT e.id_especialidad, e.codigo, e.nombre
       FROM cli_personal_especialidad pe
       JOIN cli_especialidad e ON e.id_especialidad = pe.id_especialidad AND e.estado_registro = 'ACTIVO'
       WHERE pe.id_personal = ? AND pe.estado_registro = 'ACTIVO'
       ORDER BY e.nombre`,
      [id],
    );
    return { ...row, sedes, especialidades, ids_especialidad: especialidades.map((e: any) => Number(e.id_especialidad)) };
  }

  async listEspecialidades(search?: string) {
    const params: any[] = [];
    let where = `estado_registro = 'ACTIVO'`;
    if (search?.trim()) {
      where += ` AND (nombre LIKE ? OR IFNULL(codigo,'') LIKE ?)`;
      const q = `%${search.trim()}%`;
      params.push(q, q);
    }
    return this.dataSource.query(
      `SELECT id_especialidad, codigo, nombre, descripcion
       FROM cli_especialidad WHERE ${where} ORDER BY nombre ASC`,
      params,
    );
  }

  async createEspecialidad(body: { nombre: string; codigo?: string }, userId: number) {
    const nombre = String(body?.nombre || '').trim().toUpperCase();
    if (!nombre) throw new BadRequestException('Nombre de especialidad requerido');
    const codigo =
      body.codigo?.trim()?.toUpperCase() ||
      nombre.replace(/\s+/g, '_').slice(0, 40);
    const [exists] = await this.dataSource.query(
      `SELECT id_especialidad FROM cli_especialidad
       WHERE UPPER(nombre)=? AND estado_registro='ACTIVO'`,
      [nombre],
    );
    if (exists) return { id: Number(exists.id_especialidad), message: 'Especialidad ya existía' };
    const r = await this.dataSource.query(
      `INSERT INTO cli_especialidad (codigo, nombre, id_usuario_crea) VALUES (?,?,?)`,
      [codigo, nombre, userId],
    );
    return { id: Number(r.insertId), message: 'Especialidad creada' };
  }

  private async syncEspecialidades(
    qr: any,
    idPersonal: number,
    ids: number[],
    userId: number,
  ): Promise<string | null> {
    const unique = [...new Set(ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    await qr.query(
      `UPDATE cli_personal_especialidad SET estado_registro='ELIMINADO', id_usuario_mod=?
       WHERE id_personal=? AND estado_registro='ACTIVO'
         AND id_especialidad NOT IN (${unique.length ? unique.map(() => '?').join(',') : '0'})`,
      unique.length ? [userId, idPersonal, ...unique] : [userId, idPersonal],
    );
    for (const idEsp of unique) {
      const [row] = await qr.query(
        `SELECT id_personal_especialidad, estado_registro FROM cli_personal_especialidad
         WHERE id_personal=? AND id_especialidad=?`,
        [idPersonal, idEsp],
      );
      if (!row) {
        await qr.query(
          `INSERT INTO cli_personal_especialidad (id_personal, id_especialidad, id_usuario_crea)
           VALUES (?,?,?)`,
          [idPersonal, idEsp, userId],
        );
      } else if (row.estado_registro !== 'ACTIVO') {
        await qr.query(
          `UPDATE cli_personal_especialidad SET estado_registro='ACTIVO', id_usuario_mod=?
           WHERE id_personal_especialidad=?`,
          [userId, row.id_personal_especialidad],
        );
      }
    }
    if (!unique.length) return null;
    const nombres = await qr.query(
      `SELECT nombre FROM cli_especialidad
       WHERE id_especialidad IN (${unique.map(() => '?').join(',')}) AND estado_registro='ACTIVO'
       ORDER BY nombre`,
      unique,
    );
    return nombres.map((n: any) => n.nombre).join(', ') || null;
  }

  async create(dto: CreatePersonalDto, userId: number) {
    const documento = String(dto.documento || '').trim();
    const [dup] = await this.dataSource.query(
      `SELECT id_personal FROM cli_personal WHERE documento = ? AND estado_registro = 'ACTIVO'`,
      [documento],
    );
    if (dup) throw new ConflictException('Ya existe personal con ese documento');

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const res = await qr.query(
        `INSERT INTO cli_personal
          (documento, tipo_documento, nombres, apellidos, especialidad, telefono, email,
           id_sede_principal, id_usuario, estado, observaciones, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          documento,
          dto.tipo_documento?.trim() || 'DNI',
          dto.nombres.trim().toUpperCase(),
          dto.apellidos.trim().toUpperCase(),
          dto.especialidad?.trim() || null,
          dto.telefono?.trim() || null,
          dto.email?.trim()?.toLowerCase() || null,
          dto.id_sede_principal || null,
          dto.id_usuario || null,
          dto.estado || 'ACTIVO',
          dto.observaciones?.trim() || null,
          userId,
        ],
      );
      const id = Number(res.insertId);
      const sedes = Array.isArray(dto.sedes) ? dto.sedes.map(Number).filter(Boolean) : [];
      if (dto.id_sede_principal && !sedes.includes(Number(dto.id_sede_principal))) {
        sedes.push(Number(dto.id_sede_principal));
      }
      for (const idSede of sedes) {
        await qr.query(
          `INSERT INTO cli_personal_sede (id_personal, id_sede, es_principal, id_usuario_crea)
           VALUES (?, ?, ?, ?)`,
          [id, idSede, idSede === Number(dto.id_sede_principal) ? 1 : 0, userId],
        );
      }
      const idsEsp = Array.isArray(dto.ids_especialidad) ? dto.ids_especialidad : [];
      const labelEsp = await this.syncEspecialidades(qr, id, idsEsp, userId);
      const espTexto = labelEsp || dto.especialidad?.trim() || null;
      if (espTexto) {
        await qr.query(`UPDATE cli_personal SET especialidad=? WHERE id_personal=?`, [espTexto, id]);
      }
      await qr.commitTransaction();
      await this.auditoriaService.registrar('cli_personal', id, 'CREAR', userId, null, { documento });
      return { id, message: 'Personal creado' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async update(id: number, dto: UpdatePersonalDto, userId: number) {
    const antiguo = await this.findOne(id);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      let espTexto =
        dto.especialidad !== undefined ? dto.especialidad?.trim() || null : undefined;
      if (Array.isArray(dto.ids_especialidad)) {
        espTexto = await this.syncEspecialidades(qr, id, dto.ids_especialidad, userId);
      }
      const res = await qr.query(
        `UPDATE cli_personal SET
          documento = COALESCE(?, documento),
          tipo_documento = COALESCE(?, tipo_documento),
          nombres = COALESCE(?, nombres),
          apellidos = COALESCE(?, apellidos),
          especialidad = COALESCE(?, especialidad),
          telefono = COALESCE(?, telefono),
          email = COALESCE(?, email),
          id_sede_principal = COALESCE(?, id_sede_principal),
          id_usuario = COALESCE(?, id_usuario),
          estado = COALESCE(?, estado),
          observaciones = COALESCE(?, observaciones),
          id_usuario_mod = ?
         WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
        [
          dto.documento != null ? String(dto.documento).trim() : null,
          dto.tipo_documento !== undefined ? dto.tipo_documento?.trim() || 'DNI' : null,
          dto.nombres != null ? dto.nombres.trim().toUpperCase() : null,
          dto.apellidos != null ? dto.apellidos.trim().toUpperCase() : null,
          espTexto !== undefined ? espTexto : null,
          dto.telefono !== undefined ? dto.telefono?.trim() || null : null,
          dto.email !== undefined ? dto.email?.trim()?.toLowerCase() || null : null,
          dto.id_sede_principal !== undefined ? dto.id_sede_principal || null : null,
          dto.id_usuario !== undefined ? dto.id_usuario || null : null,
          dto.estado || null,
          dto.observaciones !== undefined ? dto.observaciones?.trim() || null : null,
          userId,
          id,
        ],
      );
      if (!res.affectedRows) throw new NotFoundException('Personal no encontrado');
      await qr.commitTransaction();
      await this.auditoriaService.registrar('cli_personal', id, 'ACTUALIZAR', userId, antiguo, dto);
      return { message: 'Personal actualizado' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async remove(id: number, userId: number) {
    const antiguo = await this.findOne(id);
    const [futura] = await this.dataSource.query(
      `SELECT id_cita FROM cli_cita
       WHERE id_personal = ? AND estado_registro = 'ACTIVO'
         AND estado NOT IN ('CANCELADA','COMPLETADA','NO_ASISTIO')
         AND fecha_cita >= CURDATE()
       LIMIT 1`,
      [id],
    );
    if (futura) {
      throw new BadRequestException('No se puede eliminar: tiene citas futuras');
    }
    const res = await this.dataSource.query(
      `UPDATE cli_personal SET estado_registro = 'ELIMINADO', estado = 'INACTIVO', id_usuario_mod = ?
       WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
      [userId, id],
    );
    if (!res.affectedRows) throw new NotFoundException('Personal no encontrado');
    await this.auditoriaService.registrar('cli_personal', id, 'ELIMINAR', userId, antiguo, null);
    return { message: 'Personal eliminado' };
  }

  async syncSedes(id: number, dto: SyncSedesDto, userId: number) {
    await this.findOne(id);
    const sedes = (dto.sedes || []).map(Number).filter(Boolean);
    const principal = dto.id_sede_principal ? Number(dto.id_sede_principal) : null;
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE cli_personal_sede SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
         WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
        [userId, id],
      );
      for (const idSede of sedes) {
        await qr.query(
          `INSERT INTO cli_personal_sede (id_personal, id_sede, es_principal, id_usuario_crea)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE es_principal = VALUES(es_principal),
             estado_registro = 'ACTIVO', id_usuario_mod = ?`,
          [id, idSede, principal === idSede ? 1 : 0, userId, userId],
        );
      }
      if (principal) {
        await qr.query(
          `UPDATE cli_personal SET id_sede_principal = ?, id_usuario_mod = ?
           WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
          [principal, userId, id],
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

  async getHorario(id: number) {
    await this.findOne(id);
    return this.dataSource.query(
      `SELECT id_horario_trabajo, id_sede, dia_semana, hora_inicio, hora_fin
       FROM cli_horario_trabajo
       WHERE id_personal = ? AND estado_registro = 'ACTIVO'
       ORDER BY dia_semana, hora_inicio`,
      [id],
    );
  }

  async replaceHorario(id: number, dto: ReplaceHorarioDto, userId: number) {
    await this.findOne(id);
    const items = dto.items || [];
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE cli_horario_trabajo SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
         WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
        [userId, id],
      );
      for (const item of items) {
        if (Number(item.dia_semana) < 0 || Number(item.dia_semana) > 6) {
          throw new BadRequestException('dia_semana inválido (0-6)');
        }
        if (String(item.hora_fin) <= String(item.hora_inicio)) {
          throw new BadRequestException('hora_fin debe ser mayor que hora_inicio');
        }
        await qr.query(
          `INSERT INTO cli_horario_trabajo
            (id_personal, id_sede, dia_semana, hora_inicio, hora_fin, id_usuario_crea)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, Number(item.id_sede), Number(item.dia_semana), item.hora_inicio, item.hora_fin, userId],
        );
      }
      await qr.commitTransaction();
      await this.auditoriaService.registrar('cli_horario_trabajo', id, 'ACTUALIZAR', userId, null, {
        count: items.length,
      });
      return { message: 'Horario reemplazado', count: items.length };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async listExcepciones(id: number) {
    await this.findOne(id);
    return this.dataSource.query(
      `SELECT * FROM cli_excepcion_horario
       WHERE id_personal = ? AND estado_registro = 'ACTIVO'
       ORDER BY fecha DESC`,
      [id],
    );
  }

  async createExcepcion(id: number, dto: CreateExcepcionDto, userId: number) {
    await this.findOne(id);
    if (!dto.fecha) throw new BadRequestException('fecha requerida');
    const res = await this.dataSource.query(
      `INSERT INTO cli_excepcion_horario
        (id_personal, id_sede, fecha, tipo, hora_inicio, hora_fin, motivo, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.id_sede || null,
        dto.fecha,
        dto.tipo || 'DIA_LIBRE',
        dto.hora_inicio || null,
        dto.hora_fin || null,
        dto.motivo?.trim() || null,
        userId,
      ],
    );
    const idEx = Number(res.insertId);
    await this.auditoriaService.registrar('cli_excepcion_horario', idEx, 'CREAR', userId, null, dto);
    return { id: idEx, message: 'Excepción creada' };
  }

  async listCertificaciones(id: number) {
    await this.findOne(id);
    return this.dataSource.query(
      `SELECT pt.id_personal_tratamiento, pt.id_tratamiento, pt.fecha_certificacion,
              pt.fecha_vencimiento, pt.observaciones, t.nombre AS tratamiento_nombre
       FROM cli_personal_tratamiento pt
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento = pt.id_tratamiento AND t.estado_registro = 'ACTIVO'
       WHERE pt.id_personal = ? AND pt.estado_registro = 'ACTIVO'
       ORDER BY t.nombre`,
      [id],
    );
  }

  async createCertificacion(id: number, dto: CreateCertificacionDto, userId: number) {
    await this.findOne(id);
    const idTrat = Number(dto.id_tratamiento);
    if (!idTrat) throw new BadRequestException('id_tratamiento requerido');
    const [trat] = await this.dataSource.query(
      `SELECT id_tratamiento FROM cli_tratamiento WHERE id_tratamiento = ? AND estado_registro = 'ACTIVO'`,
      [idTrat],
    );
    if (!trat) throw new NotFoundException('Tratamiento no encontrado');
    const res = await this.dataSource.query(
      `INSERT INTO cli_personal_tratamiento
        (id_personal, id_tratamiento, fecha_certificacion, fecha_vencimiento, observaciones, id_usuario_crea)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fecha_certificacion = VALUES(fecha_certificacion),
         fecha_vencimiento = VALUES(fecha_vencimiento),
         observaciones = VALUES(observaciones),
         estado_registro = 'ACTIVO',
         id_usuario_mod = ?`,
      [
        id,
        idTrat,
        dto.fecha_certificacion || null,
        dto.fecha_vencimiento || null,
        dto.observaciones?.trim() || null,
        userId,
        userId,
      ],
    );
    const certId = Number(res.insertId) || idTrat;
    await this.auditoriaService.registrar('cli_personal_tratamiento', certId, 'CREAR', userId, null, dto);
    return { message: 'Certificación registrada' };
  }

  async removeCertificacion(idPersonal: number, idCert: number, userId: number) {
    const [antiguo] = await this.dataSource.query(
      `SELECT * FROM cli_personal_tratamiento
       WHERE id_personal_tratamiento = ? AND id_personal = ? AND estado_registro = 'ACTIVO'`,
      [idCert, idPersonal],
    );
    if (!antiguo) throw new NotFoundException('Certificación no encontrada');
    await this.dataSource.query(
      `UPDATE cli_personal_tratamiento SET estado_registro = 'ELIMINADO', id_usuario_mod = ?
       WHERE id_personal_tratamiento = ? AND estado_registro = 'ACTIVO'`,
      [userId, idCert],
    );
    await this.auditoriaService.registrar(
      'cli_personal_tratamiento',
      idCert,
      'ELIMINAR',
      userId,
      antiguo,
      null,
    );
    return { message: 'Certificación eliminada' };
  }

  async disponibilidad(id: number, query: any) {
    await this.findOne(id);
    const fecha = String(query.fecha || '').trim();
    const idSede = query.id_sede ? Number(query.id_sede) : null;
    if (!fecha) throw new BadRequestException('fecha requerida (YYYY-MM-DD)');

    const d = new Date(`${fecha}T12:00:00`);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('fecha inválida');
    const diaSemana = d.getDay();

    const whereHorario = [`id_personal = ?`, `dia_semana = ?`, `estado_registro = 'ACTIVO'`];
    const paramsH: any[] = [id, diaSemana];
    if (idSede) {
      whereHorario.push(`id_sede = ?`);
      paramsH.push(idSede);
    }
    const horarios = await this.dataSource.query(
      `SELECT id_sede, hora_inicio, hora_fin FROM cli_horario_trabajo WHERE ${whereHorario.join(' AND ')}`,
      paramsH,
    );

    const whereEx = [`id_personal = ?`, `fecha = ?`, `estado_registro = 'ACTIVO'`];
    const paramsEx: any[] = [id, fecha];
    if (idSede) {
      whereEx.push(`(id_sede IS NULL OR id_sede = ?)`);
      paramsEx.push(idSede);
    }
    const excepciones = await this.dataSource.query(
      `SELECT id_sede, tipo, hora_inicio, hora_fin, motivo FROM cli_excepcion_horario WHERE ${whereEx.join(' AND ')}`,
      paramsEx,
    );

    const bloqueado = excepciones.some((e: any) => e.tipo === 'DIA_LIBRE' || e.tipo === 'BLOQUEO');
    const whereCita = [
      `id_personal = ?`,
      `fecha_cita = ?`,
      `estado_registro = 'ACTIVO'`,
      `estado NOT IN ('CANCELADA','NO_ASISTIO')`,
    ];
    const paramsC: any[] = [id, fecha];
    if (idSede) {
      whereCita.push(`id_sede = ?`);
      paramsC.push(idSede);
    }
    const citas = await this.dataSource.query(
      `SELECT id_cita, id_sede, hora_inicio, hora_fin, estado
       FROM cli_cita WHERE ${whereCita.join(' AND ')} ORDER BY hora_inicio`,
      paramsC,
    );

    return {
      fecha,
      dia_semana: diaSemana,
      disponible: !bloqueado && horarios.length > 0,
      horarios,
      excepciones,
      citas,
    };
  }
}
