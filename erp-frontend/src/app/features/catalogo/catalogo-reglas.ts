export interface Vigencia {
  vigente_desde: string;
  vigente_hasta: string | null;
  monto: number;
  motivo: string;
}

export interface Componente {
  id_servicio: number;
  codigo: string;
  nombre: string;
  cantidad: number;
}

export interface ItemCatalogo {
  id_item: number;
  tipo: 'servicio' | 'paquete';
  codigo: string;
  categoria: string;
  nombre: string;
  sesiones: number | null;
  intervalo_dias_sugerido?: number | null;
  nota: string | null;
  sin_tarifa: boolean;
  descuento_pct?: number;
  promo_nombre?: string | null;
  promo_desde?: string | null;
  promo_hasta?: string | null;
  vigencias: Vigencia[];
  componentes: Componente[];
}

export function precioAl(item: ItemCatalogo, fecha: string): Vigencia | null {
  return item.vigencias.find((v) => v.vigente_desde <= fecha && (!v.vigente_hasta || v.vigente_hasta >= fecha)) || null;
}

export function sesionesDe(item: ItemCatalogo, todos: ItemCatalogo[]): number {
  if (item.sesiones) return item.sesiones;
  return (item.componentes || []).reduce((acc, c) => {
    const servicio = todos.find((i) => i.id_item === c.id_servicio);
    return acc + c.cantidad * (servicio?.sesiones || 1);
  }, 0);
}

export function sumaTarifas(item: ItemCatalogo, todos: ItemCatalogo[], fecha: string): { total: number; faltan: number } | null {
  if (!item.componentes?.length) return null;
  let total = 0;
  let faltan = 0;
  for (const c of item.componentes) {
    const servicio = todos.find((i) => i.id_item === c.id_servicio);
    const vigente = servicio ? precioAl(servicio, fecha) : null;
    if (!vigente) faltan += 1;
    else total += vigente.monto * c.cantidad;
  }
  return { total, faltan };
}

export interface Aviso {
  nivel: 'err' | 'warn' | 'ok';
  texto: string;
}

export function revisarCatalogo(items: ItemCatalogo[], fecha: string): Aviso[] {
  const avisos: Aviso[] = [];
  const nombres = new Set<string>();
  for (const item of items) {
    const clave = item.nombre.toLowerCase();
    if (nombres.has(clave)) avisos.push({ nivel: 'err', texto: `Nombre duplicado: ${item.nombre}` });
    nombres.add(clave);
    if (!item.vigencias.length && !item.sin_tarifa) {
      avisos.push({ nivel: 'err', texto: `${item.codigo} ${item.nombre}: sin tarifa registrada.` });
    } else if (item.vigencias.length && !precioAl(item, fecha)) {
      avisos.push({ nivel: 'err', texto: `${item.codigo} ${item.nombre}: sin precio vigente al ${fecha}.` });
    }
    const orden = [...item.vigencias].sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
    orden.forEach((v, i) => {
      if (v.vigente_hasta && v.vigente_hasta < v.vigente_desde) {
        avisos.push({ nivel: 'err', texto: `${item.codigo}: vigencia invertida.` });
      }
      if (!i) return;
      const anterior = orden[i - 1];
      if (anterior.vigente_hasta == null) avisos.push({ nivel: 'err', texto: `${item.codigo}: dos vigencias abiertas.` });
      else if (anterior.vigente_hasta >= v.vigente_desde) avisos.push({ nivel: 'err', texto: `${item.codigo}: vigencias superpuestas.` });
      else if (diaAnterior(v.vigente_desde) > anterior.vigente_hasta) {
        avisos.push({ nivel: 'warn', texto: `${item.codigo} ${item.nombre}: hueco sin precio entre ${anterior.vigente_hasta} y ${v.vigente_desde}.` });
      }
    });
    if (item.tipo === 'paquete') {
      if (!item.componentes?.length && !item.sesiones) {
        avisos.push({ nivel: 'err', texto: `${item.codigo}: paquete sin componentes ni sesiones.` });
      }
      const vigente = precioAl(item, fecha);
      const suma = sumaTarifas(item, items, fecha);
      if (vigente && suma && !suma.faltan && vigente.monto > suma.total) {
        avisos.push({ nivel: 'warn', texto: `${item.nombre}: el precio del paquete es mayor que la suma de sus tarifas.` });
      }
      const unico = item.componentes?.length === 1 ? item.componentes[0] : null;
      if (item.sesiones === 5 && unico?.cantidad === 5) {
        const servicio = items.find((i) => i.id_item === unico.id_servicio);
        const sesion = servicio ? precioAl(servicio, fecha) : null;
        if (vigente && sesion && vigente.monto !== sesion.monto * 5) {
          avisos.push({ nivel: 'warn', texto: `${item.nombre}: ya no equivale a 5 veces la sesión individual.` });
        }
      }
    }
  }
  avisos.push({ nivel: 'ok', texto: `${items.length} ítems revisados al ${fecha}.` });
  return avisos;
}

function diaAnterior(iso: string): string {
  const fecha = new Date(`${iso}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() - 1);
  return fecha.toISOString().slice(0, 10);
}

export function soles(valor: number | null | undefined): string {
  if (valor == null) return '—';
  return `S/ ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function estadoVigencia(v: Vigencia, fecha: string): 'Futuro' | 'Vigente' | 'Histórico' {
  if (v.vigente_desde > fecha) return 'Futuro';
  if (!v.vigente_hasta || v.vigente_hasta >= fecha) return 'Vigente';
  return 'Histórico';
}
