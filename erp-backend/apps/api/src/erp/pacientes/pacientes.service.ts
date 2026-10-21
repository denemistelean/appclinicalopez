import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { DataSource } from 'typeorm';
import {
  ContactoEmergenciaDto,
  CreatePacienteDto,
  DocumentoPacienteDto,
  FusionarPacienteDto,
  UpdateContactoEmergenciaDto,
  UpdatePacienteDto,
} from './pacientes.dto';

const PACIENTE_FIELDS = [
  'tipo_documento',
  'numero_documento',
  'nombres',
  'apellidos',
  'fecha_nacimiento',
  'sexo',
  'telefono',
  'telefono_alterno',
  'email',
  'direccion',
  'distrito',
  'ciudad',
  'estado_civil',
  'educacion',
  'ocupacion',
  'religion',
  'identidad_genero',
  'orientacion_sexual',
  'idioma',
  'como_nos_conocio',
  'seguro_salud',
  'numero_seguro',
  'grupo_sanguineo',
  'contacto_emergencia_nombre',
  'contacto_emergencia_telefono',
  'contacto_emergencia_parentesco',
  'contacto_emergencia_direccion',
  'contacto_emergencia_datos',
  'id_sede_registro',
  'observaciones',
  'estado',
] as const;

@Injectable()
export class PacientesService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}
  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }
  private normalizeField(k: string, v: any) {
    if (v === undefined) return undefined;
    if (v === '') return null;
    if (['nombres', 'apellidos'].includes(k) && v) return String(v).trim().toUpperCase();
    if (k === 'email' && v) return String(v).trim().toLowerCase();
    if (k === 'numero_documento' && v) return String(v).trim();
    return v;
  }
  async findAll(q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 10));
    const s = String(q.search || '').trim();
    const where = [`estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (s) {
      const like = `%${s}%`;
      const likeCompact = `%${s.replace(/\s+/g, '')}%`;
      where.push(`(
        numero_documento LIKE ?
        OR REPLACE(numero_documento,' ','') LIKE ?
        OR nombres LIKE ?
        OR apellidos LIKE ?
        OR telefono LIKE ?
        OR CONCAT(IFNULL(nombres,''),' ',IFNULL(apellidos,'')) LIKE ?
        OR CONCAT(IFNULL(apellidos,''),' ',IFNULL(nombres,'')) LIKE ?
      )`);
      p.push(like, likeCompact, like, like, like, like, like);
    }
    const [c] = await this.db.query(
      `SELECT COUNT(*) total FROM cli_paciente WHERE ${where.join(' AND ')}`,
      p,
    );
    const data = await this.db.query(
      `SELECT * FROM cli_paciente WHERE ${where.join(' AND ')}
       ORDER BY apellidos, nombres LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c?.total || 0)) };
  }
  async findOne(id: number) {
    const [r] = await this.db.query(
      `SELECT * FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!r) throw new NotFoundException('Paciente no encontrado');
    return r;
  }

  async create(d: CreatePacienteDto, userId: number) {
    const [dup] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE numero_documento=?`,
      [d.numero_documento.trim()],
    );
    if (dup) throw new ConflictException('Documento ya registrado');
    const r = await this.db.query(
      `INSERT INTO cli_paciente
        (tipo_documento, numero_documento, nombres, apellidos, fecha_nacimiento, sexo,
         telefono, telefono_alterno, email, direccion, distrito, ciudad,
         estado_civil, educacion, ocupacion, religion, identidad_genero, orientacion_sexual,
         idioma, como_nos_conocio, seguro_salud, numero_seguro, grupo_sanguineo,
         contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_parentesco,
         contacto_emergencia_direccion, contacto_emergencia_datos,
         id_sede_registro, observaciones, estado, id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.tipo_documento || 'DNI',
        d.numero_documento.trim(),
        d.nombres.trim().toUpperCase(),
        d.apellidos.trim().toUpperCase(),
        d.fecha_nacimiento || null,
        d.sexo || null,
        d.telefono || null,
        d.telefono_alterno || null,
        d.email?.toLowerCase() || null,
        d.direccion || null,
        d.distrito || null,
        d.ciudad || null,
        d.estado_civil || null,
        d.educacion || null,
        d.ocupacion || null,
        d.religion || null,
        d.identidad_genero || null,
        d.orientacion_sexual || null,
        d.idioma || null,
        d.como_nos_conocio || null,
        d.seguro_salud || null,
        d.numero_seguro || null,
        d.grupo_sanguineo || null,
        d.contacto_emergencia_nombre || null,
        d.contacto_emergencia_telefono || null,
        d.contacto_emergencia_parentesco || null,
        d.contacto_emergencia_direccion || null,
        d.contacto_emergencia_datos || null,
        d.id_sede_registro || null,
        d.observaciones || null,
        d.estado || 'ACTIVO',
        userId,
      ],
    );
    const id = Number(r.insertId);
    await this.auditoria.registrar('cli_paciente', id, 'CREAR', userId, null, d);
    return { id, message: 'Paciente creado' };
  }

  async update(id: number, d: UpdatePacienteDto, userId: number) {
    const old = await this.findOne(id);
    const fields = Object.keys(d).filter((k) =>
      (PACIENTE_FIELDS as readonly string[]).includes(k),
    );
    if (!fields.length) return { message: 'Sin cambios' };
    const vals = fields.map((k) => this.normalizeField(k, (d as any)[k]));
    const r = await this.db.query(
      `UPDATE cli_paciente SET ${fields.map((k) => `${k}=?`).join(',')}, id_usuario_mod=?
       WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [...vals, userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Paciente no encontrado');
    await this.auditoria.registrar('cli_paciente', id, 'ACTUALIZAR', userId, old, d);
    return { message: 'Paciente actualizado' };
  }

  async listContactosEmergencia(id: number) {
    await this.findOne(id);
    return this.db.query(
      `SELECT * FROM cli_paciente_contacto_emergencia
       WHERE id_paciente=? AND estado_registro='ACTIVO'
       ORDER BY id_paciente_contacto_emergencia DESC`,
      [id],
    );
  }

  async addContactoEmergencia(id: number, d: ContactoEmergenciaDto, userId: number) {
    await this.findOne(id);
    const nombre = String(d.nombre || '').trim();
    if (!nombre) throw new BadRequestException('Nombre del contacto requerido');
    const r = await this.db.query(
      `INSERT INTO cli_paciente_contacto_emergencia
        (id_paciente, nombre, parentesco, telefono, direccion, datos_adicionales, id_usuario_crea)
       VALUES (?,?,?,?,?,?,?)`,
      [
        id,
        nombre,
        d.parentesco?.trim() || null,
        d.telefono?.trim() || null,
        d.direccion?.trim() || null,
        d.datos_adicionales?.trim() || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Contacto agregado' };
  }

  async updateContactoEmergencia(
    idPaciente: number,
    idContacto: number,
    d: UpdateContactoEmergenciaDto,
    userId: number,
  ) {
    await this.findOne(idPaciente);
    const [old] = await this.db.query(
      `SELECT * FROM cli_paciente_contacto_emergencia
       WHERE id_paciente_contacto_emergencia=? AND id_paciente=? AND estado_registro='ACTIVO'`,
      [idContacto, idPaciente],
    );
    if (!old) throw new NotFoundException('Contacto no encontrado');
    await this.db.query(
      `UPDATE cli_paciente_contacto_emergencia SET
         nombre=COALESCE(?, nombre),
         parentesco=COALESCE(?, parentesco),
         telefono=COALESCE(?, telefono),
         direccion=COALESCE(?, direccion),
         datos_adicionales=COALESCE(?, datos_adicionales),
         id_usuario_mod=?
       WHERE id_paciente_contacto_emergencia=? AND estado_registro='ACTIVO'`,
      [
        d.nombre != null ? String(d.nombre).trim() : null,
        d.parentesco !== undefined ? d.parentesco?.trim() || null : null,
        d.telefono !== undefined ? d.telefono?.trim() || null : null,
        d.direccion !== undefined ? d.direccion?.trim() || null : null,
        d.datos_adicionales !== undefined ? d.datos_adicionales?.trim() || null : null,
        userId,
        idContacto,
      ],
    );
    return { message: 'Contacto actualizado' };
  }

  async removeContactoEmergencia(idPaciente: number, idContacto: number, userId: number) {
    await this.findOne(idPaciente);
    const r = await this.db.query(
      `UPDATE cli_paciente_contacto_emergencia SET estado_registro='ELIMINADO', id_usuario_mod=?
       WHERE id_paciente_contacto_emergencia=? AND id_paciente=? AND estado_registro='ACTIVO'`,
      [userId, idContacto, idPaciente],
    );
    if (!r.affectedRows) throw new NotFoundException('Contacto no encontrado');
    return { message: 'Contacto eliminado' };
  }
  async remove(id:number,userId:number){const old=await this.findOne(id);await this.db.query(`UPDATE cli_paciente SET estado_registro='ELIMINADO',estado='INACTIVO',id_usuario_mod=? WHERE id_paciente=?`,[userId,id]);await this.auditoria.registrar('cli_paciente',id,'ELIMINAR',userId,old,null);return{message:'Paciente eliminado'};}
  async duplicados(q:any){const nombre=String(q.nombre||'').trim(),documento=String(q.documento||'').trim(),telefono=String(q.telefono||'').trim();if(!nombre&&!documento&&!telefono)throw new BadRequestException('Indique nombre, documento o teléfono');return this.db.query(`SELECT * FROM cli_paciente WHERE estado_registro='ACTIVO' AND ((?<>'' AND numero_documento=?) OR (?<>'' AND telefono=?) OR (?<>'' AND CONCAT(nombres,' ',apellidos) LIKE ?)) ORDER BY apellidos,nombres`,[documento,documento,telefono,telefono,nombre,`%${nombre}%`]);}
  async fusionar(d:FusionarPacienteDto,userId:number){if(d.id_sobreviviente===d.id_duplicado)throw new BadRequestException('Los pacientes deben ser distintos');await this.findOne(d.id_sobreviviente);const dup=await this.findOne(d.id_duplicado);const qr=this.db.createQueryRunner();await qr.connect();await qr.startTransaction();try{const tablas=['cli_documento_paciente','cli_paciente_medida','cli_paciente_funcion_vital','cli_paciente_vacuna','cli_paciente_antecedente_patologico','cli_paciente_antecedente_personal','cli_paciente_antecedente_quirurgico','cli_paciente_antecedente_familiar','cli_paciente_alergia_ram','cli_paciente_medicacion_habitual','cli_paciente_embarazo','cli_cita','cli_lista_espera','cli_paciente_paquete','cli_consulta','cli_consentimiento','cli_foto_evolucion','cli_cotizacion','cli_pago','cli_notificacion'];for(const t of tablas)await qr.query(`UPDATE ${t} SET id_paciente=?,id_usuario_mod=? WHERE id_paciente=? AND estado_registro='ACTIVO'`,[d.id_sobreviviente,userId,d.id_duplicado]);await qr.query(`UPDATE cli_paciente SET estado='FUSIONADO',id_paciente_fusionado=?,estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_paciente=?`,[d.id_sobreviviente,userId,d.id_duplicado]);await qr.commitTransaction();await this.auditoria.registrar('cli_paciente',d.id_duplicado,'ACTUALIZAR',userId,dup,{estado:'FUSIONADO',id_sobreviviente:d.id_sobreviviente});return{message:'Pacientes fusionados',id_paciente:d.id_sobreviviente};}catch(e){await qr.rollbackTransaction();throw e;}finally{await qr.release();}}
  async documentos(id:number){await this.findOne(id);return this.db.query(`SELECT * FROM cli_documento_paciente WHERE id_paciente=? AND estado_registro='ACTIVO' ORDER BY fecha_documento DESC,id_documento_paciente DESC`,[id]);}
  async addDocumento(id:number,d:DocumentoPacienteDto,userId:number){await this.findOne(id);const r=await this.db.query(`INSERT INTO cli_documento_paciente (id_paciente,tipo_documento,nombre_archivo,ruta_archivo,mime_type,tamano_bytes,fecha_documento,observaciones,id_usuario_crea) VALUES (?,?,?,?,?,?,?,?,?)`,[id,d.tipo_documento,d.nombre_archivo,d.ruta_archivo,d.mime_type||null,d.tamano_bytes||null,d.fecha_documento||null,d.observaciones||null,userId]);return{id:Number(r.insertId),message:'Documento agregado'};}
  async removeDocumento(id:number,userId:number){const r=await this.db.query(`UPDATE cli_documento_paciente SET estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_documento_paciente=? AND estado_registro='ACTIVO'`,[userId,id]);if(!r.affectedRows)throw new NotFoundException('Documento no encontrado');return{message:'Documento eliminado'};}
  async resumen(id:number){const paciente=await this.findOne(id);const [[citas],[consultas],[pagos]]=await Promise.all([this.db.query(`SELECT COUNT(*) total,MAX(fecha_cita) ultima FROM cli_cita WHERE id_paciente=? AND estado_registro='ACTIVO'`,[id]),this.db.query(`SELECT COUNT(*) total,MAX(fecha_consulta) ultima FROM cli_consulta WHERE id_paciente=? AND estado_registro='ACTIVO'`,[id]),this.db.query(`SELECT COALESCE(SUM(monto),0) total FROM cli_pago WHERE id_paciente=? AND estado='REGISTRADO' AND estado_registro='ACTIVO'`,[id])]);return{paciente,citas,consultas,pagos};}
}
