import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UnidadScopeService } from '@app/auth';
import { AuditoriaService } from '../../common/auditoria/auditoria.service';
import { AgendaService } from '../agenda/agenda.service';
import { opcionesTipoPago, redondearMonto, resolverTipoPago } from './pago-tipo';
import { fechaSugeridaDesde, planTieneSesionesPendientes } from './sesiones-pendientes';
import {
  decidirSyncVinculo,
  numeroSiguienteConAbiertas,
  numerosEfectivosPlan,
  ResultadoDescuento,
} from './cita-sesion-sync';

const PROCEDENCIAS = new Set([
  'INSTAGRAM',
  'FACEBOOK',
  'GOOGLE',
  'WHATSAPP',
  'REFERIDO_CLINICA',
  'REFERIDO_PACIENTE',
  'OTRO',
]);

const METODOS_PAGO = new Set(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'YAPE', 'PLIN', 'OTRO']);

@Injectable()
export class HistoriaDigitalService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly unidad: UnidadScopeService,
    private readonly agenda: AgendaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async ficha(idPaciente: number, userId: number) {
    const idUnidad = await this.exigirSorela();
    const paciente = await this.paciente(idPaciente);
    const historia = await this.asegurar(idUnidad, idPaciente, userId);
    const [evaluaciones, cirugias, paquetes, documentos, tipos, citas, pagos, catalogo] =
      await Promise.all([
        this.evaluacionesDe(historia.id_historia_digital),
        this.cirugiasDe(historia.id_historia_digital),
        this.paquetesDe(historia.id_historia_digital, { incluirHistorial: true }),
        this.documentosDe(idPaciente),
        this.tiposDocumento(),
        this.citasDe(idUnidad, idPaciente),
        this.pagosDe(idUnidad, idPaciente),
        this.catalogoPaquetes(idUnidad),
      ]);
    const personal = await this.personalActivo();
    await this.adjuntarPaquetes(paquetes);
    await this.adjuntarBajas(paquetes);
    this.atribuirPagos(paquetes, pagos);
    const vigentes = paquetes.filter((p) => String(p.estado_registro) === 'ACTIVO');
    const comprometido = vigentes.length
      ? vigentes.reduce((s, p) => s + Number(p.precio_acordado || 0), 0)
      : citas.reduce((s, c) => s + Number(c.precio_acordado || 0), 0);
    const pagadoVigente = pagos
      .filter((x) => vigentes.some((p) => Number(p.id_hd_paquete) === Number(x.id_hd_paquete)))
      .reduce((s, p) => s + Number(p.monto || 0), 0);
    const pagado = pagos.reduce((s, p) => s + Number(p.monto || 0), 0);
    return {
      paciente,
      historia,
      evaluaciones,
      cirugias,
      paquetes,
      documentos,
      tipos,
      citas,
      pagos,
      catalogo,
      personal,
      resumen: {
        comprometido: redondear(comprometido),
        pagado: redondear(pagado),
        saldo: redondear(comprometido - pagadoVigente),
        sesiones_pendientes: vigentes.reduce((s, p) => s + pendientesPaquete(p), 0),
      },
      historial: this.armarHistorial(evaluaciones, cirugias, citas),
    };
  }

  async guardar(idPaciente: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    await this.paciente(idPaciente);
    const historia = await this.asegurar(idUnidad, idPaciente, userId);
    const nombres = texto(dto?.nombres).toUpperCase();
    const apellidos = texto(dto?.apellidos).toUpperCase();
    const documento = texto(dto?.numero_documento);
    if (!nombres || !apellidos || !documento) {
      throw new BadRequestException('Indique documento, nombres y apellidos.');
    }
    const [dup] = await this.db.query(
      `SELECT id_paciente FROM cli_paciente
       WHERE numero_documento = ? AND id_paciente <> ? AND estado_registro = 'ACTIVO'`,
      [documento, idPaciente],
    );
    if (dup) throw new BadRequestException('Ese documento ya pertenece a otro paciente.');

    const procedencia = texto(dto?.procedencia).toUpperCase();
    if (procedencia && !PROCEDENCIAS.has(procedencia)) {
      throw new BadRequestException('La procedencia no es válida.');
    }

    await this.db.query(
      `UPDATE cli_paciente SET
         tipo_documento = ?, numero_documento = ?, nombres = ?, apellidos = ?,
         fecha_nacimiento = ?, ocupacion = ?, telefono = ?, telefono_alterno = ?,
         email = ?, direccion = ?,
         contacto_emergencia_nombre = ?, contacto_emergencia_telefono = ?,
         contacto_emergencia_parentesco = ?, id_usuario_mod = ?
       WHERE id_paciente = ?`,
      [
        texto(dto?.tipo_documento) || 'DNI',
        documento,
        nombres,
        apellidos,
        fechaONull(dto?.fecha_nacimiento),
        texto(dto?.ocupacion) || null,
        texto(dto?.telefono) || null,
        texto(dto?.telefono_alterno) || null,
        texto(dto?.email).toLowerCase() || null,
        texto(dto?.direccion) || null,
        texto(dto?.contacto_emergencia_nombre) || null,
        texto(dto?.contacto_emergencia_telefono) || null,
        texto(dto?.contacto_emergencia_parentesco) || null,
        userId,
        idPaciente,
      ],
    );

    await this.db.query(
      `UPDATE cli_historia_digital SET
         procedencia = ?, detalle_referido = ?, campana = ?,
         enfermedades = ?, alergias = ?, medicamentos_actuales = ?, tratamientos_previos = ?,
         hipertension = ?, diabetes = ?, anticonceptivos = ?, tabaquismo = ?,
         observaciones_antecedentes = ?, id_usuario_mod = ?
       WHERE id_historia_digital = ? AND id_unidad = ?`,
      [
        procedencia || null,
        texto(dto?.detalle_referido) || null,
        texto(dto?.campana) || null,
        texto(dto?.enfermedades) || null,
        texto(dto?.alergias) || null,
        texto(dto?.medicamentos_actuales) || null,
        texto(dto?.tratamientos_previos) || null,
        flag(dto?.hipertension),
        flag(dto?.diabetes),
        flag(dto?.anticonceptivos),
        flag(dto?.tabaquismo),
        texto(dto?.observaciones_antecedentes) || null,
        userId,
        historia.id_historia_digital,
        idUnidad,
      ],
    );
    return { ok: true };
  }

  async consultarReniec(documento: string) {
    await this.exigirSorela();
    const dni = String(documento || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(dni)) {
      throw new BadRequestException('RENIEC solo consulta un DNI de 8 dígitos.');
    }
    const urlBase = String(process.env.RENIEC_API_URL || '').trim();
    if (!urlBase) {
      return {
        disponible: false,
        mensaje: 'La consulta RENIEC no está configurada. Complete los datos manualmente.',
      };
    }
    let destino: URL;
    try {
      destino = new URL(urlBase);
    } catch {
      return { disponible: false, mensaje: 'La dirección de RENIEC configurada no es válida.' };
    }
    if (destino.protocol !== 'https:') {
      return { disponible: false, mensaje: 'La consulta RENIEC exige una dirección HTTPS.' };
    }
    destino.searchParams.set('dni', dni);
    const token = String(process.env.RENIEC_API_TOKEN || '').trim();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(destino, {
        headers: token ? { Authorization: `Bearer ${token}`, Accept: 'application/json' } : { Accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) {
        return { disponible: false, mensaje: 'RENIEC no devolvió datos para ese documento.' };
      }
      const cuerpo = await res.json().catch(() => null);
      const fila = cuerpo?.data || cuerpo?.resultado || cuerpo || {};
      const nombres = texto(fila.nombres || fila.nombre);
      const apellidos = texto(
        fila.apellidos || [fila.apellidoPaterno, fila.apellidoMaterno].filter(Boolean).join(' '),
      );
      const fecha = normalizarFecha(fila.fecha_nacimiento || fila.fechaNacimiento);
      if (!nombres && !apellidos) {
        return { disponible: false, mensaje: 'RENIEC respondió sin nombres utilizables.' };
      }
      return {
        disponible: true,
        mensaje: 'Datos obtenidos de RENIEC. Revíselos antes de guardar.',
        nombres: nombres.toUpperCase(),
        apellidos: apellidos.toUpperCase(),
        fecha_nacimiento: fecha,
      };
    } catch {
      return { disponible: false, mensaje: 'No se pudo contactar el servicio RENIEC.' };
    } finally {
      clearTimeout(timer);
    }
  }

  async crearEvaluacion(idPaciente: number, dto: any, userId: number) {
    const historia = await this.historiaDe(idPaciente, userId);
    const fecha = fechaONull(dto?.fecha);
    if (!fecha) throw new BadRequestException('Indique la fecha de la evaluación.');
    const res: any = await this.db.query(
      `INSERT INTO cli_hd_evaluacion
        (id_historia_digital, fecha, motivo, objetivos, zonas, hallazgos, plan_tratamiento, id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        historia.id_historia_digital,
        fecha,
        texto(dto?.motivo) || null,
        texto(dto?.objetivos) || null,
        texto(dto?.zonas) || null,
        texto(dto?.hallazgos) || null,
        texto(dto?.plan_tratamiento) || null,
        userId,
      ],
    );
    return { id: Number(res.insertId) };
  }

  async eliminarEvaluacion(id: number) {
    const idUnidad = await this.exigirSorela();
    const res: any = await this.db.query(
      `UPDATE cli_hd_evaluacion e
       JOIN cli_historia_digital h ON h.id_historia_digital = e.id_historia_digital
       SET e.estado_registro = 'ELIMINADO'
       WHERE e.id_evaluacion = ? AND h.id_unidad = ? AND e.estado_registro = 'ACTIVO'`,
      [id, idUnidad],
    );
    if (!filasAfectadas(res)) throw new NotFoundException('La evaluación no existe.');
    return { ok: true };
  }

  async crearCirugia(idPaciente: number, dto: any, userId: number) {
    const historia = await this.historiaDe(idPaciente, userId);
    const fecha = fechaONull(dto?.fecha);
    if (!fecha) throw new BadRequestException('Indique la fecha de la cirugía.');
    let cirujano = texto(dto?.cirujano);
    const idPersonal = Number(dto?.id_personal) || null;
    if (idPersonal) {
      const [per] = await this.db.query(
        `SELECT nombres, apellidos FROM cli_personal WHERE id_personal = ? AND estado_registro = 'ACTIVO'`,
        [idPersonal],
      );
      if (!per) throw new BadRequestException('El cirujano no existe.');
      cirujano = `${per.apellidos || ''}, ${per.nombres || ''}`.trim();
    }
    if (!cirujano) throw new BadRequestException('Indique el cirujano tratante.');
    const res: any = await this.db.query(
      `INSERT INTO cli_hd_cirugia
        (id_historia_digital, fecha, id_personal, cirujano, zonas, indicaciones, id_usuario_crea)
       VALUES (?,?,?,?,?,?,?)`,
      [
        historia.id_historia_digital,
        fecha,
        idPersonal,
        cirujano,
        texto(dto?.zonas) || null,
        texto(dto?.indicaciones) || null,
        userId,
      ],
    );
    return { id: Number(res.insertId) };
  }

  async eliminarCirugia(id: number) {
    const idUnidad = await this.exigirSorela();
    const res: any = await this.db.query(
      `UPDATE cli_hd_cirugia c
       JOIN cli_historia_digital h ON h.id_historia_digital = c.id_historia_digital
       SET c.estado_registro = 'ELIMINADO'
       WHERE c.id_cirugia = ? AND h.id_unidad = ? AND c.estado_registro = 'ACTIVO'`,
      [id, idUnidad],
    );
    if (!filasAfectadas(res)) throw new NotFoundException('La cirugía no existe.');
    return { ok: true };
  }

  async crearPaquete(idPaciente: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const historia = await this.historiaDe(idPaciente, userId);
    const idItem = Number(dto?.id_item) || null;
    let nombre = texto(dto?.nombre);
    let sesiones = Number(dto?.sesiones_total);
    if (idItem) {
      const [item] = await this.db.query(
        `SELECT nombre, sesiones FROM cli_catalogo_item
         WHERE id_item = ? AND id_unidad = ? AND tipo = 'paquete' AND estado_registro = 'ACTIVO'`,
        [idItem, idUnidad],
      );
      if (!item) throw new BadRequestException('El paquete no está en el catálogo de Sorela.');
      nombre = item.nombre;
      if (!(sesiones > 0)) sesiones = Number(item.sesiones) || 0;
    }
    if (!nombre) throw new BadRequestException('Seleccione un paquete.');
    if (!(sesiones > 0)) throw new BadRequestException('Indique las sesiones del paquete.');
    const precio = Number(dto?.precio_acordado);
    if (!Number.isFinite(precio) || precio < 0) throw new BadRequestException('Indique el precio acordado.');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const res: any = await qr.query(
        `INSERT INTO cli_hd_paquete
          (id_historia_digital, id_item, nombre, sesiones_total, sesiones_usadas, precio_acordado, id_usuario_crea)
         VALUES (?,?,?,?,0,?,?)`,
        [historia.id_historia_digital, idItem, nombre, sesiones, precio, userId],
      );
      const id = Number(res.insertId);
      if (idItem) {
        const comps = await qr.query(
          `SELECT c.id_servicio, s.nombre, c.cantidad
           FROM cli_catalogo_componente c
           JOIN cli_catalogo_item s ON s.id_item = c.id_servicio AND s.estado_registro = 'ACTIVO'
           WHERE c.id_paquete = ?`,
          [idItem],
        );
        let total = 0;
        for (const c of comps) {
          const cantidad = Number(c.cantidad) || 0;
          if (cantidad <= 0) continue;
          total += cantidad;
          await qr.query(
            `INSERT INTO cli_hd_paquete_componente
              (id_hd_paquete, id_servicio, nombre, sesiones_total, sesiones_usadas, id_usuario_crea)
             VALUES (?,?,?,?,0,?)`,
            [id, c.id_servicio, c.nombre, cantidad, userId],
          );
        }
        if (total > 0) {
          await qr.query(`UPDATE cli_hd_paquete SET sesiones_total = ? WHERE id_hd_paquete = ?`, [total, id]);
        }
      }
      await qr.commitTransaction();
      return { id };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  /**
   * Baja formal del plan contratado (soft-delete).
   * Libera vínculos de citas abiertas; conserva vínculos FINALIZADA.
   * Si hubo pagos, exige desglose: cuánto se devuelve y cuánto queda como pago (historial).
   */
  async bajarPlan(idPaquete: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const motivo = texto(dto?.motivo);
    if (!motivo) throw new BadRequestException('Indique el motivo de la baja del plan.');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [paquete] = await qr.query(
        `SELECT p.id_hd_paquete, p.id_historia_digital, p.id_item, p.nombre,
                p.sesiones_total, p.sesiones_usadas, p.precio_acordado, p.estado_registro,
                h.id_paciente
         FROM cli_hd_paquete p
         JOIN cli_historia_digital h ON h.id_historia_digital = p.id_historia_digital
         WHERE p.id_hd_paquete = ? AND h.id_unidad = ? AND p.estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [idPaquete, idUnidad],
      );
      if (!paquete) throw new NotFoundException('El plan no existe o ya fue dado de baja.');

      const pagos = await qr.query(
        `SELECT id_pago, monto, tipo_pago, id_hd_venta
         FROM cli_pago
         WHERE id_hd_paquete = ? AND estado = 'REGISTRADO' AND estado_registro = 'ACTIVO'`,
        [idPaquete],
      );
      const pagadoNeto = netoPagadoPlan(pagos);
      let montoDevolucion = 0;
      let montoRetenido = pagadoNeto;
      if (pagadoNeto > 0) {
        montoDevolucion = redondearMonto(Number(dto?.monto_devolucion));
        montoRetenido = redondearMonto(
          dto?.monto_retenido == null || dto?.monto_retenido === ''
            ? pagadoNeto - montoDevolucion
            : Number(dto.monto_retenido),
        );
        if (montoDevolucion < 0 || montoRetenido < 0) {
          throw new BadRequestException('Los montos de devolución y retención no pueden ser negativos.');
        }
        if (redondearMonto(montoDevolucion + montoRetenido) !== pagadoNeto) {
          throw new BadRequestException(
            `Devolución (${montoDevolucion.toFixed(2)}) + retenido (${montoRetenido.toFixed(2)}) debe igualar lo pagado neto (${pagadoNeto.toFixed(2)}).`,
          );
        }
      }

      await qr.query(
        `UPDATE cli_hd_paquete SET estado_registro = 'ELIMINADO' WHERE id_hd_paquete = ?`,
        [idPaquete],
      );
      await qr.query(
        `UPDATE cli_hd_paquete_componente
         SET estado_registro = 'ELIMINADO'
         WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO'`,
        [idPaquete],
      );
      // Citas abiertas dejan de ocupar sesión del plan; las FINALIZADA se conservan como historial.
      const liberados: any = await qr.query(
        `UPDATE cli_hd_cita_sesion s
         JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
         SET s.estado_registro = 'ELIMINADO'
         WHERE s.id_hd_paquete = ? AND s.estado_registro = 'ACTIVO'
           AND c.estado IN ('PENDIENTE', 'CONFIRMADA', 'EN_ATENCION')`,
        [idPaquete],
      );
      const vinculosLiberados = Number(
        liberados?.affectedRows ?? liberados?.[0]?.affectedRows ?? 0,
      );

      let idDevolucion: number | null = null;
      if (montoDevolucion > 0) {
        const [sede] = await qr.query(
          `SELECT id_sede FROM cli_sede
           WHERE id_unidad = ? AND estado_registro = 'ACTIVO'
           ORDER BY id_sede LIMIT 1`,
          [idUnidad],
        );
        if (!sede) throw new BadRequestException('Registre una sede antes de registrar la devolución.');
        const idVenta = pagos.find((x: any) => x.id_hd_venta)?.id_hd_venta || null;
        const ins: any = await qr.query(
          `INSERT INTO cli_pago
            (id_paciente, id_sede, id_unidad, id_hd_paquete, id_hd_venta, fecha_pago, monto, moneda,
             metodo_pago, tipo_pago, concepto, estado, id_usuario_crea)
           VALUES (?,?,?,?,?,NOW(),?,'PEN','EFECTIVO','DEVOLUCION',?,'REGISTRADO',?)`,
          [
            Number(paquete.id_paciente),
            sede.id_sede,
            idUnidad,
            idPaquete,
            idVenta,
            montoDevolucion,
            `Devolución por baja: ${motivo}`.slice(0, 240),
            userId,
          ],
        );
        idDevolucion = Number(ins.insertId) || null;
        if (idVenta) {
          await qr.query(
            `UPDATE cli_hd_venta SET estado = 'ANULADA' WHERE id_hd_venta = ? AND estado_registro = 'ACTIVO'`,
            [idVenta],
          );
        }
      } else {
        await qr.query(
          `UPDATE cli_hd_venta SET estado = 'CERRADA'
           WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO' AND estado = 'ABIERTA'`,
          [idPaquete],
        );
      }

      await qr.commitTransaction();
      await this.auditoria.registrar(
        'cli_hd_paquete',
        idPaquete,
        'ELIMINAR',
        userId,
        {
          nombre: paquete.nombre,
          sesiones_total: Number(paquete.sesiones_total),
          sesiones_usadas: Number(paquete.sesiones_usadas),
          precio_acordado: Number(paquete.precio_acordado),
          estado_registro: 'ACTIVO',
        },
        {
          estado_registro: 'ELIMINADO',
          motivo,
          vinculos_abiertos_liberados: vinculosLiberados,
          pagado_neto: pagadoNeto,
          monto_devolucion: montoDevolucion,
          monto_retenido: montoRetenido,
          id_pago_devolucion: idDevolucion,
        },
      );
      return {
        ok: true,
        message:
          montoDevolucion > 0
            ? `Plan dado de baja. Devolución S/ ${montoDevolucion.toFixed(2)}; retenido S/ ${montoRetenido.toFixed(2)}.`
            : 'Plan dado de baja',
        vinculos_liberados: vinculosLiberados,
        monto_devolucion: montoDevolucion,
        monto_retenido: montoRetenido,
      };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async usarSesion(_idPaquete: number) {
    throw new BadRequestException(
      'La sesión se descuenta al finalizar la atención de la cita. Si se descontó por error, restitúyala desde esa atención.',
    );
  }

  async crearPago(idPaciente: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    await this.paciente(idPaciente);
    const moneda = String(dto?.moneda || 'PEN').toUpperCase() === 'USD' ? 'USD' : 'PEN';
    let tipoCambio =
      dto?.tipo_cambio == null || dto?.tipo_cambio === ''
        ? null
        : Number(dto.tipo_cambio);
    let montoMoneda =
      dto?.monto_moneda == null || dto?.monto_moneda === ''
        ? null
        : redondearMonto(Number(dto.monto_moneda));
    let monto = redondearMonto(Number(dto?.monto));
    if (moneda === 'USD') {
      if (!(Number(tipoCambio) > 0)) {
        const [tc] = await this.db.query(
          `SELECT valor FROM cli_tipo_cambio
           WHERE id_unidad = ? AND moneda = 'USD' AND estado_registro = 'ACTIVO'
           ORDER BY fecha DESC, id_tipo_cambio DESC LIMIT 1`,
          [idUnidad],
        );
        tipoCambio = Number(tc?.valor || 0);
      }
      if (!(Number(tipoCambio) > 0)) {
        throw new BadRequestException('Registre el tipo de cambio del día (USD → PEN) antes de cobrar en dólares.');
      }
      if (!(Number(montoMoneda) > 0) && Number(dto?.monto) > 0) {
        // Si solo enviaron monto en USD en el campo monto.
        montoMoneda = redondearMonto(Number(dto.monto));
      }
      if (!(Number(montoMoneda) > 0)) {
        throw new BadRequestException('Indique el monto en dólares.');
      }
      monto = redondearMonto(Number(montoMoneda) * Number(tipoCambio));
    } else {
      tipoCambio = null;
      montoMoneda = null;
      monto = redondearMonto(Number(dto?.monto));
    }
    const metodo = texto(dto?.metodo_pago).toUpperCase() || 'EFECTIVO';
    if (!METODOS_PAGO.has(metodo)) throw new BadRequestException('El medio de pago no es válido.');
    const idPaquete = Number(dto?.id_hd_paquete);
    if (!idPaquete) throw new BadRequestException('Elija el plan de tratamiento que está pagando.');
    const historia = await this.asegurar(idUnidad, idPaciente, userId);
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [paquete] = await qr.query(
        `SELECT id_hd_paquete, nombre, precio_acordado, sesiones_usadas
         FROM cli_hd_paquete
         WHERE id_hd_paquete = ? AND id_historia_digital = ? AND estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [idPaquete, historia.id_historia_digital],
      );
      if (!paquete) throw new BadRequestException('El plan no pertenece a esta historia.');
      const pagosPrevios = await qr.query(
        `SELECT monto, tipo_pago FROM cli_pago
         WHERE id_hd_paquete = ? AND estado = 'REGISTRADO' AND estado_registro = 'ACTIVO'`,
        [idPaquete],
      );
      const pagado = netoPagadoPlan(pagosPrevios);
      const precio = redondearMonto(Number(paquete.precio_acordado || 0));
      const exceso = redondearMonto(Math.max(0, pagado - precio));
      if (exceso > 0) {
        throw new BadRequestException(
          `Este plan tiene exceso de pago (${exceso.toFixed(2)}). Ajuste o anule un pago antes de cobrar.`,
        );
      }
      const saldo = redondearMonto(precio - pagado);
      const tipoRes = resolverTipoPago({
        tipo: dto?.tipo_pago,
        monto,
        saldo,
        sesionesUsadas: Number(paquete.sesiones_usadas || 0),
      });
      if ('error' in tipoRes) throw new BadRequestException(tipoRes.error);
      const comprobante = await this.validarComprobante(idUnidad, dto);
      const [sede] = await qr.query(
        `SELECT id_sede FROM cli_sede
         WHERE id_unidad = ? AND estado_registro = 'ACTIVO'
         ORDER BY id_sede LIMIT 1`,
        [idUnidad],
      );
      if (!sede) throw new BadRequestException('Registre una sede antes de anotar un pago.');
      // Una venta por plan: el primer cobro la crea; adelantos/abonos posteriores la reutilizan.
      let [venta] = await qr.query(
        `SELECT id_hd_venta FROM cli_hd_venta
         WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO'`,
        [idPaquete],
      );
      if (!venta) {
        const creada: any = await qr.query(
          `INSERT INTO cli_hd_venta
            (id_unidad, id_paciente, id_hd_paquete, nombre, monto_total, estado, id_usuario_crea)
           VALUES (?,?,?,?,?,'ABIERTA',?)`,
          [idUnidad, idPaciente, idPaquete, paquete.nombre, precio, userId],
        );
        venta = { id_hd_venta: Number(creada.insertId) };
      }
      await qr.query(
        `INSERT INTO cli_pago
          (id_paciente, id_sede, id_unidad, id_hd_paquete, id_hd_venta, fecha_pago, monto, moneda, tipo_cambio, monto_moneda,
           metodo_pago, tipo_pago, comprobante_tipo, comprobante_numero, concepto, estado, id_usuario_crea)
         VALUES (?,?,?,?,?,NOW(),?,?,?,?,?,?,?,?,?,'REGISTRADO',?)`,
        [
          idPaciente,
          sede.id_sede,
          idUnidad,
          idPaquete,
          Number(venta.id_hd_venta),
          monto,
          moneda,
          tipoCambio,
          montoMoneda,
          metodo,
          tipoRes.tipo,
          comprobante.tipo,
          comprobante.numero,
          texto(dto?.concepto) || paquete.nombre,
          userId,
        ],
      );
      if (moneda === 'USD' && Number(tipoCambio) > 0) {
        await qr.query(
          `INSERT INTO cli_tipo_cambio (id_unidad, fecha, moneda, valor, id_usuario_crea)
           VALUES (?, CURDATE(), 'USD', ?, ?)
           ON DUPLICATE KEY UPDATE valor = VALUES(valor), estado_registro = 'ACTIVO'`,
          [idUnidad, tipoCambio, userId],
        );
      }
      await qr.commitTransaction();
      return {
        ok: true,
        tipo_pago: tipoRes.tipo,
        moneda,
        monto_pen: monto,
        tipo_cambio: tipoCambio,
        saldo: redondearMonto(saldo - monto),
        opciones_tipo: opcionesTipoPago(saldo - monto, Number(paquete.sesiones_usadas || 0)),
      };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async ajustarPago(idPago: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const motivo = texto(dto?.motivo);
    if (!motivo) throw new BadRequestException('Indique el motivo del ajuste.');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [pago] = await qr.query(
        `SELECT p.id_pago, p.id_hd_paquete, p.monto, p.metodo_pago, p.tipo_pago,
                p.comprobante_tipo, p.comprobante_numero, p.concepto, p.estado, p.id_paciente
         FROM cli_pago p
         WHERE p.id_pago = ? AND p.estado_registro = 'ACTIVO'
           AND (p.id_unidad = ? OR p.id_sede IN (SELECT id_sede FROM cli_sede WHERE id_unidad = ?))
         FOR UPDATE`,
        [idPago, idUnidad, idUnidad],
      );
      if (!pago) throw new NotFoundException('El pago no existe.');
      if (pago.estado !== 'REGISTRADO') {
        throw new BadRequestException('Solo se pueden ajustar pagos registrados.');
      }
      if (!pago.id_hd_paquete) {
        throw new BadRequestException('Este pago no está ligado a un plan de tratamiento.');
      }
      const [paquete] = await qr.query(
        `SELECT p.id_hd_paquete, p.precio_acordado, p.nombre
         FROM cli_hd_paquete p
         JOIN cli_historia_digital h ON h.id_historia_digital = p.id_historia_digital
         WHERE p.id_hd_paquete = ? AND h.id_unidad = ? AND p.estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [pago.id_hd_paquete, idUnidad],
      );
      if (!paquete) throw new BadRequestException('El plan del pago no está disponible.');
      const montoNuevo =
        dto?.monto == null || dto.monto === ''
          ? redondearMonto(Number(pago.monto))
          : redondearMonto(Number(dto.monto));
      if (!(montoNuevo > 0)) throw new BadRequestException('El monto ajustado debe ser mayor que cero.');
      const metodo =
        texto(dto?.metodo_pago).toUpperCase() || String(pago.metodo_pago || 'EFECTIVO').toUpperCase();
      if (!METODOS_PAGO.has(metodo)) throw new BadRequestException('El medio de pago no es válido.');
      const comprobante = await this.validarComprobante(idUnidad, {
        comprobante_tipo: dto?.comprobante_tipo ?? pago.comprobante_tipo,
        comprobante_numero: dto?.comprobante_numero ?? pago.comprobante_numero,
      });
      const [suma] = await qr.query(
        `SELECT COALESCE(SUM(monto), 0) AS pagado
         FROM cli_pago
         WHERE id_hd_paquete = ? AND estado = 'REGISTRADO' AND estado_registro = 'ACTIVO'
           AND id_pago <> ?`,
        [pago.id_hd_paquete, idPago],
      );
      const otros = redondearMonto(Number(suma?.pagado || 0));
      const precio = redondearMonto(Number(paquete.precio_acordado || 0));
      if (redondearMonto(otros + montoNuevo) > precio) {
        throw new BadRequestException(
          `La suma de pagos no puede superar ${precio.toFixed(2)} (${paquete.nombre}).`,
        );
      }
      const antes = {
        monto: Number(pago.monto),
        metodo_pago: pago.metodo_pago,
        comprobante_tipo: pago.comprobante_tipo,
        comprobante_numero: pago.comprobante_numero,
        motivo,
      };
      await qr.query(
        `UPDATE cli_pago
         SET monto = ?, metodo_pago = ?, comprobante_tipo = ?, comprobante_numero = ?,
             id_usuario_mod = ?
         WHERE id_pago = ?`,
        [montoNuevo, metodo, comprobante.tipo, comprobante.numero, userId, idPago],
      );
      await qr.commitTransaction();
      await this.auditoria.registrar('cli_pago', idPago, 'ACTUALIZAR', userId, antes, {
        monto: montoNuevo,
        metodo_pago: metodo,
        comprobante_tipo: comprobante.tipo,
        comprobante_numero: comprobante.numero,
        motivo,
      });
      return { ok: true, message: 'Pago ajustado' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async anularPagoPlan(idPago: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const motivo = texto(dto?.motivo);
    if (!motivo) throw new BadRequestException('Indique el motivo de la anulación.');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [pago] = await qr.query(
        `SELECT p.id_pago, p.id_hd_paquete, p.monto, p.metodo_pago, p.estado, p.concepto
         FROM cli_pago p
         WHERE p.id_pago = ? AND p.estado_registro = 'ACTIVO'
           AND (p.id_unidad = ? OR p.id_sede IN (SELECT id_sede FROM cli_sede WHERE id_unidad = ?))
         FOR UPDATE`,
        [idPago, idUnidad, idUnidad],
      );
      if (!pago) throw new NotFoundException('El pago no existe.');
      if (pago.estado !== 'REGISTRADO') throw new BadRequestException('El pago ya está anulado.');
      if (!pago.id_hd_paquete) {
        throw new BadRequestException('Este pago no está ligado a un plan de tratamiento.');
      }
      const [paquete] = await qr.query(
        `SELECT p.id_hd_paquete
         FROM cli_hd_paquete p
         JOIN cli_historia_digital h ON h.id_historia_digital = p.id_historia_digital
         WHERE p.id_hd_paquete = ? AND h.id_unidad = ? AND p.estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [pago.id_hd_paquete, idUnidad],
      );
      if (!paquete) throw new BadRequestException('El plan del pago no está disponible.');
      await qr.query(
        `UPDATE cli_pago SET estado = 'ANULADO', id_usuario_mod = ? WHERE id_pago = ?`,
        [userId, idPago],
      );
      await qr.commitTransaction();
      await this.auditoria.registrar(
        'cli_pago',
        idPago,
        'ANULAR',
        userId,
        { estado: 'REGISTRADO', monto: Number(pago.monto), metodo_pago: pago.metodo_pago },
        { estado: 'ANULADO', motivo },
      );
      return { ok: true, message: 'Pago anulado' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async sesionesPendientesPaciente(idPaciente: number, userId: number) {
    const idUnidad = await this.exigirSorela();
    await this.paciente(idPaciente);
    const historia = await this.asegurar(idUnidad, idPaciente, userId);
    const planes = await this.db.query(
      `SELECT p.id_hd_paquete, p.id_item, p.nombre, p.sesiones_total, p.sesiones_usadas, p.precio_acordado,
              i.intervalo_dias_sugerido
       FROM cli_hd_paquete p
       LEFT JOIN cli_catalogo_item i ON i.id_item = p.id_item
       WHERE p.id_historia_digital = ? AND p.estado_registro = 'ACTIVO'
         AND p.sesiones_usadas < p.sesiones_total
       ORDER BY p.id_hd_paquete`,
      [historia.id_historia_digital],
    );
    const out: any[] = [];
    for (const p of planes) {
      if (!planTieneSesionesPendientes(Number(p.sesiones_usadas), Number(p.sesiones_total))) continue;
      const [pagoRow] = await this.db.query(
        `SELECT COALESCE(SUM(monto), 0) AS pagado
         FROM cli_pago
         WHERE id_hd_paquete = ? AND estado = 'REGISTRADO' AND estado_registro = 'ACTIVO'`,
        [p.id_hd_paquete],
      );
      const pagado = redondearMonto(Number(pagoRow?.pagado || 0));
      const precio = redondearMonto(Number(p.precio_acordado || 0));
      const usadas = Number(p.sesiones_usadas);
      const ligadas = await this.db.query(
        `SELECT s.id_cita, s.numero_sesion, c.estado,
                DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha_cita,
                TIME_FORMAT(c.hora_inicio, '%H:%i:%s') AS hora_inicio
         FROM cli_hd_cita_sesion s
         JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
         WHERE s.id_hd_paquete = ? AND s.estado_registro = 'ACTIVO'
           AND c.estado NOT IN ('CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA')`,
        [p.id_hd_paquete],
      );
      const efectivos = numerosEfectivosPlan(
        usadas,
        (ligadas || []).map((r: any) => ({
          id_cita: Number(r.id_cita),
          estado: String(r.estado),
          fecha_cita: String(r.fecha_cita || ''),
          hora_inicio: String(r.hora_inicio || ''),
          numero_sesion_almacenado: Number(r.numero_sesion),
        })),
      );
      const abiertas = efectivos.filter((e) => !e.definitivo);
      // Hueco siguiente a programar: primeras abiertas ocupan usadas+1…; la API
      // reporta el primer hueco (usadas+1) y si ya hay cita abierta ahí, su id.
      const slotSiguiente = usadas + 1;
      const siguiente = numeroSiguienteConAbiertas(usadas, abiertas.length);
      const vigenteSlot = efectivos.find(
        (e) => !e.definitivo && e.numero_sesion === slotSiguiente,
      );
      const [ultima] = await this.db.query(
        `SELECT DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha
         FROM cli_hd_cita_sesion s
         JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
         WHERE s.id_hd_paquete = ? AND s.estado_registro = 'ACTIVO'
           AND c.estado = 'FINALIZADA'
         ORDER BY c.fecha_cita DESC, c.hora_inicio DESC
         LIMIT 1`,
        [p.id_hd_paquete],
      );
      out.push({
        id_hd_paquete: Number(p.id_hd_paquete),
        nombre: p.nombre,
        sesiones_total: Number(p.sesiones_total),
        sesiones_usadas: usadas,
        numero_siguiente_sesion: vigenteSlot ? slotSiguiente : siguiente,
        fecha_ultima_sesion: ultima?.fecha || null,
        fecha_sugerida_desde: fechaSugeridaDesde(
          ultima?.fecha,
          p.intervalo_dias_sugerido == null ? null : Number(p.intervalo_dias_sugerido),
        ),
        intervalo_dias_sugerido:
          p.intervalo_dias_sugerido == null ? null : Number(p.intervalo_dias_sugerido),
        precio_acordado: precio,
        pagado,
        saldo: redondearMonto(Math.max(0, precio - pagado)),
        exceso: redondearMonto(Math.max(0, pagado - precio)),
        id_cita_siguiente: vigenteSlot ? Number(vigenteSlot.id_cita) : null,
      });
    }
    return { planes: out };
  }

  private async validarComprobante(idUnidad: number, dto: any) {
    const [u] = await this.db.query(
      `SELECT requiere_comprobante FROM cli_unidad WHERE id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [idUnidad],
    );
    const tipo = texto(dto?.comprobante_tipo).slice(0, 30) || null;
    const numero = texto(dto?.comprobante_numero).slice(0, 40) || null;
    if (Number(u?.requiere_comprobante) === 1) {
      if (!tipo || !numero) {
        throw new BadRequestException('Esta unidad exige tipo y número de comprobante al cobrar.');
      }
    }
    return { tipo, numero };
  }

  private async historiaDe(idPaciente: number, userId: number) {
    const idUnidad = await this.exigirSorela();
    await this.paciente(idPaciente);
    return this.asegurar(idUnidad, idPaciente, userId);
  }

  private async exigirSorela(): Promise<number> {
    const id = this.unidad.exigirEmpresa();
    const [row] = await this.db.query(
      `SELECT codigo FROM cli_unidad WHERE id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (String(row?.codigo || '').toUpperCase() !== 'SORELA') {
      throw new ForbiddenException('La historia digital corresponde a Sorela Medic.');
    }
    return id;
  }

  private async paciente(id: number) {
    const [row] = await this.db.query(
      `SELECT id_paciente, tipo_documento, numero_documento, nombres, apellidos,
              DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS fecha_nacimiento,
              ocupacion, telefono, telefono_alterno, email, direccion,
              contacto_emergencia_nombre, contacto_emergencia_telefono, contacto_emergencia_parentesco
       FROM cli_paciente
       WHERE id_paciente = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (!row) throw new NotFoundException('Paciente no encontrado.');
    return row;
  }

  private async asegurar(idUnidad: number, idPaciente: number, userId: number) {
    const [existe] = await this.db.query(
      `SELECT id_historia_digital, codigo, procedencia, detalle_referido, campana,
              enfermedades, alergias, medicamentos_actuales, tratamientos_previos,
              hipertension, diabetes, anticonceptivos, tabaquismo, observaciones_antecedentes
       FROM cli_historia_digital
       WHERE id_unidad = ? AND id_paciente = ? AND estado_registro = 'ACTIVO'`,
      [idUnidad, idPaciente],
    );
    if (existe) return existe;
    const codigo = await this.siguienteCodigo(idUnidad);
    try {
      const res: any = await this.db.query(
        `INSERT INTO cli_historia_digital (id_unidad, id_paciente, codigo, id_usuario_crea)
         VALUES (?,?,?,?)`,
        [idUnidad, idPaciente, codigo, userId],
      );
      return { id_historia_digital: Number(res.insertId), codigo };
    } catch (e: any) {
      if (e?.code !== 'ER_DUP_ENTRY') throw e;
      const [otra] = await this.db.query(
        `SELECT id_historia_digital, codigo FROM cli_historia_digital
         WHERE id_unidad = ? AND id_paciente = ? AND estado_registro = 'ACTIVO'`,
        [idUnidad, idPaciente],
      );
      if (otra) return otra;
      throw e;
    }
  }

  private async siguienteCodigo(idUnidad: number) {
    const [row] = await this.db.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(codigo, 4) AS UNSIGNED)), 0) AS n
       FROM cli_historia_digital WHERE id_unidad = ?`,
      [idUnidad],
    );
    return `HD-${String(Number(row?.n || 0) + 1).padStart(5, '0')}`;
  }

  private evaluacionesDe(idHistoria: number) {
    return this.db.query(
      `SELECT id_evaluacion, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
              motivo, objetivos, zonas, hallazgos, plan_tratamiento
       FROM cli_hd_evaluacion
       WHERE id_historia_digital = ? AND estado_registro = 'ACTIVO'
       ORDER BY fecha DESC, id_evaluacion DESC`,
      [idHistoria],
    );
  }

  private cirugiasDe(idHistoria: number) {
    return this.db.query(
      `SELECT id_cirugia, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
              id_personal, cirujano, zonas, indicaciones
       FROM cli_hd_cirugia
       WHERE id_historia_digital = ? AND estado_registro = 'ACTIVO'
       ORDER BY fecha DESC, id_cirugia DESC`,
      [idHistoria],
    );
  }

  private paquetesDe(idHistoria: number, opts?: { incluirHistorial?: boolean }) {
    const soloActivos = !opts?.incluirHistorial;
    return this.db.query(
      `SELECT id_hd_paquete, id_item, nombre, sesiones_total, sesiones_usadas, precio_acordado,
              estado_registro
       FROM cli_hd_paquete
       WHERE id_historia_digital = ?
         ${soloActivos ? `AND estado_registro = 'ACTIVO'` : ''}
       ORDER BY (estado_registro = 'ACTIVO') DESC, id_hd_paquete DESC`,
      [idHistoria],
    );
  }

  private documentosDe(idPaciente: number) {
    return this.db.query(
      `SELECT d.id_documento, d.titulo, d.nombre_original, t.codigo AS tipo, t.nombre AS tipo_nombre,
              DATE_FORMAT(d.fecha_documento, '%Y-%m-%d') AS fecha_documento
       FROM cli_documento d
       JOIN cli_tipo_documento t ON t.id_tipo_documento = d.id_tipo_documento
       WHERE d.id_paciente = ? AND d.estado_registro = 'ACTIVO'
       ORDER BY d.id_documento DESC`,
      [idPaciente],
    );
  }

  private tiposDocumento() {
    return this.db.query(
      `SELECT id_tipo_documento, codigo, nombre
       FROM cli_tipo_documento
       WHERE estado_registro = 'ACTIVO' AND activo = 1
       ORDER BY nombre`,
    );
  }

  private citasDe(idUnidad: number, idPaciente: number) {
    return this.db.query(
      `SELECT c.id_cita, DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora, c.estado, c.precio_acordado, c.notas,
              CONCAT(pe.apellidos, ', ', pe.nombres) AS personal,
              tc.nombre AS tipo_cita,
              a.id_atencion, a.estado AS atencion_estado
       FROM cli_cita c
       LEFT JOIN cli_personal pe ON pe.id_personal = c.id_personal
       LEFT JOIN cli_tipo_cita tc ON tc.id_tipo_cita = c.id_tipo_cita
       LEFT JOIN cli_hd_atencion a ON a.id_cita = c.id_cita AND a.estado_registro = 'ACTIVO'
       WHERE c.id_paciente = ? AND c.estado_registro = 'ACTIVO'
         AND (c.id_unidad = ? OR c.id_sede IN (SELECT id_sede FROM cli_sede WHERE id_unidad = ?))
       ORDER BY c.fecha_cita DESC, c.hora_inicio DESC`,
      [idPaciente, idUnidad, idUnidad],
    );
  }

  private pagosDe(idUnidad: number, idPaciente: number) {
    return this.db.query(
      `SELECT p.id_pago, DATE_FORMAT(p.fecha_pago, '%Y-%m-%d') AS fecha, p.monto, p.metodo_pago,
              p.tipo_pago, p.comprobante_tipo, p.comprobante_numero, p.concepto,
              p.id_hd_paquete, pk.nombre AS paquete,
              COALESCE(p.moneda, 'PEN') AS moneda, p.tipo_cambio, p.monto_moneda
       FROM cli_pago p
       LEFT JOIN cli_hd_paquete pk ON pk.id_hd_paquete = p.id_hd_paquete
       WHERE p.id_paciente = ? AND p.estado_registro = 'ACTIVO' AND p.estado = 'REGISTRADO'
         AND (p.id_unidad = ? OR p.id_sede IN (SELECT id_sede FROM cli_sede WHERE id_unidad = ?))
       ORDER BY p.fecha_pago DESC, p.id_pago DESC`,
      [idPaciente, idUnidad, idUnidad],
    );
  }

  private catalogoPaquetes(idUnidad: number) {
    return this.db.query(
      `SELECT id_item, codigo, nombre, sesiones
       FROM cli_catalogo_item
       WHERE id_unidad = ? AND tipo = 'paquete' AND estado_registro = 'ACTIVO'
       ORDER BY nombre`,
      [idUnidad],
    );
  }

  private personalActivo() {
    return this.db.query(
      `SELECT id_personal, nombres, apellidos
       FROM cli_personal
       WHERE estado_registro = 'ACTIVO'
       ORDER BY apellidos, nombres
       LIMIT 300`,
    );
  }

  private async adjuntarPaquetes(paquetes: any[]) {
    const ids = paquetes.map((p) => Number(p.id_hd_paquete)).filter(Boolean);
    if (!ids.length) return;
    const marcas = ids.map(() => '?').join(',');
    const componentes = await this.db.query(
      `SELECT id_hd_componente, id_hd_paquete, id_servicio, nombre, sesiones_total, sesiones_usadas,
              estado_registro
       FROM cli_hd_paquete_componente
       WHERE id_hd_paquete IN (${marcas})
       ORDER BY id_hd_componente`,
      ids,
    );
    const movimientos = await this.db.query(
      `SELECT m.id_movimiento, m.id_hd_paquete, m.id_hd_componente, m.id_atencion, m.tipo, m.motivo,
              DATE_FORMAT(m.fecha, '%Y-%m-%d %H:%i') AS fecha,
              TRIM(CONCAT(IFNULL(u.nombres,''), ' ', IFNULL(u.apellidos,''))) AS usuario
       FROM cli_hd_sesion_movimiento m
       LEFT JOIN sis_usuario u ON u.id_usuario = m.id_usuario
       WHERE m.id_hd_paquete IN (${marcas})
       ORDER BY m.id_movimiento DESC`,
      ids,
    );
    for (const p of paquetes) {
      const comps = componentes.filter((c) => Number(c.id_hd_paquete) === Number(p.id_hd_paquete));
      // Plan vigente: solo componentes activos. Historial (baja): todos para conservar el detalle.
      p.componentes =
        String(p.estado_registro) === 'ACTIVO'
          ? comps.filter((c) => String(c.estado_registro) === 'ACTIVO')
          : comps;
      p.movimientos = movimientos.filter((m) => Number(m.id_hd_paquete) === Number(p.id_hd_paquete));
    }
  }

  private async adjuntarBajas(paquetes: any[]) {
    const ids = paquetes
      .filter((p) => String(p.estado_registro) === 'ELIMINADO')
      .map((p) => Number(p.id_hd_paquete))
      .filter(Boolean);
    if (!ids.length) return;
    const marcas = ids.map(() => '?').join(',');
    const rows = await this.db.query(
      `SELECT a.id_registro, DATE_FORMAT(a.fecha, '%Y-%m-%d %H:%i') AS fecha_baja,
              a.valores_nuevos,
              TRIM(CONCAT(IFNULL(u.nombres,''), ' ', IFNULL(u.apellidos,''))) AS usuario_baja
       FROM sis_auditoria a
       LEFT JOIN sis_usuario u ON u.id_usuario = a.id_usuario
       WHERE a.nombre_tabla = 'cli_hd_paquete' AND a.accion = 'ELIMINAR'
         AND a.id_registro IN (${marcas})
       ORDER BY a.id_auditoria DESC`,
      ids,
    );
    const visto = new Set<number>();
    for (const r of rows || []) {
      const id = Number(r.id_registro);
      if (visto.has(id)) continue;
      visto.add(id);
      let motivo = '';
      try {
        const nuev =
          typeof r.valores_nuevos === 'string' ? JSON.parse(r.valores_nuevos) : r.valores_nuevos;
        motivo = texto(nuev?.motivo);
      } catch {
        motivo = '';
      }
      const p = paquetes.find((x) => Number(x.id_hd_paquete) === id);
      if (p) {
        p.fecha_baja = r.fecha_baja || null;
        p.motivo_baja = motivo || null;
        p.usuario_baja = String(r.usuario_baja || '').trim() || null;
      }
    }
  }

  private atribuirPagos(paquetes: any[], pagos: any[]) {
    for (const p of paquetes) {
      const delPlan = pagos.filter((x) => Number(x.id_hd_paquete) === Number(p.id_hd_paquete));
      const pagado = netoPagadoPlan(delPlan);
      const precio = Number(p.precio_acordado || 0);
      p.pagado = redondear(pagado);
      p.saldo = redondear(Math.max(0, precio - pagado));
      p.exceso = redondear(Math.max(0, pagado - precio));
      p.pagos = delPlan;
      p.sesiones_pendientes = pendientesPaquete(p);
      if (String(p.estado_registro) === 'ELIMINADO') {
        p.estado_plan = 'BAJA';
        p.opciones_tipo_pago = [];
      } else if (p.sesiones_pendientes <= 0) {
        p.estado_plan = 'COMPLETADO';
        p.opciones_tipo_pago =
          p.exceso > 0 ? [] : opcionesTipoPago(p.saldo, Number(p.sesiones_usadas || 0));
      } else {
        p.estado_plan = 'VIGENTE';
        p.opciones_tipo_pago =
          p.exceso > 0 ? [] : opcionesTipoPago(p.saldo, Number(p.sesiones_usadas || 0));
      }
    }
  }

  async atencionDeCita(idCita: number, userId: number) {
    const idUnidad = await this.exigirSorela();
    const cita = await this.citaSorela(idCita, idUnidad);
    const historia = await this.asegurar(idUnidad, Number(cita.id_paciente), userId);
    const paciente = await this.paciente(Number(cita.id_paciente));
    const [atencion] = await this.db.query(
      `SELECT a.id_atencion, a.id_personal, a.id_hd_paquete, a.id_hd_componente, a.id_item,
              a.anamnesis, a.zona, a.lado, a.parametros, a.evolucion, a.incidencias,
              a.indicaciones, DATE_FORMAT(a.proxima_revision, '%Y-%m-%d') AS proxima_revision,
              a.estado, DATE_FORMAT(a.fecha_cierre, '%Y-%m-%d %H:%i') AS fecha_cierre,
              TRIM(CONCAT(IFNULL(uc.nombres,''), ' ', IFNULL(uc.apellidos,''))) AS registrado_por,
              TRIM(CONCAT(IFNULL(um.nombres,''), ' ', IFNULL(um.apellidos,''))) AS modificado_por
       FROM cli_hd_atencion a
       LEFT JOIN sis_usuario uc ON uc.id_usuario = a.id_usuario_crea
       LEFT JOIN sis_usuario um ON um.id_usuario = a.id_usuario_mod
       WHERE a.id_cita = ? AND a.estado_registro = 'ACTIVO'`,
      [idCita],
    );
    const [vinculoRow] = await this.db.query(
      `SELECT id_cita_sesion, id_hd_paquete, id_item, numero_sesion
       FROM cli_hd_cita_sesion
       WHERE id_cita = ? AND estado_registro = 'ACTIVO'`,
      [idCita],
    );
    let vinculo_cita = vinculoRow
      ? {
          id_cita_sesion: Number(vinculoRow.id_cita_sesion),
          id_hd_paquete: vinculoRow.id_hd_paquete != null ? Number(vinculoRow.id_hd_paquete) : null,
          id_item: vinculoRow.id_item != null ? Number(vinculoRow.id_item) : null,
          numero_sesion: Number(vinculoRow.numero_sesion),
          numero_sesion_definitivo: String(cita.estado) === 'FINALIZADA',
        }
      : null;
    // Citas abiertas: numero_sesion informativo (recalculado por fecha entre abiertas del plan).
    if (
      vinculo_cita?.id_hd_paquete &&
      !vinculo_cita.numero_sesion_definitivo
    ) {
      const [paq] = await this.db.query(
        `SELECT sesiones_usadas FROM cli_hd_paquete
         WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO'`,
        [vinculo_cita.id_hd_paquete],
      );
      const hermanas = await this.db.query(
        `SELECT s.id_cita, s.numero_sesion, c.estado,
                DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha_cita,
                TIME_FORMAT(c.hora_inicio, '%H:%i:%s') AS hora_inicio
         FROM cli_hd_cita_sesion s
         JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
         WHERE s.id_hd_paquete = ? AND s.estado_registro = 'ACTIVO'
           AND c.estado NOT IN ('CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA')`,
        [vinculo_cita.id_hd_paquete],
      );
      const ef = numerosEfectivosPlan(
        Number(paq?.sesiones_usadas || 0),
        (hermanas || []).map((r: any) => ({
          id_cita: Number(r.id_cita),
          estado: String(r.estado),
          fecha_cita: String(r.fecha_cita || ''),
          hora_inicio: String(r.hora_inicio || ''),
          numero_sesion_almacenado: Number(r.numero_sesion),
        })),
      ).find((e) => e.id_cita === idCita);
      if (ef) {
        vinculo_cita = { ...vinculo_cita, numero_sesion: ef.numero_sesion };
      }
    }
    const tecnologiasUsadas = atencion
      ? await this.db.query(
          `SELECT id_tecnologia FROM cli_hd_atencion_tecnologia
           WHERE id_atencion = ? AND estado_registro = 'ACTIVO'`,
          [atencion.id_atencion],
        )
      : [];
    const medida = atencion
      ? await this.medidaDe(Number(atencion.id_atencion))
      : null;
    const paquetes = await this.paquetesDe(historia.id_historia_digital);
    await this.adjuntarPaquetes(paquetes);
    const tecnologias = await this.db.query(
      `SELECT id_tecnologia, nombre FROM cli_catalogo_tecnologia
       WHERE id_unidad = ? AND estado_registro = 'ACTIVO' AND activo = 1
       ORDER BY nombre`,
      [idUnidad],
    );
    const medidas = await this.db.query(
      `SELECT id_medida, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
              peso, agua_corporal, grasa_corporal, masa_muscular,
              abdomen_alto, cintura, ombligo, cadera, observaciones, id_atencion
       FROM cli_hd_medida
       WHERE id_historia_digital = ? AND estado_registro = 'ACTIVO'
       ORDER BY fecha DESC, id_medida DESC
       LIMIT 12`,
      [historia.id_historia_digital],
    );
    const movimientos = atencion
      ? await this.db.query(
          `SELECT tipo, motivo, DATE_FORMAT(fecha, '%Y-%m-%d %H:%i') AS fecha,
                  TRIM(CONCAT(IFNULL(u.nombres,''), ' ', IFNULL(u.apellidos,''))) AS usuario
           FROM cli_hd_sesion_movimiento m
           LEFT JOIN sis_usuario u ON u.id_usuario = m.id_usuario
           WHERE m.id_atencion = ?
           ORDER BY m.id_movimiento DESC`,
          [atencion.id_atencion],
        )
      : [];
    return {
      cita,
      paciente,
      historia: { id_historia_digital: historia.id_historia_digital, codigo: historia.codigo },
      atencion: atencion
        ? { ...atencion, tecnologias: tecnologiasUsadas.map((t) => Number(t.id_tecnologia)), medida }
        : null,
      vinculo_cita,
      paquetes,
      catalogo: await this.catalogoAtencion(idUnidad),
      personal: await this.personalDeUnidad(idUnidad),
      sesiones: await this.sesionesDe(historia.id_historia_digital),
      tecnologias,
      medidas,
      movimientos,
    };
  }

  async guardarAtencion(idCita: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const cita = await this.citaSorela(idCita, idUnidad);
    this.rechazarCitaCerrada(cita.estado);
    const historia = await this.asegurar(idUnidad, Number(cita.id_paciente), userId);
    const id = await this.persistirAtencion(idUnidad, historia.id_historia_digital, cita, dto, userId, false);
    return { id, message: 'Atención guardada' };
  }

  async finalizarAtencion(idCita: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const cita = await this.citaSorela(idCita, idUnidad);
    this.rechazarCitaCerrada(cita.estado);
    if (!texto(dto?.anamnesis)) {
      throw new BadRequestException('Escriba la anamnesis de esta atención.');
    }
    const historia = await this.asegurar(idUnidad, Number(cita.id_paciente), userId);
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const idAtencion = await this.persistirAtencion(
        idUnidad,
        historia.id_historia_digital,
        cita,
        dto,
        userId,
        true,
        qr,
      );
      const [actual] = await qr.query(
        `SELECT estado FROM cli_hd_atencion WHERE id_atencion = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
        [idAtencion],
      );
      if (actual?.estado === 'FINALIZADA') {
        throw new BadRequestException('Esta atención ya está finalizada.');
      }
      const descuento = await this.descuentoVigente(qr, idAtencion);
      if (descuento) throw new BadRequestException('La sesión de esta atención ya fue descontada.');
      const [guardada] = await qr.query(
        `SELECT id_hd_paquete, id_hd_componente FROM cli_hd_atencion WHERE id_atencion = ?`,
        [idAtencion],
      );
      // Solo descuenta si la cita es sesión del plan (vínculo / flag). Evita
      // consumir sesión 1 solo por elegir el paquete en el formulario.
      const consumirSesion = this.flagConsumirSesion(dto);
      const descuentoResultado = consumirSesion
        ? await this.descontarSesion(
            qr,
            idAtencion,
            {
              ...dto,
              id_hd_paquete: guardada?.id_hd_paquete ?? null,
              id_hd_componente: guardada?.id_hd_componente ?? null,
            },
            idUnidad,
            userId,
          )
        : {
            descontado: false,
            idPaquete: null,
            idItem: null,
            numeroSesion: null,
          };
      const liberado = await this.sincronizarVinculoTrasDescuento(
        qr,
        idCita,
        Number(historia.id_historia_digital),
        userId,
        descuentoResultado,
      );
      await qr.query(
        `UPDATE cli_hd_atencion
         SET estado = 'FINALIZADA', fecha_cierre = NOW(), id_usuario_mod = ?
         WHERE id_atencion = ?`,
        [userId, idAtencion],
      );
      await qr.query(
        `UPDATE cli_cita SET estado = 'FINALIZADA', id_usuario_mod = ?
         WHERE id_cita = ? AND estado_registro = 'ACTIVO' AND estado NOT IN ('CANCELADA','FINALIZADA')`,
        [userId, idCita],
      );
      await qr.commitTransaction();
      if (liberado) {
        await this.auditoria.registrar(
          'cli_hd_cita_sesion',
          liberado.idCitaSesion,
          'ELIMINAR',
          userId,
          liberado.antiguos,
          {
            estado_registro: 'ELIMINADO',
            motivo: 'Atención finalizada sin descontar plan; vínculo liberado',
          },
        );
      }
      return { id: idAtencion, message: 'Atención finalizada' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  /**
   * Restituye el contador del plan sin reabrir la atención.
   * Solo la última sesión descontada del PLAN (mayor numero_sesion con DESCUENTO
   * sin RESTITUCION posterior). Soft-delete de cli_hd_cita_sesion para liberar el número.
   */
  async restituirSesion(idAtencion: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const motivo = texto(dto?.motivo);
    if (!motivo) throw new BadRequestException('Indique el motivo de la restitución.');
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [atencion] = await qr.query(
        `SELECT a.id_atencion, a.id_cita, a.estado, a.id_hd_paquete, a.id_hd_componente
         FROM cli_hd_atencion a
         WHERE a.id_atencion = ? AND a.id_unidad = ? AND a.estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [idAtencion, idUnidad],
      );
      if (!atencion) throw new NotFoundException('La atención no existe.');
      if (atencion.estado !== 'FINALIZADA') {
        throw new BadRequestException('Solo se restituye una sesión de una atención ya finalizada.');
      }
      const descuento = await this.descuentoVigente(qr, idAtencion);
      if (!descuento) {
        throw new BadRequestException('Esta atención no tiene una sesión descontada para restituir.');
      }
      const idPaquete = Number(descuento.id_hd_paquete || atencion.id_hd_paquete);
      if (!idPaquete) throw new BadRequestException('La atención no está ligada a un plan.');
      await qr.query(
        `SELECT id_hd_paquete FROM cli_hd_paquete WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO' FOR UPDATE`,
        [idPaquete],
      );
      const ultima = await this.ultimaSesionDescontadaDelPlan(qr, idPaquete);
      if (!ultima || Number(ultima.id_atencion) !== Number(idAtencion)) {
        throw new BadRequestException('Solo se puede restituir la última sesión realizada.');
      }
      await this.devolverContador(qr, descuento);
      await qr.query(
        `INSERT INTO cli_hd_sesion_movimiento
          (id_hd_paquete, id_hd_componente, id_atencion, tipo, motivo, id_usuario)
         VALUES (?,?,?,'RESTITUCION',?,?)`,
        [
          descuento.id_hd_paquete,
          descuento.id_hd_componente || null,
          idAtencion,
          motivo.slice(0, 255),
          userId,
        ],
      );
      if (atencion.id_cita) {
        await qr.query(
          `UPDATE cli_hd_cita_sesion
           SET estado_registro = 'ELIMINADO'
           WHERE id_cita = ? AND estado_registro = 'ACTIVO'`,
          [atencion.id_cita],
        );
      }
      await qr.commitTransaction();
      return { ok: true, message: 'Sesión restituida. La atención clínica permanece cerrada.' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  /** Última sesión consumida del plan: mayor numero_sesion (o id_movimiento) con DESCUENTO vigente. */
  private async ultimaSesionDescontadaDelPlan(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idPaquete: number,
  ) {
    const [row] = await qr.query(
      `SELECT m.id_atencion, m.id_movimiento,
              COALESCE(s.numero_sesion, 0) AS numero_sesion
       FROM cli_hd_sesion_movimiento m
       JOIN cli_hd_atencion a ON a.id_atencion = m.id_atencion AND a.estado_registro = 'ACTIVO'
       LEFT JOIN cli_hd_cita_sesion s
         ON s.id_cita = a.id_cita AND s.estado_registro = 'ACTIVO'
       WHERE m.id_hd_paquete = ? AND m.tipo = 'DESCUENTO'
         AND NOT EXISTS (
           SELECT 1 FROM cli_hd_sesion_movimiento r
           WHERE r.id_atencion = m.id_atencion
             AND r.id_movimiento > m.id_movimiento
             AND r.tipo = 'RESTITUCION'
         )
       ORDER BY COALESCE(s.numero_sesion, 0) DESC, m.id_movimiento DESC
       LIMIT 1`,
      [idPaquete],
    );
    return row || null;
  }

  private async persistirAtencion(
    idUnidad: number,
    idHistoria: number,
    cita: any,
    dto: any,
    userId: number,
    exigirComponente: boolean,
    qrExterno?: { query: (sql: string, params?: unknown[]) => Promise<any> },
  ) {
    const qr = qrExterno || this.db;
    const [existe] = await qr.query(
      `SELECT id_atencion, estado FROM cli_hd_atencion
       WHERE id_cita = ? AND estado_registro = 'ACTIVO'`,
      [cita.id_cita],
    );
    if (existe?.estado === 'FINALIZADA') {
      throw new BadRequestException('La atención está cerrada. El texto original se conserva.');
    }
    const paquete = await this.resolverSeleccion(
      qr,
      idUnidad,
      idHistoria,
      dto,
      userId,
      exigirComponente,
    );
    const campos = [
      texto(dto?.anamnesis) || null,
      texto(dto?.zona) || null,
      ladoValido(dto?.lado),
      texto(dto?.parametros) || null,
      texto(dto?.evolucion) || null,
      texto(dto?.incidencias) || null,
      texto(dto?.indicaciones) || null,
      fechaONull(dto?.proxima_revision),
    ];
    let idAtencion = Number(existe?.id_atencion || 0);
    if (!idAtencion) {
      const res: any = await qr.query(
        `INSERT INTO cli_hd_atencion
          (id_unidad, id_historia_digital, id_cita, id_paciente, id_personal,
           id_hd_paquete, id_hd_componente, id_item, anamnesis, zona, lado, parametros,
           evolucion, incidencias, indicaciones, proxima_revision, id_usuario_crea)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          idUnidad,
          idHistoria,
          cita.id_cita,
          cita.id_paciente,
          cita.id_personal || null,
          paquete.idPaquete,
          paquete.idComponente,
          paquete.idItem,
          ...campos,
          userId,
        ],
      );
      idAtencion = Number(res.insertId);
    } else {
      await qr.query(
        `UPDATE cli_hd_atencion SET
           id_hd_paquete = ?, id_hd_componente = ?, id_item = ?, anamnesis = ?, zona = ?, lado = ?,
           parametros = ?, evolucion = ?, incidencias = ?, indicaciones = ?,
           proxima_revision = ?, id_usuario_mod = ?
         WHERE id_atencion = ?`,
        [paquete.idPaquete, paquete.idComponente, paquete.idItem, ...campos, userId, idAtencion],
      );
    }
    await this.guardarTecnologias(qr, idAtencion, dto?.tecnologias, idUnidad);
    await this.guardarMedida(qr, idHistoria, idAtencion, dto?.medida, userId);
    return idAtencion;
  }

  private async resolverSeleccion(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idUnidad: number,
    idHistoria: number,
    dto: any,
    userId: number,
    exigir: boolean,
  ) {
    const idItem = Number(dto?.id_item) || null;
    if (!idItem) {
      const elegido = await this.paqueteElegido(qr, idHistoria, dto, exigir);
      return { ...elegido, idItem: null as number | null };
    }
    const [item] = await qr.query(
      `SELECT id_item, tipo, nombre, sesiones
       FROM cli_catalogo_item
       WHERE id_item = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [idItem, idUnidad],
    );
    if (!item) throw new BadRequestException('El servicio o paquete no está en el catálogo de Sorela.');
    if (item.tipo !== 'paquete') return { idPaquete: null, idComponente: null, idItem };
    const idPaquete = await this.asegurarContrato(qr, idHistoria, item, idUnidad, userId);
    const comps = await qr.query(
      `SELECT id_hd_componente, id_servicio FROM cli_hd_paquete_componente
       WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO'`,
      [idPaquete],
    );
    const idServicio = Number(dto?.id_servicio) || null;
    let idComponente: number | null = null;
    if (idServicio) {
      const hit = comps.find((c) => Number(c.id_servicio) === idServicio);
      if (!hit) throw new BadRequestException('El componente no pertenece al paquete.');
      idComponente = Number(hit.id_hd_componente);
    } else if (Number(dto?.id_hd_componente)) {
      const hit = comps.find((c) => Number(c.id_hd_componente) === Number(dto.id_hd_componente));
      if (!hit) throw new BadRequestException('El componente no pertenece al paquete.');
      idComponente = Number(hit.id_hd_componente);
    }
    void exigir;
    return { idPaquete, idComponente, idItem };
  }

  private async asegurarContrato(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idHistoria: number,
    item: any,
    idUnidad: number,
    userId: number,
  ) {
    const [abierto] = await qr.query(
      `SELECT id_hd_paquete, sesiones_total, sesiones_usadas
       FROM cli_hd_paquete
       WHERE id_historia_digital = ? AND id_item = ? AND estado_registro = 'ACTIVO'
         AND sesiones_usadas < sesiones_total
       ORDER BY id_hd_paquete DESC LIMIT 1`,
      [idHistoria, item.id_item],
    );
    if (abierto) return Number(abierto.id_hd_paquete);
    const precio = await this.precioVigente(qr, Number(item.id_item));
    const sesiones = Number(item.sesiones) || 1;
    const res: any = await qr.query(
      `INSERT INTO cli_hd_paquete
        (id_historia_digital, id_item, nombre, sesiones_total, sesiones_usadas, precio_acordado, id_usuario_crea)
       VALUES (?,?,?,?,0,?,?)`,
      [idHistoria, item.id_item, item.nombre, sesiones, precio, userId],
    );
    const id = Number(res.insertId);
    const comps = await qr.query(
      `SELECT c.id_servicio, s.nombre, c.cantidad
       FROM cli_catalogo_componente c
       JOIN cli_catalogo_item s ON s.id_item = c.id_servicio AND s.estado_registro = 'ACTIVO'
       WHERE c.id_paquete = ?`,
      [item.id_item],
    );
    let total = 0;
    for (const c of comps) {
      const cantidad = Number(c.cantidad) || 0;
      if (cantidad <= 0) continue;
      total += cantidad;
      await qr.query(
        `INSERT INTO cli_hd_paquete_componente
          (id_hd_paquete, id_servicio, nombre, sesiones_total, sesiones_usadas, id_usuario_crea)
         VALUES (?,?,?,?,0,?)`,
        [id, c.id_servicio, c.nombre, cantidad, userId],
      );
    }
    if (total > 0) {
      await qr.query(`UPDATE cli_hd_paquete SET sesiones_total = ? WHERE id_hd_paquete = ?`, [total, id]);
    }
    return id;
  }

  private async precioVigente(qr: { query: (sql: string, params?: unknown[]) => Promise<any> }, idItem: number) {
    const [row] = await qr.query(
      `SELECT monto FROM cli_catalogo_vigencia
       WHERE id_item = ? AND estado_registro = 'ACTIVO'
         AND vigente_desde <= CURDATE()
         AND (vigente_hasta IS NULL OR vigente_hasta >= CURDATE())
       ORDER BY vigente_desde DESC LIMIT 1`,
      [idItem],
    );
    return row ? Number(row.monto) : 0;
  }

  async programarSesion(idCita: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const cita = await this.citaSorela(idCita, idUnidad);
    const historia = await this.asegurar(idUnidad, Number(cita.id_paciente), userId);
    const idItem = Number(dto?.id_item);
    if (!idItem) throw new BadRequestException('Elija un servicio o paquete.');
    const fecha = fechaONull(dto?.fecha);
    const hora = texto(dto?.hora_inicio).slice(0, 5);
    if (!fecha || !/^\d{2}:\d{2}$/.test(hora)) {
      throw new BadRequestException('Indique la fecha y la hora de la cita.');
    }
    const duracion = Math.min(240, Math.max(15, Number(dto?.duracion_minutos) || 60));
    const idPersonal = Number(dto?.id_personal) || Number(cita.id_personal);
    if (!idPersonal) throw new BadRequestException('Elija la cosmiatra.');
    this.rechazarCitaCerrada(cita.estado);
    const [tipo] = await this.db.query(
      `SELECT id_tipo_cita, duracion_default_minutos
       FROM cli_tipo_cita
       WHERE estado_registro = 'ACTIVO' AND requiere_tratamiento = 0
         AND codigo IN ('SEGUIMIENTO', 'CONSULTA', 'CITA_SIMPLE')
       ORDER BY FIELD(codigo, 'SEGUIMIENTO', 'CONSULTA', 'CITA_SIMPLE')
       LIMIT 1`,
    );
    if (!tipo) throw new BadRequestException('No está configurado un tipo de cita de seguimiento.');
    const [item] = await this.db.query(
      `SELECT id_item, tipo, nombre, sesiones FROM cli_catalogo_item
       WHERE id_item = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [idItem, idUnidad],
    );
    if (!item) throw new BadRequestException('El servicio o paquete no está en el catálogo de Sorela.');

    let idPaquete: number | null = null;
    if (item.tipo === 'paquete') {
      idPaquete = await this.asegurarContrato(this.db, historia.id_historia_digital, item, idUnidad, userId);
    }
    const enEsta = dto?.en_esta_cita === true || dto?.en_esta_cita === 1 || dto?.en_esta_cita === '1';
    const [ligada] = await this.db.query(
      `SELECT id_item, numero_sesion FROM cli_hd_cita_sesion
       WHERE id_cita = ? AND estado_registro = 'ACTIVO'`,
      [cita.id_cita],
    );
    if (ligada && Number(ligada.id_item) !== idItem) {
      throw new BadRequestException('Esta cita ya está ligada a otro servicio o paquete.');
    }
    const vigentes = await this.sesionesDeItem(historia.id_historia_digital, idItem);
    const abiertasPrevias = vigentes.filter((s) =>
      ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION'].includes(String(s.estado)),
    );
    let usadasPlan = 0;
    if (idPaquete) {
      const [paqRow] = await this.db.query(
        `SELECT sesiones_usadas FROM cli_hd_paquete WHERE id_hd_paquete = ?`,
        [idPaquete],
      );
      usadasPlan = Number(paqRow?.sesiones_usadas || 0);
    } else {
      usadasPlan = vigentes.filter((s) => String(s.estado) === 'FINALIZADA').length;
    }
    let numeroEsta = 0;
    if (ligada) {
      const efEsta = vigentes.find((s) => Number(s.id_cita) === Number(cita.id_cita));
      numeroEsta = efEsta ? Number(efEsta.numero_sesion) : 0;
    }
    if (enEsta && !ligada) {
      if (usadasPlan === 0 && abiertasPrevias.length === 0) {
        await this.ligarSesion(cita.id_cita, historia.id_historia_digital, idItem, idPaquete, 1, userId);
        numeroEsta = 1;
        vigentes.push({
          id_cita: cita.id_cita,
          numero_sesion: 1,
          id_item: idItem,
          estado: cita.estado || 'PENDIENTE',
        });
      } else {
        throw new BadRequestException(
          'No se puede marcar esta cita como primera sesión: ya hay sesiones del ítem.',
        );
      }
    }
    const abiertas = vigentes.filter((s) =>
      ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION'].includes(String(s.estado)),
    );
    const siguiente = enEsta
      ? numeroEsta + 1
      : numeroSiguienteConAbiertas(usadasPlan, abiertas.length);
    if (vigentes.some((s) => Number(s.numero_sesion) === siguiente)) {
      throw new BadRequestException(`La sesión ${siguiente} ya está programada.`);
    }
    let creada: any;
    try {
      creada = await this.agenda.create(
        {
          id_sede: Number(cita.id_sede),
          id_paciente: Number(cita.id_paciente),
          id_tipo_cita: Number(tipo.id_tipo_cita),
          id_personal: idPersonal,
          fecha_cita: fecha,
          hora_inicio: `${hora}:00`,
          hora_fin: sumarMinutos(`${hora}:00`, duracion),
          notas: `Sesión ${siguiente} · ${item.nombre}`,
          precio_acordado: item.tipo === 'paquete' ? undefined : await this.precioVigente(this.db, idItem),
        } as any,
        userId,
      );
    } catch (e: any) {
      const body = typeof e?.getResponse === 'function' ? e.getResponse() : null;
      const msg =
        (body && typeof body === 'object' && (body.mensaje || body.message)) ||
        (typeof body === 'string' ? body : null) ||
        e?.message;
      throw new BadRequestException(typeof msg === 'string' && msg !== 'Bad Request Exception' ? msg : 'No se pudo programar la cita.');
    }
    const idNueva = Number(creada?.id);
    if (!idNueva) throw new BadRequestException('La cita no quedó registrada.');
    await this.ligarSesion(idNueva, historia.id_historia_digital, idItem, idPaquete, siguiente, userId);
    return {
      id_cita: idNueva,
      numero_sesion: siguiente,
      sesiones: await this.sesionesDe(historia.id_historia_digital),
      message: siguiente === 1 ? 'Primera sesión programada' : `Sesión ${siguiente} programada`,
    };
  }

  async programarDesdePaquete(idPaquete: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const [paquete] = await this.db.query(
      `SELECT p.id_hd_paquete, p.id_historia_digital, p.id_item, p.nombre, p.sesiones_total, p.sesiones_usadas,
              h.id_paciente
       FROM cli_hd_paquete p
       JOIN cli_historia_digital h ON h.id_historia_digital = p.id_historia_digital
       WHERE p.id_hd_paquete = ? AND h.id_unidad = ? AND p.estado_registro = 'ACTIVO'`,
      [idPaquete, idUnidad],
    );
    if (!paquete) throw new BadRequestException('El paquete no pertenece a Sorela.');
    if (Number(paquete.sesiones_usadas) >= Number(paquete.sesiones_total)) {
      throw new BadRequestException('Este paquete ya no tiene sesiones pendientes.');
    }
    const fecha = fechaONull(dto?.fecha);
    const hora = texto(dto?.hora_inicio).slice(0, 5);
    if (!fecha || !/^\d{2}:\d{2}$/.test(hora)) {
      throw new BadRequestException('Indique la fecha y la hora de la cita.');
    }
    const duracion = Math.min(240, Math.max(15, Number(dto?.duracion_minutos) || 60));
    const [ultima] = await this.db.query(
      `SELECT id_sede, id_personal FROM cli_cita
       WHERE id_paciente = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'
       ORDER BY fecha_cita DESC, hora_inicio DESC LIMIT 1`,
      [paquete.id_paciente, idUnidad],
    );
    const idPersonal = Number(dto?.id_personal) || Number(ultima?.id_personal);
    if (!idPersonal) throw new BadRequestException('Elija la cosmiatra.');
    let idSede = Number(ultima?.id_sede);
    if (!idSede) {
      const [sede] = await this.db.query(
        `SELECT id_sede FROM cli_sede WHERE id_unidad = ? AND estado_registro = 'ACTIVO' ORDER BY id_sede LIMIT 1`,
        [idUnidad],
      );
      idSede = Number(sede?.id_sede);
    }
    if (!idSede) throw new BadRequestException('Registre una sede de Sorela antes de programar.');
    const [tipo] = await this.db.query(
      `SELECT id_tipo_cita FROM cli_tipo_cita
       WHERE estado_registro = 'ACTIVO' AND requiere_tratamiento = 0
         AND codigo IN ('SEGUIMIENTO', 'CONSULTA', 'CITA_SIMPLE')
       ORDER BY FIELD(codigo, 'SEGUIMIENTO', 'CONSULTA', 'CITA_SIMPLE')
       LIMIT 1`,
    );
    if (!tipo) throw new BadRequestException('No está configurado un tipo de cita de seguimiento.');
    const vigentes = await this.sesionesDeItem(Number(paquete.id_historia_digital), Number(paquete.id_item));
    const abiertas = vigentes.filter((s) =>
      ['PENDIENTE', 'CONFIRMADA', 'EN_ATENCION'].includes(String(s.estado)),
    );
    const siguiente = numeroSiguienteConAbiertas(Number(paquete.sesiones_usadas), abiertas.length);
    if (siguiente > Number(paquete.sesiones_total)) {
      throw new BadRequestException('Ya están programadas todas las sesiones de este paquete.');
    }
    let creada: any;
    try {
      creada = await this.agenda.create(
        {
          id_sede: idSede,
          id_paciente: Number(paquete.id_paciente),
          id_tipo_cita: Number(tipo.id_tipo_cita),
          id_personal: idPersonal,
          fecha_cita: fecha,
          hora_inicio: `${hora}:00`,
          hora_fin: sumarMinutos(`${hora}:00`, duracion),
          notas: `Sesión ${siguiente} · ${paquete.nombre}`,
        } as any,
        userId,
      );
    } catch (e: any) {
      const body = typeof e?.getResponse === 'function' ? e.getResponse() : null;
      const msg =
        (body && typeof body === 'object' && (body.mensaje || body.message)) ||
        (typeof body === 'string' ? body : null) ||
        e?.message;
      throw new BadRequestException(typeof msg === 'string' && msg !== 'Bad Request Exception' ? msg : 'No se pudo programar la cita.');
    }
    const idNueva = Number(creada?.id);
    if (!idNueva) throw new BadRequestException('La cita no quedó registrada.');
    await this.ligarSesion(
      idNueva,
      Number(paquete.id_historia_digital),
      Number(paquete.id_item),
      Number(paquete.id_hd_paquete),
      siguiente,
      userId,
    );
    return { id_cita: idNueva, numero_sesion: siguiente, message: `Sesión ${siguiente} programada` };
  }

  private async ligarSesion(
    idCita: number,
    idHistoria: number,
    idItem: number,
    idPaquete: number | null,
    numero: number,
    userId: number,
  ) {
    await this.db.query(
      `INSERT INTO cli_hd_cita_sesion
        (id_cita, id_historia_digital, id_item, id_hd_paquete, numero_sesion, id_usuario_crea)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         id_item = VALUES(id_item),
         id_hd_paquete = VALUES(id_hd_paquete),
         numero_sesion = VALUES(numero_sesion),
         estado_registro = 'ACTIVO'`,
      [idCita, idHistoria, idItem, idPaquete, numero, userId],
    );
  }

  private async sesionesDeItem(idHistoria: number, idItem: number) {
    const rows = await this.db.query(
      `SELECT s.id_cita, s.id_item, s.id_hd_paquete, s.numero_sesion, c.estado,
              DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha_cita,
              TIME_FORMAT(c.hora_inicio, '%H:%i:%s') AS hora_inicio
       FROM cli_hd_cita_sesion s
       JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
       WHERE s.id_historia_digital = ? AND s.id_item = ? AND s.estado_registro = 'ACTIVO'
         AND c.estado NOT IN ('CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA')`,
      [idHistoria, idItem],
    );
    return this.aplicarNumerosEfectivosSesiones(idHistoria, rows || []);
  }

  /** Lista de sesiones para UI: numero_sesion efectivo (abiertas recalculadas). */
  private async sesionesDe(idHistoria: number) {
    const rows = await this.db.query(
      `SELECT s.id_cita, s.id_item, s.id_hd_paquete, s.numero_sesion, c.estado,
              DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora,
              TIME_FORMAT(c.hora_inicio, '%H:%i:%s') AS hora_inicio,
              TRIM(CONCAT(IFNULL(pe.apellidos,''), ', ', IFNULL(pe.nombres,''))) AS personal
       FROM cli_hd_cita_sesion s
       JOIN cli_cita c ON c.id_cita = s.id_cita AND c.estado_registro = 'ACTIVO'
       LEFT JOIN cli_personal pe ON pe.id_personal = c.id_personal
       WHERE s.id_historia_digital = ? AND s.estado_registro = 'ACTIVO'
         AND c.estado NOT IN ('CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA')
       ORDER BY c.fecha_cita, c.hora_inicio, s.id_cita`,
      [idHistoria],
    );
    const conEfectivo = await this.aplicarNumerosEfectivosSesiones(idHistoria, rows || []);
    return conEfectivo.sort(
      (a: any, b: any) =>
        Number(a.numero_sesion) - Number(b.numero_sesion) ||
        String(a.fecha || '').localeCompare(String(b.fecha || '')) ||
        String(a.hora || '').localeCompare(String(b.hora || '')),
    );
  }

  /** Sustituye numero_sesion de disco por efectivo vía numerosEfectivosPlan (por plan). */
  private async aplicarNumerosEfectivosSesiones(idHistoria: number, rows: any[]) {
    if (!rows.length) return rows;
    const paquetes = await this.db.query(
      `SELECT id_hd_paquete, id_item, sesiones_usadas
       FROM cli_hd_paquete
       WHERE id_historia_digital = ? AND estado_registro = 'ACTIVO'`,
      [idHistoria],
    );
    const usadasPorPaq = new Map<number, number>();
    const usadasPorItem = new Map<number, number>();
    for (const p of paquetes || []) {
      const u = Number(p.sesiones_usadas || 0);
      usadasPorPaq.set(Number(p.id_hd_paquete), u);
      const idItem = Number(p.id_item);
      if (idItem > 0) {
        usadasPorItem.set(idItem, Math.max(usadasPorItem.get(idItem) || 0, u));
      }
    }
    const grupos = new Map<string, any[]>();
    for (const r of rows) {
      const idPaq = r.id_hd_paquete != null ? Number(r.id_hd_paquete) : 0;
      const key = idPaq > 0 ? `p:${idPaq}` : `i:${Number(r.id_item)}`;
      const lista = grupos.get(key) || [];
      lista.push(r);
      grupos.set(key, lista);
    }
    const out: any[] = [];
    for (const [key, lista] of grupos) {
      let usadas = 0;
      if (key.startsWith('p:')) usadas = usadasPorPaq.get(Number(key.slice(2))) || 0;
      else usadas = usadasPorItem.get(Number(key.slice(2))) || 0;
      const efectivos = numerosEfectivosPlan(
        usadas,
        lista.map((r) => ({
          id_cita: Number(r.id_cita),
          estado: String(r.estado),
          fecha_cita: String(r.fecha_cita || r.fecha || ''),
          hora_inicio: String(r.hora_inicio || r.hora || ''),
          numero_sesion_almacenado: Number(r.numero_sesion),
        })),
      );
      const porCita = new Map(efectivos.map((e) => [e.id_cita, e]));
      for (const r of lista) {
        const ef = porCita.get(Number(r.id_cita));
        out.push({
          ...r,
          numero_sesion: ef ? ef.numero_sesion : Number(r.numero_sesion),
          numero_sesion_definitivo: ef ? ef.definitivo : String(r.estado) === 'FINALIZADA',
        });
      }
    }
    return out;
  }

  private async catalogoAtencion(idUnidad: number) {
    const items = await this.db.query(
      `SELECT i.id_item, i.tipo, i.codigo, i.categoria, i.nombre, i.sesiones, i.sin_tarifa,
              (SELECT v.monto FROM cli_catalogo_vigencia v
               WHERE v.id_item = i.id_item AND v.estado_registro = 'ACTIVO'
                 AND v.vigente_desde <= CURDATE()
                 AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= CURDATE())
               ORDER BY v.vigente_desde DESC LIMIT 1) AS precio
       FROM cli_catalogo_item i
       WHERE i.id_unidad = ? AND i.estado_registro = 'ACTIVO'
       ORDER BY i.tipo DESC, i.categoria, i.nombre`,
      [idUnidad],
    );
    const ids = items.filter((i) => i.tipo === 'paquete').map((i) => Number(i.id_item));
    const comps = ids.length
      ? await this.db.query(
          `SELECT c.id_paquete, c.id_servicio, c.cantidad, s.nombre
           FROM cli_catalogo_componente c
           JOIN cli_catalogo_item s ON s.id_item = c.id_servicio
           WHERE c.id_paquete IN (${ids.map(() => '?').join(',')})`,
          ids,
        )
      : [];
    return items.map((i) => ({
      ...i,
      sesiones: i.sesiones == null ? null : Number(i.sesiones),
      precio: i.precio == null ? null : Number(i.precio),
      grupo: i.tipo === 'paquete' ? 'Paquetes' : 'Servicios',
      componentes: comps
        .filter((c) => Number(c.id_paquete) === Number(i.id_item))
        .map((c) => ({
          id_servicio: Number(c.id_servicio),
          nombre: c.nombre,
          cantidad: Number(c.cantidad),
        })),
    }));
  }

  private personalDeUnidad(idUnidad: number) {
    return this.db.query(
      `SELECT DISTINCT p.id_personal, p.nombres, p.apellidos
       FROM cli_personal p
       JOIN cli_personal_sede ps ON ps.id_personal = p.id_personal AND ps.estado_registro = 'ACTIVO'
       JOIN cli_sede s ON s.id_sede = ps.id_sede AND s.id_unidad = ? AND s.estado_registro = 'ACTIVO'
       WHERE p.estado_registro = 'ACTIVO' AND p.estado = 'ACTIVO'
       ORDER BY p.apellidos, p.nombres`,
      [idUnidad],
    );
  }

  private async paqueteElegido(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idHistoria: number,
    dto: any,
    exigir: boolean,
  ) {
    const idPaquete = Number(dto?.id_hd_paquete) || null;
    const idComponente = Number(dto?.id_hd_componente) || null;
    if (!idPaquete) return { idPaquete: null, idComponente: null };
    const [paquete] = await qr.query(
      `SELECT id_hd_paquete FROM cli_hd_paquete
       WHERE id_hd_paquete = ? AND id_historia_digital = ? AND estado_registro = 'ACTIVO'`,
      [idPaquete, idHistoria],
    );
    if (!paquete) throw new BadRequestException('El paquete no pertenece a esta historia.');
    const comps = await qr.query(
      `SELECT id_hd_componente FROM cli_hd_paquete_componente
       WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO'`,
      [idPaquete],
    );
    void exigir;
    if (comps.length && !idComponente) return { idPaquete, idComponente: null };
    if (idComponente) {
      const ok = comps.some((c) => Number(c.id_hd_componente) === idComponente);
      if (!ok) throw new BadRequestException('El componente no pertenece al paquete.');
    }
    return { idPaquete, idComponente: idComponente || null };
  }

  private async guardarTecnologias(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idAtencion: number,
    crudas: unknown,
    idUnidad: number,
  ) {
    const ids = [...new Set((Array.isArray(crudas) ? crudas : []).map(Number).filter((n) => n > 0))];
    await qr.query(
      `UPDATE cli_hd_atencion_tecnologia SET estado_registro = 'ELIMINADO' WHERE id_atencion = ?`,
      [idAtencion],
    );
    for (const id of ids) {
      const [tec] = await qr.query(
        `SELECT id_tecnologia FROM cli_catalogo_tecnologia
         WHERE id_tecnologia = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
        [id, idUnidad],
      );
      if (!tec) throw new BadRequestException('Una tecnología no pertenece al catálogo de Sorela.');
      await qr.query(
        `INSERT INTO cli_hd_atencion_tecnologia (id_atencion, id_tecnologia, estado_registro)
         VALUES (?,?, 'ACTIVO')
         ON DUPLICATE KEY UPDATE estado_registro = 'ACTIVO'`,
        [idAtencion, id],
      );
    }
  }

  private async guardarMedida(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idHistoria: number,
    idAtencion: number,
    medida: any,
    userId: number,
  ) {
    const campos = [
      'peso',
      'agua_corporal',
      'grasa_corporal',
      'masa_muscular',
      'abdomen_alto',
      'cintura',
      'ombligo',
      'cadera',
    ];
    const valores = campos.map((c) => numeroONull(medida?.[c]));
    const observaciones = texto(medida?.observaciones).slice(0, 255) || null;
    const hay = valores.some((v) => v != null) || !!observaciones;
    const [existe] = await qr.query(
      `SELECT id_medida FROM cli_hd_medida
       WHERE id_atencion = ? AND estado_registro = 'ACTIVO'`,
      [idAtencion],
    );
    if (!hay) {
      if (existe) {
        await qr.query(
          `UPDATE cli_hd_medida SET estado_registro = 'ELIMINADO' WHERE id_medida = ?`,
          [existe.id_medida],
        );
      }
      return;
    }
    const fecha = fechaONull(medida?.fecha) || new Date().toISOString().slice(0, 10);
    if (existe) {
      await qr.query(
        `UPDATE cli_hd_medida SET fecha=?, peso=?, agua_corporal=?, grasa_corporal=?, masa_muscular=?,
           abdomen_alto=?, cintura=?, ombligo=?, cadera=?, observaciones=?
         WHERE id_medida=?`,
        [fecha, ...valores, observaciones, existe.id_medida],
      );
      return;
    }
    await qr.query(
      `INSERT INTO cli_hd_medida
        (id_historia_digital, id_atencion, fecha, peso, agua_corporal, grasa_corporal, masa_muscular,
         abdomen_alto, cintura, ombligo, cadera, observaciones, id_usuario_crea)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [idHistoria, idAtencion, fecha, ...valores, observaciones, userId],
    );
  }

  private async medidaDe(idAtencion: number) {
    const [row] = await this.db.query(
      `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, peso, agua_corporal, grasa_corporal,
              masa_muscular, abdomen_alto, cintura, ombligo, cadera, observaciones
       FROM cli_hd_medida
       WHERE id_atencion = ? AND estado_registro = 'ACTIVO'`,
      [idAtencion],
    );
    return row || null;
  }

  private async descontarSesion(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idAtencion: number,
    dto: any,
    idUnidad: number,
    userId: number,
  ): Promise<ResultadoDescuento> {
    const vacio: ResultadoDescuento = {
      descontado: false,
      idPaquete: null,
      idItem: null,
      numeroSesion: null,
    };
    const idPaquete = Number(dto?.id_hd_paquete) || null;
    if (!idPaquete) return vacio;
    const [paquete] = await qr.query(
      `SELECT p.id_hd_paquete, p.id_item, p.sesiones_total, p.sesiones_usadas
       FROM cli_hd_paquete p
       JOIN cli_historia_digital h ON h.id_historia_digital = p.id_historia_digital
       WHERE p.id_hd_paquete = ? AND h.id_unidad = ? AND p.estado_registro = 'ACTIVO'
       FOR UPDATE`,
      [idPaquete, idUnidad],
    );
    if (!paquete) throw new BadRequestException('El paquete no está disponible.');
    // sesiones_usadas ya leídas bajo FOR UPDATE del plan; el numero_sesion definitivo
    // será el valor tras el incremento (+ sync del vínculo en la misma TX).
    let idComponente = Number(dto?.id_hd_componente) || null;
    if (!idComponente) {
      const comps = await qr.query(
        `SELECT id_hd_componente FROM cli_hd_paquete_componente
         WHERE id_hd_paquete = ? AND estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [idPaquete],
      );
      if (comps.length === 1) idComponente = Number(comps[0].id_hd_componente);
    }
    if (idComponente && !Number(dto?.id_hd_componente)) {
      await qr.query(
        `UPDATE cli_hd_atencion SET id_hd_componente = ? WHERE id_atencion = ?`,
        [idComponente, idAtencion],
      );
    }
    if (idComponente) {
      const [compLock] = await qr.query(
        `SELECT id_hd_componente, sesiones_usadas FROM cli_hd_paquete_componente
         WHERE id_hd_componente = ? AND id_hd_paquete = ? AND estado_registro = 'ACTIVO'
         FOR UPDATE`,
        [idComponente, idPaquete],
      );
      if (!compLock) throw new BadRequestException('Ese componente no está disponible.');
      const res: any = await qr.query(
        `UPDATE cli_hd_paquete_componente
         SET sesiones_usadas = sesiones_usadas + 1
         WHERE id_hd_componente = ? AND id_hd_paquete = ? AND estado_registro = 'ACTIVO'
           AND sesiones_usadas < sesiones_total`,
        [idComponente, idPaquete],
      );
      if (!filasAfectadas(res)) {
        throw new BadRequestException('Ese componente ya no tiene sesiones pendientes.');
      }
      await this.ajustarTotalPaquete(qr, idPaquete);
    } else {
      const res: any = await qr.query(
        `UPDATE cli_hd_paquete
         SET sesiones_usadas = sesiones_usadas + 1
         WHERE id_hd_paquete = ? AND sesiones_usadas < sesiones_total AND estado_registro = 'ACTIVO'`,
        [idPaquete],
      );
      if (!filasAfectadas(res)) {
        throw new BadRequestException('Ese paquete ya no tiene sesiones pendientes.');
      }
    }
    await qr.query(
      `INSERT INTO cli_hd_sesion_movimiento
        (id_hd_paquete, id_hd_componente, id_atencion, tipo, motivo, id_usuario)
       VALUES (?,?,?,'DESCUENTO','Atención finalizada',?)`,
      [idPaquete, idComponente, idAtencion, userId],
    );
    const [despues] = await qr.query(
      `SELECT id_item, sesiones_usadas FROM cli_hd_paquete WHERE id_hd_paquete = ?`,
      [idPaquete],
    );
    return {
      descontado: true,
      idPaquete,
      idItem: despues?.id_item != null ? Number(despues.id_item) : null,
      numeroSesion: Number(despues?.sesiones_usadas || 0) || null,
    };
  }

  /**
   * Alinea cli_hd_cita_sesion con el plan descontado (o libera si no hubo descuento).
   * UNIQUE(id_cita) → upsert in-place; soft-delete si se finaliza sin plan.
   */
  private async sincronizarVinculoTrasDescuento(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idCita: number,
    idHistoria: number,
    userId: number,
    descuento: ResultadoDescuento,
  ): Promise<{ idCitaSesion: number; antiguos: Record<string, unknown> } | null> {
    const [row] = await qr.query(
      `SELECT id_cita_sesion, id_hd_paquete, id_item, numero_sesion, estado_registro
       FROM cli_hd_cita_sesion WHERE id_cita = ?`,
      [idCita],
    );
    const vinculo = row
      ? {
          id_cita_sesion: Number(row.id_cita_sesion),
          id_hd_paquete: row.id_hd_paquete != null ? Number(row.id_hd_paquete) : null,
          id_item: row.id_item != null ? Number(row.id_item) : null,
          numero_sesion: row.numero_sesion != null ? Number(row.numero_sesion) : null,
          estado_registro: String(row.estado_registro || 'ACTIVO'),
        }
      : null;
    const accion = decidirSyncVinculo(descuento, vinculo);
    if (accion.tipo === 'upsert') {
      await qr.query(
        `INSERT INTO cli_hd_cita_sesion
          (id_cita, id_historia_digital, id_item, id_hd_paquete, numero_sesion, id_usuario_crea)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           id_historia_digital = VALUES(id_historia_digital),
           id_item = VALUES(id_item),
           id_hd_paquete = VALUES(id_hd_paquete),
           numero_sesion = VALUES(numero_sesion),
           estado_registro = 'ACTIVO'`,
        [idCita, idHistoria, accion.idItem, accion.idPaquete, accion.numeroSesion, userId],
      );
      return null;
    }
    if (accion.tipo === 'liberar' && accion.idCitaSesion > 0) {
      await qr.query(
        `UPDATE cli_hd_cita_sesion
         SET estado_registro = 'ELIMINADO'
         WHERE id_cita = ? AND estado_registro = 'ACTIVO'`,
        [idCita],
      );
      return { idCitaSesion: accion.idCitaSesion, antiguos: accion.antiguos };
    }
    return null;
  }

  private async ajustarTotalPaquete(
    qr: { query: (sql: string, params?: unknown[]) => Promise<any> },
    idPaquete: number,
  ) {
    await qr.query(
      `UPDATE cli_hd_paquete p
       SET sesiones_usadas = (
         SELECT COALESCE(SUM(c.sesiones_usadas), 0)
         FROM cli_hd_paquete_componente c
         WHERE c.id_hd_paquete = p.id_hd_paquete AND c.estado_registro = 'ACTIVO'
       ) + (
         SELECT COUNT(*)
         FROM cli_hd_sesion_movimiento m
         WHERE m.id_hd_paquete = p.id_hd_paquete
           AND m.id_hd_componente IS NULL
           AND m.tipo = 'DESCUENTO'
           AND NOT EXISTS (
             SELECT 1 FROM cli_hd_sesion_movimiento r
             WHERE r.id_atencion = m.id_atencion
               AND r.id_movimiento > m.id_movimiento
               AND r.tipo = 'RESTITUCION'
           )
       )
       WHERE p.id_hd_paquete = ?`,
      [idPaquete],
    );
  }

  private async descuentoVigente(qr: { query: (sql: string, params?: unknown[]) => Promise<any> }, idAtencion: number) {
    const [ultimo] = await qr.query(
      `SELECT id_movimiento, id_hd_paquete, id_hd_componente, tipo
       FROM cli_hd_sesion_movimiento
       WHERE id_atencion = ?
       ORDER BY id_movimiento DESC
       LIMIT 1`,
      [idAtencion],
    );
    return ultimo?.tipo === 'DESCUENTO' ? ultimo : null;
  }

  private async devolverContador(qr: { query: (sql: string, params?: unknown[]) => Promise<any> }, descuento: any) {
    if (descuento.id_hd_componente) {
      const res: any = await qr.query(
        `UPDATE cli_hd_paquete_componente
         SET sesiones_usadas = sesiones_usadas - 1
         WHERE id_hd_componente = ? AND sesiones_usadas > 0 AND estado_registro = 'ACTIVO'`,
        [descuento.id_hd_componente],
      );
      if (!filasAfectadas(res)) throw new BadRequestException('No hay sesión usada para restituir.');
      await this.ajustarTotalPaquete(qr, Number(descuento.id_hd_paquete));
      return;
    }
    const res: any = await qr.query(
      `UPDATE cli_hd_paquete
       SET sesiones_usadas = sesiones_usadas - 1
       WHERE id_hd_paquete = ? AND sesiones_usadas > 0 AND estado_registro = 'ACTIVO'`,
      [descuento.id_hd_paquete],
    );
    if (!filasAfectadas(res)) throw new BadRequestException('No hay sesión usada para restituir.');
  }

  private async citaSorela(idCita: number, idUnidad: number) {
    const [cita] = await this.db.query(
      `SELECT c.id_cita, c.id_paciente, c.id_personal, c.id_unidad, c.id_sede, c.estado,
              DATE_FORMAT(c.fecha_cita, '%Y-%m-%d') AS fecha,
              TIME_FORMAT(c.hora_inicio, '%H:%i') AS hora,
              TRIM(CONCAT(IFNULL(pe.apellidos,''), ', ', IFNULL(pe.nombres,''))) AS personal
       FROM cli_cita c
       LEFT JOIN cli_personal pe ON pe.id_personal = c.id_personal
       WHERE c.id_cita = ? AND c.estado_registro = 'ACTIVO'`,
      [idCita],
    );
    if (!cita) throw new NotFoundException('La cita no existe.');
    let unidad = cita.id_unidad == null ? null : Number(cita.id_unidad);
    if (unidad == null && cita.id_sede) {
      const [sede] = await this.db.query(
        `SELECT id_unidad FROM cli_sede WHERE id_sede = ? AND estado_registro = 'ACTIVO'`,
        [cita.id_sede],
      );
      unidad = sede?.id_unidad == null ? null : Number(sede.id_unidad);
    }
    if (unidad !== idUnidad) throw new ForbiddenException('La cita no pertenece a Sorela Medic.');
    return cita;
  }

  /** true salvo que el cliente envíe explícitamente consumir_sesion=false. */
  private flagConsumirSesion(dto: any): boolean {
    const v = dto?.consumir_sesion;
    if (v === false || v === 0 || v === '0' || String(v).toLowerCase() === 'false') return false;
    return true;
  }

  private rechazarCitaCerrada(estado: string) {
    const actual = String(estado || '');
    if (actual === 'FINALIZADA') throw new BadRequestException('Esta cita ya está finalizada.');
    if (['CANCELADA', 'NO_ASISTIO', 'REPROGRAMADA'].includes(actual)) {
      throw new BadRequestException('Una cita cancelada, reprogramada o con inasistencia no descuenta sesión.');
    }
  }

  private armarHistorial(evaluaciones: any[], cirugias: any[], citas: any[]) {
    const filas = [
      ...evaluaciones.map((e) => ({
        fecha: e.fecha,
        tipo: 'Evaluación',
        titulo: e.motivo || 'Evaluación',
        detalle: [e.zonas, e.plan_tratamiento].filter(Boolean).join(' · '),
      })),
      ...cirugias.map((c) => ({
        fecha: c.fecha,
        tipo: 'Cirugía',
        titulo: c.zonas || 'Cirugía',
        detalle: c.cirujano || '',
      })),
      ...citas.map((c) => ({
        fecha: c.fecha,
        tipo: c.estado === 'COMPLETADA' ? 'Sesión' : 'Cita',
        titulo: `${c.hora || ''} ${c.personal || ''}`.trim(),
        detalle: c.estado || '',
      })),
    ];
    return filas.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }
}

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

function fechaONull(v: unknown): string | null {
  const raw = texto(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function normalizarFecha(v: unknown): string | null {
  const raw = texto(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function flag(v: unknown): number | null {
  if (v === true || v === 1 || v === '1') return 1;
  if (v === false || v === 0 || v === '0') return 0;
  return null;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

function numeroONull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.slice(0, 5).split(':').map(Number);
  const total = h * 60 + m + minutos;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

function ladoValido(v: unknown): string | null {
  const lado = texto(v).toUpperCase();
  return ['DERECHO', 'IZQUIERDO', 'BILATERAL', 'CENTRAL'].includes(lado) ? lado : null;
}

function pendientesPaquete(p: any): number {
  if (Array.isArray(p?.componentes) && p.componentes.length) {
    return p.componentes.reduce(
      (s: number, c: any) => s + Math.max(0, Number(c.sesiones_total) - Number(c.sesiones_usadas)),
      0,
    );
  }
  return Math.max(0, Number(p?.sesiones_total || 0) - Number(p?.sesiones_usadas || 0));
}

function filasAfectadas(res: any): boolean {
  const n = Number(res?.affectedRows ?? res?.[0]?.affectedRows ?? 0);
  return n > 0;
}

/** Pagos netos del plan: cobros menos devoluciones. */
function netoPagadoPlan(pagos: any[]): number {
  return redondearMonto(
    (pagos || []).reduce((s, x) => {
      const m = Number(x?.monto || 0);
      return String(x?.tipo_pago || '').toUpperCase() === 'DEVOLUCION' ? s - m : s + m;
    }, 0),
  );
}
