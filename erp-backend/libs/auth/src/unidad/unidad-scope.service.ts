import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { unidadAls, UnidadActiva } from './unidad-contexto';
import {
  exigirMismaEmpresa,
  exigirOperaFinanzas,
  unidadDesdeSede,
} from './unidad-atribucion';

export interface SedeEmpresa {
  id_sede: number;
  id_unidad: number;
  opera_finanzas: number;
}

export interface MembresiaEmpresa {
  id_unidad: number;
  id_rol: number;
  opera_finanzas: number;
  requiere_comprobante?: number;
  codigo: string;
  nombre: string;
  /** Presente cuando el listado se sintetiza para OMNI_ADMINISTRADOR */
  omni?: boolean;
}

export interface FiltroSql {
  sql: string;
  params: any[];
}

@Injectable()
export class UnidadScopeService {
  constructor(@InjectDataSource('APP_DB_CONN') private readonly db: DataSource) {}

  empresaActiva(): number | undefined {
    return unidadAls.getStore()?.idUnidad;
  }

  /** Contexto ya resuelto por membresía. Su ausencia no abre el acceso a todas las empresas. */
  exigirEmpresa(): number {
    const id = this.empresaActiva();
    if (id == null) throw new ForbiddenException('No tiene una empresa asignada');
    return id;
  }

  contexto(): UnidadActiva | undefined {
    return unidadAls.getStore();
  }

  async membresiasDe(userId: number): Promise<MembresiaEmpresa[]> {
    const omni = await this.rolOmniDe(userId);
    if (omni) {
      const units = await this.db.query(
        `SELECT id_unidad, opera_finanzas, requiere_comprobante, codigo, nombre
         FROM cli_unidad
         WHERE estado_registro = 'ACTIVO' AND estado = 'ACTIVA'
         ORDER BY nombre`,
      );
      return (units || []).map((r: any) => ({
        id_unidad: Number(r.id_unidad),
        id_rol: omni.id_rol,
        opera_finanzas: Number(r.opera_finanzas || 0),
        requiere_comprobante: Number(r.requiere_comprobante || 0),
        codigo: String(r.codigo),
        nombre: String(r.nombre),
        omni: true,
      }));
    }
    const rows = await this.db.query(
      `SELECT m.id_unidad, m.id_rol, u.opera_finanzas, u.requiere_comprobante, u.codigo, u.nombre
       FROM cli_usuario_unidad m
       JOIN cli_unidad u ON u.id_unidad = m.id_unidad
       WHERE m.id_usuario = ?
         AND m.estado_registro = 'ACTIVO'
         AND u.estado_registro = 'ACTIVO'
         AND u.estado = 'ACTIVA'
       ORDER BY u.nombre`,
      [userId],
    );
    return (rows || []).map((r: any) => ({
      id_unidad: Number(r.id_unidad),
      id_rol: Number(r.id_rol),
      opera_finanzas: Number(r.opera_finanzas),
      requiere_comprobante: Number(r.requiere_comprobante || 0),
      codigo: String(r.codigo),
      nombre: String(r.nombre),
    }));
  }

  /**
   * Una sola membresía y sin encabezado: esa empresa.
   * Varias membresías y sin encabezado: 400.
   * Empresa inexistente o sin membresía activa: 403.
   * OMNI_ADMINISTRADOR: cualquier unidad ACTIVA vía X-Unidad-Id, sin fila en cli_usuario_unidad.
   * Su roleId efectivo es el de OMNI (permisos = ADMIN_CLINICA + acciones especiales).
   */
  async resolver(userId: number, headerRaw: unknown): Promise<UnidadActiva> {
    const omni = await this.rolOmniDe(userId);
    const pedida = this.parseHeader(headerRaw);
    if (omni) {
      const unidades = await this.membresiasDe(userId);
      let elegida: MembresiaEmpresa;
      if (pedida == null) {
        if (unidades.length === 1) elegida = unidades[0];
        else if (unidades.length === 0) {
          throw new ForbiddenException('No hay empresas activas');
        } else {
          throw new BadRequestException('Indique la empresa activa');
        }
      } else {
        const found = unidades.find((m) => m.id_unidad === pedida);
        if (!found) throw new ForbiddenException('La empresa no existe o está inactiva');
        elegida = found;
      }
      return {
        idUnidad: elegida.id_unidad,
        roleId: omni.id_rol,
        operaFinanzas: elegida.opera_finanzas,
        requiereComprobante: Number(elegida.requiere_comprobante || 0),
        omni: true,
      };
    }

    const membresias = await this.membresiasDe(userId);
    let elegida: MembresiaEmpresa;
    if (pedida == null) {
      if (membresias.length === 1) elegida = membresias[0];
      else if (membresias.length === 0) {
        throw new ForbiddenException('No tiene una empresa asignada');
      } else {
        throw new BadRequestException('Indique la empresa activa');
      }
    } else {
      const found = membresias.find((m) => m.id_unidad === pedida);
      if (!found) throw new ForbiddenException('No tiene acceso a esta empresa');
      elegida = found;
    }
    return {
      idUnidad: elegida.id_unidad,
      roleId: elegida.id_rol,
      operaFinanzas: elegida.opera_finanzas,
      requiereComprobante: Number(elegida.requiere_comprobante || 0),
    };
  }

  /**
   * OMNI si el rol global del usuario o alguna membresía activa es OMNI_ADMINISTRADOR.
   * Riesgo: un usuario OMNI puede operar cualquier unidad sin membresía auditada por fila;
   * asignar el rol solo a cuentas de confianza.
   */
  private async rolOmniDe(userId: number): Promise<{ id_rol: number } | null> {
    const [row] = await this.db.query(
      `SELECT r.id_rol
       FROM sis_rol r
       WHERE r.nombre = 'OMNI_ADMINISTRADOR' AND r.estado_registro = 'ACTIVO'
         AND (
           EXISTS (
             SELECT 1 FROM sis_usuario u
             WHERE u.id_usuario = ? AND u.id_rol = r.id_rol AND u.estado_registro = 'ACTIVO'
           )
           OR EXISTS (
             SELECT 1 FROM cli_usuario_unidad m
             WHERE m.id_usuario = ? AND m.id_rol = r.id_rol AND m.estado_registro = 'ACTIVO'
           )
         )
       LIMIT 1`,
      [userId, userId],
    );
    return row ? { id_rol: Number(row.id_rol) } : null;
  }

  async leerSede(idSede: number): Promise<SedeEmpresa> {
    const [row] = await this.db.query(
      `SELECT s.id_sede, s.id_unidad, u.opera_finanzas
       FROM cli_sede s
       LEFT JOIN cli_unidad u
         ON u.id_unidad = s.id_unidad AND u.estado_registro = 'ACTIVO'
       WHERE s.id_sede = ? AND s.estado_registro = 'ACTIVO'`,
      [idSede],
    );
    if (!row) throw new BadRequestException('La sede no existe o no tiene empresa asignada');
    const idUnidad = unidadDesdeSede(row.id_unidad);
    return {
      id_sede: Number(row.id_sede),
      id_unidad: idUnidad,
      opera_finanzas: Number(row.opera_finanzas ?? 0),
    };
  }

  /** La sede existe, tiene empresa, y coincide con la empresa activa cuando hay contexto. */
  async exigirSede(idSede: number, idUnidadCliente?: unknown): Promise<SedeEmpresa> {
    void idUnidadCliente;
    const sede = await this.leerSede(idSede);
    const activa = this.exigirEmpresa();
    if (sede.id_unidad !== activa) {
      throw new ForbiddenException('La sede no pertenece a la empresa activa');
    }
    return sede;
  }

  exigirFinanzasDe(operaFinanzas: number): void {
    exigirOperaFinanzas(operaFinanzas);
  }

  exigirCambio(idUnidadActual: number | null | undefined, idUnidadDestino: number): void {
    exigirMismaEmpresa(idUnidadActual, idUnidadDestino);
  }

  /** Registro con columna id_unidad. Si está vacía, se usa la sede; si tampoco hay sede, 403. */
  async exigirRegistro(
    idUnidad: number | null | undefined,
    idSede?: number | null,
  ): Promise<void> {
    const activa = this.exigirEmpresa();
    let unidad = idUnidad == null ? null : Number(idUnidad);
    if (unidad == null && idSede) {
      const sede = await this.leerSede(Number(idSede));
      unidad = sede.id_unidad;
    }
    if (unidad == null || unidad !== activa) {
      throw new ForbiddenException('El registro no pertenece a la empresa activa');
    }
  }

  /**
   * Documento, foto, mapa o consentimiento: la empresa se deriva del padre clínico.
   * Sin cita ni consulta, el archivo pertenece a la empresa de registro del paciente.
   * La ausencia de padre no lo vuelve compartido. Si esa empresa no se puede
   * determinar, el acceso se rechaza.
   */
  async exigirOrigen(
    row: {
      id_consulta?: number | null;
      id_cita?: number | null;
      id_sede?: number | null;
      id_paciente?: number | null;
    },
    opts: { sede?: boolean; suelto: 'registro' },
  ): Promise<void> {
    void opts.suelto;
    const activa = this.exigirEmpresa();
    if (row.id_consulta) {
      const [c] = await this.db.query(
        `SELECT id_unidad FROM cli_consulta WHERE id_consulta=?`,
        [row.id_consulta],
      );
      this.coincidir(c?.id_unidad, activa);
      return;
    }
    if (row.id_cita) {
      const [c] = await this.db.query(
        `SELECT id_unidad FROM cli_cita WHERE id_cita=?`,
        [row.id_cita],
      );
      this.coincidir(c?.id_unidad, activa);
      return;
    }
    if (opts.sede && row.id_sede) {
      const sede = await this.leerSede(Number(row.id_sede));
      this.coincidir(sede.id_unidad, activa);
      return;
    }
    if (!row.id_paciente) {
      throw new BadRequestException('El registro no tiene empresa ni registro padre para autorizarlo');
    }
    const [p] = await this.db.query(
      `SELECT id_unidad_registro FROM cli_paciente WHERE id_paciente=?`,
      [row.id_paciente],
    );
    if (p?.id_unidad_registro == null) {
      throw new BadRequestException('El registro no tiene empresa ni registro padre para autorizarlo');
    }
    this.coincidir(p.id_unidad_registro, activa);
  }

  /**
   * Historia longitudinal (sin id_unidad en subtablas) sobre ficha demográfica compartida.
   * Cualquier empresa activa puede abrir/registrar antecedentes del mismo paciente
   * (p. ej. creado en Sorela y atendido en López). Citas/pagos/docs con padre siguen
   * aislados por empresa; no reescribe id_unidad_registro.
   */
  async exigirHistoriaPaciente(idPaciente: number): Promise<void> {
    this.exigirEmpresa();
    const [p] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente WHERE id_paciente=? AND estado_registro='ACTIVO'`,
      [idPaciente],
    );
    if (!p) throw new NotFoundException('Paciente no encontrado');
  }

  async exigirPersonal(idPersonal: number, idSedePrincipal: number | null): Promise<void> {
    const activa = this.exigirEmpresa();
    const [hit] = await this.db.query(
      `SELECT 1 AS ok
       FROM cli_sede s
       WHERE s.id_unidad = ? AND s.estado_registro = 'ACTIVO'
         AND (
           s.id_sede = ?
           OR EXISTS (
             SELECT 1 FROM cli_personal_sede ps
             WHERE ps.id_personal = ? AND ps.id_sede = s.id_sede
               AND ps.estado_registro = 'ACTIVO'
           )
         )
       LIMIT 1`,
      [activa, idSedePrincipal || 0, idPersonal],
    );
    if (!hit) throw new ForbiddenException('El registro no pertenece a la empresa activa');
  }

  sqlEmpresa(colUnidad: string, colSede?: string): FiltroSql {
    const id = this.exigirEmpresa();
    if (!colSede) return { sql: `${colUnidad} = ?`, params: [id] };
    return {
      sql: `(${colUnidad} = ? OR (${colUnidad} IS NULL AND EXISTS (
        SELECT 1 FROM cli_sede su WHERE su.id_sede = ${colSede} AND su.id_unidad = ?
      )))`,
      params: [id, id],
    };
  }

  sqlPorSede(colSede: string): FiltroSql {
    const id = this.exigirEmpresa();
    return {
      sql: `EXISTS (SELECT 1 FROM cli_sede su WHERE su.id_sede = ${colSede} AND su.id_unidad = ?)`,
      params: [id],
    };
  }

  sqlOrigen(
    alias: string,
    opts: { consulta?: boolean; cita?: boolean; sede?: boolean; suelto: 'registro' },
  ): FiltroSql {
    void opts.suelto;
    const id = this.exigirEmpresa();
    const parts: string[] = [];
    const params: any[] = [];
    const consulta = opts.consulta !== false;
    const cita = opts.cita !== false;
    if (consulta) {
      parts.push(
        `EXISTS (SELECT 1 FROM cli_consulta cu WHERE cu.id_consulta = ${alias}.id_consulta AND cu.id_unidad = ?)`,
      );
      params.push(id);
    }
    if (cita) {
      const guard = consulta ? `${alias}.id_consulta IS NULL AND ` : '';
      parts.push(
        `(${guard}EXISTS (SELECT 1 FROM cli_cita ci WHERE ci.id_cita = ${alias}.id_cita AND ci.id_unidad = ?))`,
      );
      params.push(id);
    }
    if (opts.sede) {
      const vacios = [
        consulta ? `${alias}.id_consulta IS NULL` : null,
        cita ? `${alias}.id_cita IS NULL` : null,
      ].filter(Boolean);
      const guard = vacios.length ? `${vacios.join(' AND ')} AND ` : '';
      parts.push(
        `(${guard}EXISTS (SELECT 1 FROM cli_sede se WHERE se.id_sede = ${alias}.id_sede AND se.id_unidad = ?))`,
      );
      params.push(id);
    }
    const suelto = [
      consulta ? `${alias}.id_consulta IS NULL` : null,
      cita ? `${alias}.id_cita IS NULL` : null,
      opts.sede ? `${alias}.id_sede IS NULL` : null,
    ].filter(Boolean);
    parts.push(
      `(${suelto.join(' AND ')} AND EXISTS (
        SELECT 1 FROM cli_paciente px
        WHERE px.id_paciente = ${alias}.id_paciente AND px.id_unidad_registro = ?
      ))`,
    );
    params.push(id);
    return { sql: `(${parts.join(' OR ')})`, params };
  }

  sqlPersonal(): FiltroSql {
    const id = this.exigirEmpresa();
    return {
      sql: `(
        EXISTS (SELECT 1 FROM cli_sede s WHERE s.id_sede = p.id_sede_principal AND s.id_unidad = ?)
        OR EXISTS (
          SELECT 1 FROM cli_personal_sede ps
          JOIN cli_sede s ON s.id_sede = ps.id_sede
          WHERE ps.id_personal = p.id_personal AND ps.estado_registro = 'ACTIVO' AND s.id_unidad = ?
        )
      )`,
      params: [id, id],
    };
  }

  private coincidir(actual: number | null | undefined, esperada: number): void {
    if (actual == null || Number(actual) !== Number(esperada)) {
      throw new ForbiddenException('El registro no pertenece a la empresa activa');
    }
  }

  private parseHeader(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = String(value).trim();
    if (!text) return null;
    if (!/^\d+$/.test(text)) throw new BadRequestException('Empresa activa inválida');
    return Number(text);
  }
}
