import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { createReadStream, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { dirname, extname, join } from 'path';
import { AuditoriaService } from '../../common/auditoria/auditoria.service';
import { TipoDocumentoDto, UpdateDocumentoDto, UpdateTipoDocumentoDto } from './documentos.dto';

@Injectable()
export class DocumentosService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / Math.max(limit, 1))) };
  }

  /** Raíz configurable; default bajo el proyecto XAMPP */
  getRoot(): string {
    return (
      this.config.get<string>('DOCUMENTOS_ROOT') ||
      join('D:', 'xampp', 'htdocs', 'appClinicaLopez', 'storage', 'ClinicaDigital')
    );
  }

  private pad(n: number, len: number) {
    return String(n).padStart(len, '0');
  }

  /** Código de carpeta seguro (sin espacios ni caracteres raros) */
  sanitizeCodigo(raw: string): string {
    const c = String(raw || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    if (!c || c.length < 2) throw new BadRequestException('Código de tipo inválido');
    return c.slice(0, 60);
  }

  private async nextCorrelativo(fecha: string, qr: any): Promise<number> {
    await qr.query(
      `INSERT INTO cli_documento_serie (fecha, ultimo_correlativo) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE ultimo_correlativo = ultimo_correlativo + 1`,
      [fecha],
    );
    const [row] = await qr.query(
      `SELECT ultimo_correlativo AS n FROM cli_documento_serie WHERE fecha=?`,
      [fecha],
    );
    return Number(row?.n || 1);
  }

  private buildRelativePath(opts: {
    idPaciente: number;
    categoria: string;
    idConsulta: number | null;
    fechaConsulta?: string | Date | null;
    nombreArchivo: string;
  }): string {
    const pac = this.pad(opts.idPaciente, 9);
    const cat = opts.categoria;
    if (opts.idConsulta) {
      const y = opts.fechaConsulta
        ? new Date(opts.fechaConsulta).getFullYear()
        : new Date().getFullYear();
      const att = this.pad(opts.idConsulta, 8);
      return join('PACIENTES', pac, 'ATENCIONES', String(y), att, cat, opts.nombreArchivo).replace(
        /\\/g,
        '/',
      );
    }
    return join('PACIENTES', pac, 'GENERAL', cat, opts.nombreArchivo).replace(/\\/g, '/');
  }

  // ---------- Tipos ----------
  async listTipos(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const offset = (page - 1) * limit;
    const search = String(q.search || '').trim();
    const w = [`estado_registro='ACTIVO'`];
    const params: any[] = [];
    if (search) {
      w.push(`(nombre LIKE ? OR codigo LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`);
    }
    if (q.activo === '1' || q.activo === 1 || q.activo === true) w.push(`activo=1`);
    const where = w.join(' AND ');
    const [[{ total }]] = await Promise.all([
      this.db.query(`SELECT COUNT(*) total FROM cli_tipo_documento WHERE ${where}`, params),
    ]);
    const data = await this.db.query(
      `SELECT * FROM cli_tipo_documento WHERE ${where} ORDER BY nombre LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { data, meta: this.meta(page, limit, Number(total)) };
  }

  async createTipo(d: TipoDocumentoDto, userId: number) {
    const codigo = this.sanitizeCodigo(d.codigo);
    const [exists] = await this.db.query(
      `SELECT id_tipo_documento FROM cli_tipo_documento WHERE codigo=? AND estado_registro='ACTIVO'`,
      [codigo],
    );
    if (exists) throw new BadRequestException('Ya existe un tipo con ese código');
    const r = await this.db.query(
      `INSERT INTO cli_tipo_documento (codigo,nombre,descripcion,extensiones,activo,id_usuario_crea)
       VALUES (?,?,?,?,?,?)`,
      [
        codigo,
        d.nombre.trim(),
        d.descripcion || null,
        d.extensiones || 'pdf,jpg,jpeg,png',
        d.activo === false ? 0 : 1,
        userId,
      ],
    );
    await this.auditoria.registrar('cli_tipo_documento', Number(r.insertId), 'CREAR', userId, null, d);
    return { id: Number(r.insertId), message: 'Tipo creado' };
  }

  async updateTipo(id: number, d: UpdateTipoDocumentoDto, userId: number) {
    const [old] = await this.db.query(
      `SELECT * FROM cli_tipo_documento WHERE id_tipo_documento=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!old) throw new NotFoundException('Tipo no encontrado');
    const codigo = d.codigo != null ? this.sanitizeCodigo(d.codigo) : old.codigo;
    if (codigo !== old.codigo) {
      const [dup] = await this.db.query(
        `SELECT id_tipo_documento FROM cli_tipo_documento
         WHERE codigo=? AND estado_registro='ACTIVO' AND id_tipo_documento<>?`,
        [codigo, id],
      );
      if (dup) throw new BadRequestException('Ya existe un tipo con ese código');
    }
    await this.db.query(
      `UPDATE cli_tipo_documento SET
         codigo=?, nombre=?, descripcion=?, extensiones=?, activo=?, id_usuario_mod=?
       WHERE id_tipo_documento=?`,
      [
        codigo,
        d.nombre != null ? d.nombre.trim() : old.nombre,
        d.descripcion !== undefined ? d.descripcion : old.descripcion,
        d.extensiones !== undefined ? d.extensiones : old.extensiones,
        d.activo !== undefined ? (d.activo ? 1 : 0) : old.activo,
        userId,
        id,
      ],
    );
    await this.auditoria.registrar('cli_tipo_documento', id, 'ACTUALIZAR', userId, old, d);
    return { message: 'Tipo actualizado' };
  }

  async removeTipo(id: number, userId: number) {
    const [old] = await this.db.query(
      `SELECT * FROM cli_tipo_documento WHERE id_tipo_documento=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!old) throw new NotFoundException('Tipo no encontrado');
    const [[{ n }]] = await this.db.query(
      `SELECT COUNT(*) n FROM cli_documento WHERE id_tipo_documento=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (Number(n) > 0) {
      throw new BadRequestException('No se puede eliminar: hay documentos con este tipo');
    }
    await this.db.query(
      `UPDATE cli_tipo_documento SET estado_registro='ELIMINADO', id_usuario_mod=? WHERE id_tipo_documento=?`,
      [userId, id],
    );
    await this.auditoria.registrar('cli_tipo_documento', id, 'ELIMINAR', userId, old, null);
    return { message: 'Tipo eliminado' };
  }

  // ---------- Documentos ----------
  async list(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const offset = (page - 1) * limit;
    const w = [`d.estado_registro='ACTIVO'`];
    const params: any[] = [];
    if (q.id_paciente) {
      w.push(`d.id_paciente=?`);
      params.push(Number(q.id_paciente));
    }
    if (q.id_tipo_documento) {
      w.push(`d.id_tipo_documento=?`);
      params.push(Number(q.id_tipo_documento));
    }
    if (q.id_consulta) {
      w.push(`d.id_consulta=?`);
      params.push(Number(q.id_consulta));
    }
    const search = String(q.search || '').trim();
    if (search) {
      w.push(
        `(d.titulo LIKE ? OR d.nombre_original LIKE ? OR d.nombre_archivo LIKE ? OR CONCAT(p.nombres,' ',p.apellidos) LIKE ?)`,
      );
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const where = w.join(' AND ');
    const [[{ total }]] = await this.db.query(
      `SELECT COUNT(*) total
       FROM cli_documento d
       JOIN cli_paciente p ON p.id_paciente=d.id_paciente
       WHERE ${where}`,
      params,
    );
    const data = await this.db.query(
      `SELECT d.*,
              t.codigo AS tipo_codigo, t.nombre AS tipo_nombre,
              CONCAT(p.nombres,' ',p.apellidos) AS nombre_paciente,
              p.numero_documento,
              c.fecha_consulta, c.motivo_consulta
       FROM cli_documento d
       JOIN cli_tipo_documento t ON t.id_tipo_documento=d.id_tipo_documento
       JOIN cli_paciente p ON p.id_paciente=d.id_paciente
       LEFT JOIN cli_consulta c ON c.id_consulta=d.id_consulta
       WHERE ${where}
       ORDER BY d.id_documento DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );
    return { data, meta: this.meta(page, limit, Number(total)) };
  }

  async findOne(id: number) {
    const [row] = await this.db.query(
      `SELECT d.*,
              t.codigo AS tipo_codigo, t.nombre AS tipo_nombre,
              CONCAT(p.nombres,' ',p.apellidos) AS nombre_paciente
       FROM cli_documento d
       JOIN cli_tipo_documento t ON t.id_tipo_documento=d.id_tipo_documento
       JOIN cli_paciente p ON p.id_paciente=d.id_paciente
       WHERE d.id_documento=? AND d.estado_registro='ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Documento no encontrado');
    return row;
  }

  async upload(file: Express.Multer.File, body: any, userId: number) {
    if (!file?.path && !file?.buffer) {
      throw new BadRequestException('Archivo requerido');
    }
    const idPaciente = Number(body.id_paciente);
    const idTipo = Number(body.id_tipo_documento);
    const idConsulta = body.id_consulta ? Number(body.id_consulta) : null;
    if (!idPaciente || !idTipo) {
      throw new BadRequestException('Paciente y tipo de documento son obligatorios');
    }

    const [pac] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [idPaciente],
    );
    if (!pac) throw new BadRequestException('Paciente no válido');

    const [tipo] = await this.db.query(
      `SELECT * FROM cli_tipo_documento WHERE id_tipo_documento=? AND estado_registro='ACTIVO' AND activo=1`,
      [idTipo],
    );
    if (!tipo) throw new BadRequestException('Tipo de documento no válido');

    let idCita: number | null = body.id_cita ? Number(body.id_cita) : null;
    let fechaConsulta: Date | string | null = null;
    if (idConsulta) {
      const [cons] = await this.db.query(
        `SELECT id_consulta, id_paciente, id_cita, fecha_consulta, estado
         FROM cli_consulta WHERE id_consulta=? AND estado_registro='ACTIVO'`,
        [idConsulta],
      );
      if (!cons) throw new BadRequestException('Atención (consulta) no válida');
      if (Number(cons.id_paciente) !== idPaciente) {
        throw new BadRequestException('La consulta no pertenece al paciente');
      }
      if (cons.estado === 'ANULADA') {
        throw new BadRequestException('No se puede adjuntar a una consulta anulada');
      }
      fechaConsulta = cons.fecha_consulta;
      if (!idCita && cons.id_cita) idCita = Number(cons.id_cita);
    }

    const ext = extname(file.originalname || '').replace('.', '').toLowerCase() || 'bin';
    const allowed = String(tipo.extensiones || 'pdf,jpg,jpeg,png')
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (allowed.length && !allowed.includes(ext)) {
      throw new BadRequestException(`Extensión .${ext} no permitida para este tipo (${allowed.join(', ')})`);
    }

    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd = String(hoy.getDate()).padStart(2, '0');
    const fechaStr = `${yyyy}-${mm}-${dd}`;

    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const corr = await this.nextCorrelativo(fechaStr, qr);
      const nombreArchivo = `${fechaStr}-${this.pad(corr, 5)}.${ext}`;
      const rutaRelativa = this.buildRelativePath({
        idPaciente,
        categoria: tipo.codigo,
        idConsulta,
        fechaConsulta,
        nombreArchivo,
      });
      const absPath = join(this.getRoot(), ...rutaRelativa.split('/'));
      mkdirSync(dirname(absPath), { recursive: true });

      if (file.path) {
        renameSync(file.path, absPath);
      } else if (file.buffer) {
        const { writeFileSync } = await import('fs');
        writeFileSync(absPath, file.buffer);
      }

      const r = await qr.query(
        `INSERT INTO cli_documento
          (id_paciente,id_tipo_documento,id_consulta,id_cita,titulo,nombre_original,nombre_archivo,
           ruta_relativa,mime_type,tamano_bytes,fecha_documento,observaciones,id_usuario_crea)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          idPaciente,
          idTipo,
          idConsulta,
          idCita,
          body.titulo || null,
          file.originalname || nombreArchivo,
          nombreArchivo,
          rutaRelativa,
          file.mimetype || null,
          file.size || null,
          body.fecha_documento || fechaStr,
          body.observaciones || null,
          userId,
        ],
      );
      await qr.commitTransaction();
      const id = Number(r.insertId);
      await this.auditoria.registrar('cli_documento', id, 'CREAR', userId, null, {
        ruta_relativa: rutaRelativa,
        id_paciente: idPaciente,
      });
      return { id, ruta_relativa: rutaRelativa, nombre_archivo: nombreArchivo, message: 'Documento guardado' };
    } catch (e) {
      await qr.rollbackTransaction();
      // limpiar temp si quedó
      if (file?.path && existsSync(file.path)) {
        try {
          unlinkSync(file.path);
        } catch (_) {}
      }
      throw e;
    } finally {
      await qr.release();
    }
  }

  async update(id: number, d: UpdateDocumentoDto, userId: number) {
    const old = await this.findOne(id);
    await this.db.query(
      `UPDATE cli_documento SET
         titulo=COALESCE(?,titulo),
         fecha_documento=COALESCE(?,fecha_documento),
         observaciones=COALESCE(?,observaciones),
         id_tipo_documento=COALESCE(?,id_tipo_documento),
         id_usuario_mod=?
       WHERE id_documento=? AND estado_registro='ACTIVO'`,
      [
        d.titulo ?? null,
        d.fecha_documento ?? null,
        d.observaciones ?? null,
        d.id_tipo_documento ?? null,
        userId,
        id,
      ],
    );
    await this.auditoria.registrar('cli_documento', id, 'ACTUALIZAR', userId, old, d);
    return { message: 'Documento actualizado' };
  }

  async remove(id: number, userId: number) {
    const old = await this.findOne(id);
    await this.db.query(
      `UPDATE cli_documento SET estado_registro='ELIMINADO', id_usuario_mod=? WHERE id_documento=?`,
      [userId, id],
    );
    // No borramos el archivo físico (auditoría / recuperación)
    await this.auditoria.registrar('cli_documento', id, 'ELIMINAR', userId, old, null);
    return { message: 'Documento eliminado' };
  }

  async streamFile(id: number): Promise<{ file: StreamableFile; mime: string; nombre: string }> {
    const doc = await this.findOne(id);
    const abs = join(this.getRoot(), ...String(doc.ruta_relativa).split('/'));
    if (!existsSync(abs)) throw new NotFoundException('Archivo no encontrado en disco');
    const stream = createReadStream(abs);
    return {
      file: new StreamableFile(stream),
      mime: doc.mime_type || 'application/octet-stream',
      nombre: doc.nombre_archivo || doc.nombre_original,
    };
  }

  /** Consultas del paciente para selector de atención */
  async consultasPaciente(idPaciente: number, q: any) {
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 50));
    return this.db.query(
      `SELECT id_consulta, id_cita, fecha_consulta, motivo_consulta, estado
       FROM cli_consulta
       WHERE id_paciente=? AND estado_registro='ACTIVO' AND estado<>'ANULADA'
       ORDER BY fecha_consulta DESC
       LIMIT ?`,
      [idPaciente, limit],
    );
  }
}
