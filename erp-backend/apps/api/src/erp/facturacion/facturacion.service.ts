import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AuditoriaService } from '@app/common';
import { UnidadScopeService } from '@app/auth';
import { DataSource, QueryRunner } from 'typeorm';
import { CotizacionDto, PagoDto } from './facturacion.dto';

@Injectable()
export class FacturacionService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly unidad: UnidadScopeService,
  ) {}

  private meta(page: number, limit: number, total: number) {
    return { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) };
  }

  private async listTable(table: string, pk: string, q: any) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 20));
    const w = [`estado_registro='ACTIVO'`];
    const p: any[] = [];
    if (q.id_paciente) {
      w.push('id_paciente=?');
      p.push(Number(q.id_paciente));
    }
    if (q.id_sede) await this.unidad.exigirSede(Number(q.id_sede));
    const filtro = this.unidad.sqlEmpresa('id_unidad', 'id_sede');
    if (filtro.sql) {
      w.push(filtro.sql);
      p.push(...filtro.params);
    }
    const where = w.join(' AND ');
    const [c] = await this.db.query(`SELECT COUNT(*) total FROM ${table} WHERE ${where}`, p);
    const data = await this.db.query(
      `SELECT * FROM ${table} WHERE ${where} ORDER BY ${pk} DESC LIMIT ? OFFSET ?`,
      [...p, limit, (page - 1) * limit],
    );
    return { data, meta: this.meta(page, limit, Number(c.total || 0)) };
  }

  cotizaciones(q: any) {
    return this.listTable('cli_cotizacion', 'id_cotizacion', q);
  }

  pagos(q: any) {
    return this.listTable('cli_pago', 'id_pago', q);
  }

  async getCotizacion(id: number) {
    const [c] = await this.db.query(
      `SELECT * FROM cli_cotizacion WHERE id_cotizacion=? AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!c) throw new NotFoundException('Cotización no encontrada');
    await this.unidad.exigirRegistro(c.id_unidad, c.id_sede);
    c.detalles = await this.db.query(
      `SELECT * FROM cli_cotizacion_detalle WHERE id_cotizacion=? AND estado_registro='ACTIVO' ORDER BY orden`,
      [id],
    );
    return c;
  }

  private async detalles(qr: QueryRunner, id: number, d: CotizacionDto, userId: number) {
    await qr.query(
      `UPDATE cli_cotizacion_detalle SET estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_cotizacion=? AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    let subtotal = 0;
    for (const [x, i] of d.detalles.map((item: any, index: number) => [item, index] as const)) {
      const sub = Math.max(
        0,
        Number(x.cantidad || 1) * Number(x.precio_unitario || 0) - Number(x.descuento || 0),
      );
      subtotal += sub;
      await qr.query(
        `INSERT INTO cli_cotizacion_detalle (id_cotizacion,id_tratamiento,id_paquete,descripcion,cantidad,precio_unitario,descuento,subtotal,orden,id_usuario_crea) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          x.id_tratamiento || null,
          x.id_paquete || null,
          x.descripcion,
          Number(x.cantidad || 1),
          Number(x.precio_unitario || 0),
          Number(x.descuento || 0),
          sub,
          x.orden || i + 1,
          userId,
        ],
      );
    }
    const total = Math.max(0, subtotal - Number(d.descuento || 0) + Number(d.igv || 0));
    await qr.query(
      `UPDATE cli_cotizacion SET subtotal=?,descuento=?,igv=?,total=?,id_usuario_mod=? WHERE id_cotizacion=?`,
      [subtotal, Number(d.descuento || 0), Number(d.igv || 0), total, userId, id],
    );
    return { subtotal, total };
  }

  private async empresaFinanciera(idSede: number, idUnidadCliente?: unknown) {
    const sede = await this.unidad.exigirSede(idSede, idUnidadCliente);
    this.unidad.exigirFinanzasDe(sede.opera_finanzas);
    return sede;
  }

  async createCotizacion(d: CotizacionDto, userId: number) {
    const sede = await this.empresaFinanciera(Number(d.id_sede), (d as any).id_unidad);
    if (d.id_consulta) {
      const [consulta] = await this.db.query(
        `SELECT id_unidad FROM cli_consulta WHERE id_consulta=? AND estado_registro='ACTIVO'`,
        [d.id_consulta],
      );
      if (!consulta || consulta.id_unidad == null) {
        throw new NotFoundException('Consulta no encontrada');
      }
      this.unidad.exigirCambio(consulta.id_unidad, sede.id_unidad);
    }
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const r = await qr.query(
        `INSERT INTO cli_cotizacion (id_paciente,id_sede,id_unidad,id_consulta,numero,fecha_cotizacion,vigencia_hasta,observaciones,id_usuario_crea) VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          d.id_paciente,
          d.id_sede,
          sede.id_unidad,
          d.id_consulta || null,
          d.numero || null,
          d.fecha_cotizacion,
          d.vigencia_hasta || null,
          d.observaciones || null,
          userId,
        ],
      );
      const id = Number(r.insertId);
      const totales = await this.detalles(qr, id, d, userId);
      await qr.commitTransaction();
      return { id, ...totales, message: 'Cotización creada' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async updateCotizacion(id: number, d: CotizacionDto, userId: number) {
    const old = await this.getCotizacion(id);
    const sede = await this.empresaFinanciera(Number(d.id_sede), (d as any).id_unidad);
    this.unidad.exigirCambio(old.id_unidad, sede.id_unidad);
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE cli_cotizacion SET id_paciente=?,id_sede=?,id_unidad=?,id_consulta=?,numero=?,fecha_cotizacion=?,vigencia_hasta=?,observaciones=?,id_usuario_mod=? WHERE id_cotizacion=?`,
        [
          d.id_paciente,
          d.id_sede,
          sede.id_unidad,
          d.id_consulta || null,
          d.numero || null,
          d.fecha_cotizacion,
          d.vigencia_hasta || null,
          d.observaciones || null,
          userId,
          id,
        ],
      );
      const totales = await this.detalles(qr, id, d, userId);
      await qr.commitTransaction();
      return { ...totales, message: 'Cotización actualizada' };
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async removeCotizacion(id: number, userId: number) {
    const old = await this.getCotizacion(id);
    const sede = await this.unidad.exigirSede(Number(old.id_sede));
    this.unidad.exigirFinanzasDe(sede.opera_finanzas);
    await this.db.query(
      `UPDATE cli_cotizacion SET estado='ANULADA',estado_registro='ELIMINADO',id_usuario_mod=? WHERE id_cotizacion=?`,
      [userId, id],
    );
    return { message: 'Cotización anulada' };
  }

  async createPago(d: PagoDto, userId: number) {
    const sede = await this.empresaFinanciera(Number(d.id_sede), (d as any).id_unidad);
    const r = await this.db.query(
      `INSERT INTO cli_pago (id_paciente,id_sede,id_unidad,id_cotizacion,id_cita,id_paciente_paquete,fecha_pago,monto,metodo_pago,referencia,concepto,id_usuario_crea) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        d.id_paciente,
        d.id_sede,
        sede.id_unidad,
        d.id_cotizacion || null,
        d.id_cita || null,
        d.id_paciente_paquete || null,
        d.fecha_pago,
        d.monto,
        d.metodo_pago || 'EFECTIVO',
        d.referencia || null,
        d.concepto || null,
        userId,
      ],
    );
    return { id: Number(r.insertId), message: 'Pago registrado' };
  }

  async anularPago(id: number, userId: number) {
    const [pago] = await this.db.query(
      `SELECT * FROM cli_pago WHERE id_pago=? AND estado='REGISTRADO' AND estado_registro='ACTIVO'`,
      [id],
    );
    if (!pago) throw new NotFoundException('Pago no encontrado');
    await this.unidad.exigirRegistro(pago.id_unidad, pago.id_sede);
    const sede = await this.unidad.exigirSede(Number(pago.id_sede));
    this.unidad.exigirFinanzasDe(sede.opera_finanzas);
    const r = await this.db.query(
      `UPDATE cli_pago SET estado='ANULADO',id_usuario_mod=? WHERE id_pago=? AND estado='REGISTRADO' AND estado_registro='ACTIVO'`,
      [userId, id],
    );
    if (!r.affectedRows) throw new NotFoundException('Pago no encontrado');
    await this.auditoria.registrar('cli_pago', id, 'ANULAR', userId, null, null);
    return { message: 'Pago anulado' };
  }
}
