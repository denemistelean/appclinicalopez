import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { UnidadScopeService } from '@app/auth';
import { DataSource } from 'typeorm';

function lunesDe(d: Date): string {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lun=0
  x.setDate(x.getDate() - day);
  return x.toISOString().slice(0, 10);
}

function sumarDias(iso: string, n: number): string {
  const x = new Date(iso + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

function renderPlantilla(cuerpo: string, vars: Record<string, string>): string {
  let out = String(cuerpo || '');
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), v || '');
  }
  return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Saludo según hora de la cita (o hora actual si no hay). */
function saludoPorHora(hora?: string | null): string {
  const m = String(hora || '').match(/^(\d{1,2})/);
  const h = m ? Number(m[1]) : new Date().getHours();
  if (h >= 5 && h < 12) return 'Buenos días';
  if (h >= 12 && h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function primerNombre(pacienteCompleto: string, nombres?: string | null): string {
  const n = String(nombres || '').trim();
  if (n) return n.split(/\s+/)[0];
  const s = String(pacienteCompleto || '').trim();
  // "Apellidos, Nombres" → primer nombre
  const parts = s.split(',');
  if (parts.length > 1) return parts[1].trim().split(/\s+/)[0] || s;
  return s.split(/\s+/)[0] || s;
}

function normalizarWa(raw: string | null | undefined): string {
  return String(raw || '').replace(/\D/g, '');
}

function waMeUrl(telDigits: string, mensaje: string): string | null {
  if (!telDigits) return null;
  let n = telDigits;
  if (n.startsWith('51') && n.length >= 11) {
    /* ok */
  } else if (n.length === 9) {
    n = `51${n}`;
  } else if (n.length === 10 && n.startsWith('0')) {
    n = `51${n.slice(1)}`;
  }
  return `https://wa.me/${n}?text=${encodeURIComponent(mensaje)}`;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly dataSource: DataSource,
    private readonly unidad: UnidadScopeService,
  ) {}

  async resumen(_idSucursal?: number | null) {
    const [usuarios] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_usuario WHERE estado_registro = 'ACTIVO'`,
    );
    const [roles] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_rol WHERE estado_registro = 'ACTIVO'`,
    );
    const [modulos] = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM sis_modulo WHERE estado_registro = 'ACTIVO'`,
    );

    const indicadores = {
      usuarios_activos: Number(usuarios?.total || 0),
      roles: Number(roles?.total || 0),
      modulos: Number(modulos?.total || 0),
    };

    let citas_semana: any[] = [];
    let plantillas: any[] = [];
    try {
      const idUnidad = this.unidad.empresaActiva();
      if (idUnidad) {
        const bloque = await this.citasSemanaYPlantillas(idUnidad);
        citas_semana = bloque.citas;
        plantillas = bloque.plantillas;
      }
    } catch {
      /* sin empresa activa */
    }

    return {
      indicadores,
      sistema: indicadores,
      series: {},
      totales: indicadores,
      citas_semana,
      plantillas_recordatorio: plantillas,
    };
  }

  async citasSemanaYPlantillas(idUnidad?: number) {
    const activa = idUnidad || this.unidad.exigirEmpresa();
    const hoy = new Date();
    const desde = lunesDe(hoy);
    const hasta = sumarDias(desde, 6);
    const citas = await this.dataSource.query(
      `SELECT c.id_cita, DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora, c.estado,
              CONCAT(pa.apellidos, ', ', pa.nombres) AS paciente,
              pa.nombres AS nombres,
              COALESCE(NULLIF(TRIM(pa.telefono_whatsapp), ''), pa.telefono, pa.telefono_alterno) AS telefono,
              pa.telefono_whatsapp,
              pa.telefono AS telefono_fijo,
              COALESCE(t.nombre, tc.nombre, 'Cita') AS tratamiento,
              CONCAT(pe.apellidos, ', ', pe.nombres) AS personal,
              s.nombre AS sede
       FROM cli_cita c
       JOIN cli_paciente pa ON pa.id_paciente = c.id_paciente
       LEFT JOIN cli_personal pe ON pe.id_personal = c.id_personal
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento = c.id_tratamiento
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita = c.id_tipo_cita
       LEFT JOIN cli_sede s ON s.id_sede = c.id_sede
       WHERE c.estado_registro = 'ACTIVO'
         AND c.estado IN ('PENDIENTE', 'CONFIRMADA', 'REPROGRAMADA')
         AND c.fecha_cita BETWEEN ? AND ?
         AND (c.id_unidad = ? OR c.id_sede IN (SELECT id_sede FROM cli_sede WHERE id_unidad = ?))
       ORDER BY c.fecha_cita, c.hora_inicio`,
      [desde, hasta, activa, activa],
    );
    const plantillas = await this.listarPlantillas(activa);
    return {
      desde,
      hasta,
      citas: citas || [],
      plantillas: plantillas || [],
    };
  }

  async listarPlantillas(idUnidad?: number) {
    const activa = idUnidad || this.unidad.exigirEmpresa();
    return this.dataSource.query(
      `SELECT id_plantilla, codigo, nombre, canal, cuerpo, activo
       FROM cli_plantilla_mensaje
       WHERE id_unidad = ? AND estado_registro = 'ACTIVO'
       ORDER BY nombre`,
      [activa],
    );
  }

  async crearPlantilla(dto: any, userId: number) {
    const idUnidad = this.unidad.exigirEmpresa();
    const nombre = String(dto?.nombre || '').trim();
    const cuerpo = String(dto?.cuerpo || '').trim();
    if (!nombre || !cuerpo) throw new BadRequestException('Nombre y cuerpo son obligatorios');
    const codigo =
      String(dto?.codigo || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '')
        .slice(0, 40) || `CUSTOM_${Date.now().toString(36).toUpperCase()}`;
    const canal = ['WHATSAPP', 'SMS', 'COPIAR'].includes(String(dto?.canal || '').toUpperCase())
      ? String(dto.canal).toUpperCase()
      : 'WHATSAPP';
    try {
      const r = await this.dataSource.query(
        `INSERT INTO cli_plantilla_mensaje
           (id_unidad, codigo, nombre, canal, cuerpo, activo, id_usuario_crea)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [idUnidad, codigo, nombre, canal, cuerpo, userId || null],
      );
      return { id_plantilla: Number(r.insertId), message: 'Plantilla guardada' };
    } catch (e: any) {
      if (String(e?.message || '').includes('Duplicate') || e?.code === 'ER_DUP_ENTRY') {
        throw new BadRequestException('Ya existe una plantilla con ese código');
      }
      throw e;
    }
  }

  async actualizarPlantilla(id: number, dto: any) {
    const idUnidad = this.unidad.exigirEmpresa();
    const [old] = await this.dataSource.query(
      `SELECT id_plantilla FROM cli_plantilla_mensaje
       WHERE id_plantilla = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id, idUnidad],
    );
    if (!old) throw new NotFoundException('Plantilla no encontrada');
    const sets: string[] = [];
    const vals: any[] = [];
    if (dto?.nombre != null) {
      sets.push('nombre = ?');
      vals.push(String(dto.nombre).trim());
    }
    if (dto?.cuerpo != null) {
      sets.push('cuerpo = ?');
      vals.push(String(dto.cuerpo).trim());
    }
    if (dto?.canal != null) {
      sets.push('canal = ?');
      vals.push(String(dto.canal).toUpperCase());
    }
    if (dto?.activo != null) {
      sets.push('activo = ?');
      vals.push(dto.activo ? 1 : 0);
    }
    if (!sets.length) return { message: 'Sin cambios' };
    await this.dataSource.query(
      `UPDATE cli_plantilla_mensaje SET ${sets.join(', ')}
       WHERE id_plantilla = ? AND id_unidad = ?`,
      [...vals, id, idUnidad],
    );
    return { message: 'Plantilla actualizada' };
  }

  async eliminarPlantilla(id: number) {
    const idUnidad = this.unidad.exigirEmpresa();
    const r = await this.dataSource.query(
      `UPDATE cli_plantilla_mensaje SET estado_registro = 'ELIMINADO', activo = 0
       WHERE id_plantilla = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id, idUnidad],
    );
    if (!r.affectedRows) throw new NotFoundException('Plantilla no encontrada');
    return { message: 'Plantilla eliminada' };
  }

  private async nombreClinica(idUnidad: number): Promise<string> {
    const [u] = await this.dataSource.query(
      `SELECT codigo, nombre FROM cli_unidad WHERE id_unidad = ?`,
      [idUnidad],
    );
    const codigo = String(u?.codigo || '').toUpperCase();
    if (codigo === 'SORELA') return 'Sorela Medic';
    if (codigo === 'LOPEZ') return 'Clínica López';
    return String(u?.nombre || 'la clínica');
  }

  async previsualizarRecordatorio(dto: {
    id_cita?: number;
    id_plantilla?: number;
    cuerpo?: string;
  }) {
    const idUnidad = this.unidad.exigirEmpresa();
    const idCita = Number(dto?.id_cita || 0);
    if (!idCita) throw new BadRequestException('Indique la cita');
    const [c] = await this.dataSource.query(
      `SELECT c.id_cita, DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora,
              CONCAT(pa.apellidos, ', ', pa.nombres) AS paciente,
              pa.nombres AS nombres,
              COALESCE(NULLIF(TRIM(pa.telefono_whatsapp), ''), pa.telefono, pa.telefono_alterno) AS telefono,
              pa.telefono_whatsapp,
              COALESCE(t.nombre, tc.nombre, 'Cita') AS tratamiento,
              CONCAT(pe.apellidos, ', ', pe.nombres) AS personal,
              s.nombre AS sede
       FROM cli_cita c
       JOIN cli_paciente pa ON pa.id_paciente = c.id_paciente
       LEFT JOIN cli_personal pe ON pe.id_personal = c.id_personal
       LEFT JOIN cli_tratamiento t ON t.id_tratamiento = c.id_tratamiento
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita = c.id_tipo_cita
       LEFT JOIN cli_sede s ON s.id_sede = c.id_sede
       WHERE c.id_cita = ? AND c.estado_registro = 'ACTIVO'
         AND (c.id_unidad = ? OR c.id_sede IN (SELECT id_sede FROM cli_sede WHERE id_unidad = ?))`,
      [idCita, idUnidad, idUnidad],
    );
    if (!c) throw new BadRequestException('Cita no encontrada en la empresa activa');

    let cuerpo = String(dto?.cuerpo || '').trim();
    let plantilla: any = null;
    const idPlantilla = Number(dto?.id_plantilla || 0);
    if (idPlantilla) {
      const [p] = await this.dataSource.query(
        `SELECT id_plantilla, codigo, nombre, canal, cuerpo
         FROM cli_plantilla_mensaje
         WHERE id_plantilla = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
        [idPlantilla, idUnidad],
      );
      if (!p) throw new BadRequestException('Plantilla no encontrada');
      plantilla = p;
      if (!cuerpo) cuerpo = String(p.cuerpo || '');
    }
    if (!cuerpo) {
      cuerpo =
        '{{saludo}} {{nombre}}, le recordamos su cita del día {{fecha}} a las {{hora}} ({{tratamiento}}). Favor de llegar 10 minutos antes. ¡Le esperamos en {{clinica}}!';
    }

    const clinica = await this.nombreClinica(idUnidad);
    const nombre = primerNombre(c.paciente, c.nombres);
    const mensaje = renderPlantilla(cuerpo, {
      saludo: saludoPorHora(c.hora),
      nombre,
      paciente: String(c.paciente || ''),
      fecha: String(c.fecha || ''),
      hora: String(c.hora || ''),
      sede: String(c.sede || ''),
      tratamiento: String(c.tratamiento || ''),
      personal: String(c.personal || ''),
      clinica,
    });
    const tel = normalizarWa(c.telefono || c.telefono_whatsapp);
    const wa = waMeUrl(tel, mensaje);

    // Ojo: el TransformInterceptor global se queda con la propiedad `mensaje`
    // y la mueve a response.message; por eso el texto va en `texto`.
    return {
      cita: c,
      plantilla,
      texto: mensaje,
      telefono_whatsapp: c.telefono_whatsapp || null,
      telefono_usado: tel || null,
      whatsapp_url: wa,
      placeholders: [
        '{{saludo}}',
        '{{nombre}}',
        '{{paciente}}',
        '{{fecha}}',
        '{{hora}}',
        '{{sede}}',
        '{{tratamiento}}',
        '{{personal}}',
        '{{clinica}}',
      ],
    };
  }
}
