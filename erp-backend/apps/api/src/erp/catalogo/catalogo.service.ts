import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UnidadScopeService } from '@app/auth';
import { prepararVigencia } from './catalogo-precio';
import { MOTIVO_INICIAL, SEMILLA_CATALOGO, SEMILLA_TECNOLOGIAS } from './catalogo-seed';

@Injectable()
export class CatalogoService {
  constructor(
    @InjectDataSource('APP_DB_CONN') private readonly db: DataSource,
    private readonly unidad: UnidadScopeService,
  ) {}

  async listar() {
    const idUnidad = await this.exigirSorela();
    await this.sembrar(idUnidad);
    const items = await this.db.query(
      `SELECT id_item, tipo, codigo, categoria, nombre, sesiones, intervalo_dias_sugerido, nota, sin_tarifa,
              COALESCE(descuento_pct, 0) AS descuento_pct, promo_nombre,
              DATE_FORMAT(promo_desde, '%Y-%m-%d') AS promo_desde,
              DATE_FORMAT(promo_hasta, '%Y-%m-%d') AS promo_hasta
       FROM cli_catalogo_item
       WHERE id_unidad = ? AND estado_registro = 'ACTIVO'
       ORDER BY tipo, categoria, nombre`,
      [idUnidad],
    );
    const ids = items.map((i: { id_item: number }) => i.id_item);
    const vigencias = ids.length
      ? await this.db.query(
        `SELECT id_vigencia, id_item, monto,
                DATE_FORMAT(vigente_desde, '%Y-%m-%d') AS vigente_desde,
                DATE_FORMAT(vigente_hasta, '%Y-%m-%d') AS vigente_hasta,
                motivo
         FROM cli_catalogo_vigencia
         WHERE id_item IN (${ids.map(() => '?').join(',')}) AND estado_registro = 'ACTIVO'
         ORDER BY vigente_desde`,
        ids,
      )
      : [];
    const componentes = ids.length
      ? await this.db.query(
        `SELECT c.id_paquete, c.id_servicio, c.cantidad, s.codigo, s.nombre
         FROM cli_catalogo_componente c
         JOIN cli_catalogo_item s ON s.id_item = c.id_servicio
         WHERE c.id_paquete IN (${ids.map(() => '?').join(',')})`,
        ids,
      )
      : [];
    const tecnologias = await this.db.query(
      `SELECT id_tecnologia, codigo, nombre, serie, activo
       FROM cli_catalogo_tecnologia
       WHERE id_unidad = ? AND estado_registro = 'ACTIVO'
       ORDER BY codigo`,
      [idUnidad],
    );
    const porItem = new Map<number, any[]>();
    for (const v of vigencias) {
      const lista = porItem.get(v.id_item) || [];
      lista.push({ ...v, monto: Number(v.monto), vigente_hasta: v.vigente_hasta || null });
      porItem.set(v.id_item, lista);
    }
    const porPaquete = new Map<number, any[]>();
    for (const c of componentes) {
      const lista = porPaquete.get(c.id_paquete) || [];
      lista.push({ id_servicio: c.id_servicio, codigo: c.codigo, nombre: c.nombre, cantidad: Number(c.cantidad) });
      porPaquete.set(c.id_paquete, lista);
    }
    return {
      registros: items.map((i: any) => ({
        ...i,
        sesiones: i.sesiones == null ? null : Number(i.sesiones),
        intervalo_dias_sugerido:
          i.intervalo_dias_sugerido == null ? null : Number(i.intervalo_dias_sugerido),
        sin_tarifa: !!Number(i.sin_tarifa),
        vigencias: porItem.get(i.id_item) || [],
        componentes: porPaquete.get(i.id_item) || [],
      })),
      tecnologias: tecnologias.map((t: any) => ({ ...t, activo: !!Number(t.activo), serie: t.serie || '' })),
    };
  }

  async crearItem(dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const tipo = dto?.tipo === 'paquete' ? 'paquete' : 'servicio';
    const nombre = String(dto?.nombre || '').trim();
    const categoria = String(dto?.categoria || '').trim();
    if (!nombre || !categoria) throw new BadRequestException('Indique nombre y categoría.');
    const codigo = await this.siguienteCodigo(idUnidad, tipo);
    const sinTarifa = tipo === 'servicio' && !!dto?.sin_tarifa;
    const monto = dto?.monto == null || dto.monto === '' ? null : Number(dto.monto);
    if (!sinTarifa && !(Number(monto) > 0)) throw new BadRequestException('Indique el precio inicial.');
    const desde = String(dto?.vigente_desde || fechaLocal());
    const motivo = String(dto?.motivo || MOTIVO_INICIAL).trim() || MOTIVO_INICIAL;
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const intervalo = intervaloSugerido(dto?.intervalo_dias_sugerido, dto?.sesiones);
      const res: any = await qr.query(
        `INSERT INTO cli_catalogo_item
          (id_unidad, tipo, codigo, categoria, nombre, sesiones, intervalo_dias_sugerido, nota, sin_tarifa, id_usuario_crea)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          idUnidad,
          tipo,
          codigo,
          categoria,
          nombre,
          dto?.sesiones || null,
          intervalo,
          dto?.nota || null,
          sinTarifa ? 1 : 0,
          userId,
        ],
      );
      const id = Number(res.insertId);
      if (!sinTarifa) {
        await qr.query(
          `INSERT INTO cli_catalogo_vigencia (id_item, monto, vigente_desde, vigente_hasta, motivo, id_usuario_crea)
           VALUES (?,?,?,?,?,?)`,
          [id, monto, desde, dto?.vigente_hasta || null, motivo, userId],
        );
      }
      await this.insertarComponentes(qr, idUnidad, id, dto?.componentes || []);
      await qr.commitTransaction();
      return { id_item: id, codigo };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async nuevoPrecio(idItem: number, dto: any, userId: number) {
    const idUnidad = await this.exigirSorela();
    const [item] = await this.db.query(
      `SELECT id_item, sin_tarifa FROM cli_catalogo_item
       WHERE id_item = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [idItem, idUnidad],
    );
    if (!item) throw new NotFoundException('El ítem no existe en este catálogo.');
    if (Number(item.sin_tarifa)) throw new BadRequestException('Este ítem no lleva tarifa propia.');
    const actuales = await this.db.query(
      `SELECT monto, DATE_FORMAT(vigente_desde, '%Y-%m-%d') AS vigente_desde,
              DATE_FORMAT(vigente_hasta, '%Y-%m-%d') AS vigente_hasta, motivo
       FROM cli_catalogo_vigencia
       WHERE id_item = ? AND estado_registro = 'ACTIVO'`,
      [idItem],
    );
    const preparadas = actuales.map((v: any) => ({
      monto: Number(v.monto),
      vigente_desde: v.vigente_desde,
      vigente_hasta: v.vigente_hasta || null,
      motivo: v.motivo,
    }));
    const resultado = prepararVigencia(preparadas, {
      monto: Number(dto?.monto),
      vigente_desde: String(dto?.vigente_desde || ''),
      vigente_hasta: dto?.vigente_hasta || null,
      motivo: String(dto?.motivo || ''),
    });
    if ('error' in resultado) throw new BadRequestException(resultado.error);
    const nueva = resultado.vigencias[resultado.vigencias.length - 1];
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const abierta = preparadas.find((v) => v.vigente_hasta == null);
      if (abierta && resultado.vigencias.some((v) => v.vigente_desde === abierta.vigente_desde && v.vigente_hasta)) {
        const cerrada = resultado.vigencias.find((v) => v.vigente_desde === abierta.vigente_desde);
        await qr.query(
          `UPDATE cli_catalogo_vigencia SET vigente_hasta = ?
           WHERE id_item = ? AND vigente_desde = ? AND vigente_hasta IS NULL AND estado_registro = 'ACTIVO'`,
          [cerrada?.vigente_hasta, idItem, abierta.vigente_desde],
        );
      }
      await qr.query(
        `INSERT INTO cli_catalogo_vigencia (id_item, monto, vigente_desde, vigente_hasta, motivo, id_usuario_crea)
         VALUES (?,?,?,?,?,?)`,
        [idItem, nueva.monto, nueva.vigente_desde, nueva.vigente_hasta, nueva.motivo, userId],
      );
      await qr.commitTransaction();
      return { ok: true };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async actualizarItem(id: number, dto: any) {
    const idUnidad = await this.exigirSorela();
    const [item] = await this.db.query(
      `SELECT id_item, tipo FROM cli_catalogo_item
       WHERE id_item = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id, idUnidad],
    );
    if (!item) throw new NotFoundException('El ítem no existe en este catálogo.');
    const nombre = String(dto?.nombre || '').trim();
    const categoria = String(dto?.categoria || '').trim();
    if (!nombre || !categoria) throw new BadRequestException('Indique nombre y categoría.');
    const sesiones = dto?.sesiones == null || dto?.sesiones === '' ? null : Number(dto.sesiones);
    if (sesiones != null && !(sesiones > 0)) throw new BadRequestException('Las sesiones deben ser mayores que 0.');
    const nota = String(dto?.nota || '').trim() || null;
    const sinTarifa = item.tipo === 'servicio' && !!dto?.sin_tarifa;
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const intervalo =
        dto?.intervalo_dias_sugerido === undefined
          ? undefined
          : intervaloSugerido(dto?.intervalo_dias_sugerido, sesiones);
      const descuentoPct = Math.max(0, Math.min(100, Number(dto?.descuento_pct ?? 0) || 0));
      const promoNombre = String(dto?.promo_nombre || '').trim() || null;
      const promoDesde = dto?.promo_desde ? String(dto.promo_desde).slice(0, 10) : null;
      const promoHasta = dto?.promo_hasta ? String(dto.promo_hasta).slice(0, 10) : null;
      if (intervalo === undefined) {
        await qr.query(
          `UPDATE cli_catalogo_item
           SET nombre = ?, categoria = ?, sesiones = ?, nota = ?, sin_tarifa = ?,
               descuento_pct = ?, promo_nombre = ?, promo_desde = ?, promo_hasta = ?
           WHERE id_item = ?`,
          [nombre, categoria, sesiones, nota, sinTarifa ? 1 : 0, descuentoPct, promoNombre, promoDesde, promoHasta, id],
        );
      } else {
        await qr.query(
          `UPDATE cli_catalogo_item
           SET nombre = ?, categoria = ?, sesiones = ?, intervalo_dias_sugerido = ?, nota = ?, sin_tarifa = ?,
               descuento_pct = ?, promo_nombre = ?, promo_desde = ?, promo_hasta = ?
           WHERE id_item = ?`,
          [
            nombre,
            categoria,
            sesiones,
            intervalo,
            nota,
            sinTarifa ? 1 : 0,
            descuentoPct,
            promoNombre,
            promoDesde,
            promoHasta,
            id,
          ],
        );
      }
      if (item.tipo === 'paquete') {
        await qr.query(`DELETE FROM cli_catalogo_componente WHERE id_paquete = ?`, [id]);
        await this.insertarComponentes(qr, idUnidad, id, dto?.componentes || []);
      }
      if (item.tipo === 'servicio' && !sinTarifa) {
        const [vig] = await qr.query(
          `SELECT COUNT(*) AS n FROM cli_catalogo_vigencia WHERE id_item = ? AND estado_registro = 'ACTIVO'`,
          [id],
        );
        if (!Number(vig?.n)) {
          const monto = Number(dto?.monto);
          if (!(monto > 0)) throw new BadRequestException('Indique el precio inicial.');
          const desde = String(dto?.vigente_desde || fechaLocal());
          const motivo = String(dto?.motivo || MOTIVO_INICIAL).trim() || MOTIVO_INICIAL;
          await qr.query(
            `INSERT INTO cli_catalogo_vigencia (id_item, monto, vigente_desde, motivo, id_usuario_crea) VALUES (?,?,?,?,?)`,
            [id, monto, desde, motivo, null],
          );
        }
      }
      await qr.commitTransaction();
      return { ok: true };
    } catch (error) {
      await qr.rollbackTransaction();
      throw error;
    } finally {
      await qr.release();
    }
  }

  async crearTecnologia(dto: any) {
    const idUnidad = await this.exigirSorela();
    const nombre = String(dto?.nombre || '').trim();
    if (!nombre) throw new BadRequestException('Indique el nombre de la tecnología.');
    const codigo = await this.siguienteCodigoTecnologia(idUnidad);
    const serie = String(dto?.serie || '').trim() || null;
    await this.db.query(
      `INSERT INTO cli_catalogo_tecnologia (id_unidad, codigo, nombre, serie, activo) VALUES (?,?,?,?,?)`,
      [idUnidad, codigo, nombre, serie, dto?.activo === false ? 0 : 1],
    );
    return { codigo };
  }

  async actualizarTecnologia(id: number, dto: any) {
    const idUnidad = await this.exigirSorela();
    const nombre = String(dto?.nombre || '').trim();
    if (!nombre) throw new BadRequestException('Indique el nombre de la tecnología.');
    const [row] = await this.db.query(
      `SELECT id_tecnologia FROM cli_catalogo_tecnologia
       WHERE id_tecnologia = ? AND id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id, idUnidad],
    );
    if (!row) throw new NotFoundException('La tecnología no existe.');
    await this.db.query(
      `UPDATE cli_catalogo_tecnologia SET nombre = ?, serie = ?, activo = ? WHERE id_tecnologia = ?`,
      [nombre, String(dto?.serie || '').trim() || null, dto?.activo === false ? 0 : 1, id],
    );
    return { ok: true };
  }

  private async exigirSorela(): Promise<number> {
    const id = this.unidad.exigirEmpresa();
    const [row] = await this.db.query(
      `SELECT codigo FROM cli_unidad WHERE id_unidad = ? AND estado_registro = 'ACTIVO'`,
      [id],
    );
    if (String(row?.codigo || '').toUpperCase() !== 'SORELA') {
      throw new ForbiddenException('Este catálogo corresponde a Sorela Medic.');
    }
    return id;
  }

  private async insertarComponentes(qr: { query: (sql: string, params?: unknown[]) => Promise<any> }, idUnidad: number, idPaquete: number, componentes: any[]) {
    const vistos = new Set<number>();
    for (const c of componentes) {
      const cantidad = Number(c?.cantidad);
      const idServicio = Number(c?.id_servicio);
      if (!(cantidad > 0) || !idServicio) throw new BadRequestException('Cada componente necesita servicio y cantidad.');
      if (vistos.has(idServicio)) throw new BadRequestException('El servicio está repetido en el contenido.');
      vistos.add(idServicio);
      const [srv] = await qr.query(
        `SELECT id_item FROM cli_catalogo_item
         WHERE id_item = ? AND id_unidad = ? AND tipo = 'servicio' AND estado_registro = 'ACTIVO'`,
        [idServicio, idUnidad],
      );
      if (!srv) throw new BadRequestException('El componente no es un servicio de este catálogo.');
      await qr.query(
        `INSERT INTO cli_catalogo_componente (id_paquete, id_servicio, cantidad) VALUES (?,?,?)`,
        [idPaquete, idServicio, cantidad],
      );
    }
  }

  private async siguienteCodigoTecnologia(idUnidad: number): Promise<string> {
    const [row] = await this.db.query(
      `SELECT codigo FROM cli_catalogo_tecnologia WHERE id_unidad = ? AND codigo LIKE 'TEC-%' ORDER BY codigo DESC LIMIT 1`,
      [idUnidad],
    );
    const n = row ? Number(String(row.codigo).slice(4)) + 1 : 1;
    return `TEC-${String(n).padStart(3, '0')}`;
  }

  private async siguienteCodigo(idUnidad: number, tipo: 'servicio' | 'paquete'): Promise<string> {
    const prefijo = tipo === 'servicio' ? 'SRV-' : 'PAQ-';
    const [row] = await this.db.query(
      `SELECT codigo FROM cli_catalogo_item WHERE id_unidad = ? AND codigo LIKE ? ORDER BY codigo DESC LIMIT 1`,
      [idUnidad, `${prefijo}%`],
    );
    const n = row ? Number(String(row.codigo).slice(prefijo.length)) + 1 : 1;
    return `${prefijo}${String(n).padStart(3, '0')}`;
  }

  private async sembrar(idUnidad: number) {
    const [cuenta] = await this.db.query(
      `SELECT COUNT(*) AS n FROM cli_catalogo_item WHERE id_unidad = ?`,
      [idUnidad],
    );
    if (Number(cuenta?.n) > 0) return;
    const hoy = fechaLocal();
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const ids = new Map<string, number>();
      for (const item of SEMILLA_CATALOGO) {
        const res: any = await qr.query(
          `INSERT INTO cli_catalogo_item
            (id_unidad, tipo, codigo, categoria, nombre, sesiones, nota, sin_tarifa)
           VALUES (?,?,?,?,?,?,?,?)`,
          [idUnidad, item.tipo, item.codigo, item.categoria, item.nombre, item.sesiones ?? null, item.nota ?? null, item.sinTarifa ? 1 : 0],
        );
        const id = Number(res.insertId);
        ids.set(item.codigo, id);
        if (item.monto != null) {
          await qr.query(
            `INSERT INTO cli_catalogo_vigencia (id_item, monto, vigente_desde, motivo) VALUES (?,?,?,?)`,
            [id, item.monto, hoy, MOTIVO_INICIAL],
          );
        }
      }
      for (const item of SEMILLA_CATALOGO) {
        const idPaquete = ids.get(item.codigo);
        for (const c of item.componentes || []) {
          await qr.query(
            `INSERT INTO cli_catalogo_componente (id_paquete, id_servicio, cantidad) VALUES (?,?,?)`,
            [idPaquete, ids.get(c.codigo), c.cantidad],
          );
        }
      }
      for (let i = 0; i < SEMILLA_TECNOLOGIAS.length; i++) {
        await qr.query(
          `INSERT INTO cli_catalogo_tecnologia (id_unidad, codigo, nombre) VALUES (?,?,?)`,
          [idUnidad, `TEC-${String(i + 1).padStart(3, '0')}`, SEMILLA_TECNOLOGIAS[i]],
        );
      }
      await qr.commitTransaction();
    } catch (error) {
      await qr.rollbackTransaction();
      const repetido = (error as { code?: string })?.code === 'ER_DUP_ENTRY';
      if (!repetido) throw error;
    } finally {
      await qr.release();
    }
  }
}

export function fechaLocal(fecha = new Date()): string {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

/** Intervalo sugerido entre sesiones (informativo). null = sin sugerencia. */
export function intervaloSugerido(raw: unknown, sesiones: unknown): number | null {
  if (raw === null || raw === '') return null;
  if (raw === undefined) {
    const n = Number(sesiones);
    return Number.isFinite(n) && n > 1 ? 15 : null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}
