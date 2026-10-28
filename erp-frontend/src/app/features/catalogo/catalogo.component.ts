import { Component, OnInit, TemplateRef, computed, inject, signal } from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';
import { AlertService } from 'src/app/core/services/ui/alert.service';
import { PermissionsService } from 'src/app/core/services/seguridad/permissions.service';
import { CatalogoService } from './catalogo.service';
import {
  ItemCatalogo,
  estadoVigencia,
  precioAl,
  revisarCatalogo,
  sesionesDe,
  soles,
  sumaTarifas,
} from './catalogo-reglas';

type Pestana = 'servicio' | 'paquete' | 'tec' | 'val';
type Tecnologia = { id_tecnologia: number; codigo: string; nombre: string; serie: string; activo: boolean };

function fechaDeHoy(): string {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${hoy.getFullYear()}-${mes}-${dia}`;
}

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, NgbModalModule, NgSelectModule],
  templateUrl: './catalogo.component.html',
  styleUrl: './catalogo.component.scss',
})
export class CatalogoComponent implements OnInit {
  private api = inject(CatalogoService);
  private unidad = inject(UnidadContextService);
  private router = inject(Router);
  private alert = inject(AlertService);
  private modal = inject(NgbModal);
  private fb = inject(FormBuilder);
  perms = inject(PermissionsService);

  pestana = signal<Pestana>('servicio');
  fecha = signal(fechaDeHoy());
  busca = signal('');
  categoria = signal('');
  cargando = signal(true);
  abierto = signal<number | null>(null);
  items = signal<ItemCatalogo[]>([]);
  tecnologias = signal<Tecnologia[]>([]);
  componentesBorrador = signal<{ id_servicio: number | null; cantidad: number }[]>([]);
  editando = signal<ItemCatalogo | null>(null);
  tecEditando = signal<Tecnologia | null>(null);

  precioForm = this.fb.group({
    monto: [null as number | null, [Validators.required, Validators.min(0.01)]],
    vigente_desde: ['', Validators.required],
    vigente_hasta: [''],
    motivo: ['', Validators.required],
  });
  itemForm = this.fb.group({
    nombre: ['', Validators.required],
    categoria: ['', Validators.required],
    sesiones: [null as number | null],
    intervalo_dias_sugerido: [null as number | null],
    nota: [''],
    sin_tarifa: [false],
    monto: [null as number | null],
    vigente_desde: [''],
    motivo: ['Tarifa inicial'],
    descuento_pct: [0 as number],
    promo_nombre: [''],
    promo_desde: [''],
    promo_hasta: [''],
  });
  precioDe = signal<ItemCatalogo | null>(null);
  tecForm = this.fb.group({
    nombre: ['', Validators.required],
    serie: [''],
    activo: [true],
  });

  categorias = computed(() => {
    const tipo = this.pestana();
    if (tipo === 'tec' || tipo === 'val') return [];
    return [...new Set(this.items().filter((i) => i.tipo === tipo).map((i) => i.categoria))].sort();
  });

  visibles = computed(() => {
    const tipo = this.pestana();
    const q = this.busca().trim().toLowerCase();
    const cat = this.categoria();
    return this.items().filter((i) => {
      if (i.tipo !== tipo) return false;
      if (cat && i.categoria !== cat) return false;
      if (!q) return true;
      return `${i.nombre} ${i.codigo} ${i.categoria}`.toLowerCase().includes(q);
    });
  });

  tecnologiasVisibles = computed(() => {
    const q = this.busca().trim().toLowerCase();
    return this.tecnologias().filter((t) => !q || `${t.codigo} ${t.nombre} ${t.serie}`.toLowerCase().includes(q));
  });

  avisos = computed(() => revisarCatalogo(this.items(), this.fecha()));
  servicios = computed(() => this.items().filter((i) => i.tipo === 'servicio'));
  readonly porPagina = 8;
  pagina = signal(1);
  totalLista = computed(() => (
    this.pestana() === 'tec' ? this.tecnologiasVisibles().length : this.visibles().length
  ));
  totalPaginas = computed(() => Math.max(1, Math.ceil(this.totalLista() / this.porPagina)));
  paginaActual = computed(() => Math.min(this.pagina(), this.totalPaginas()));
  filas = computed(() => {
    const ini = (this.paginaActual() - 1) * this.porPagina;
    return this.visibles().slice(ini, ini + this.porPagina);
  });
  filasTec = computed(() => {
    const ini = (this.paginaActual() - 1) * this.porPagina;
    return this.tecnologiasVisibles().slice(ini, ini + this.porPagina);
  });
  numerosPagina = computed(() => {
    const total = this.totalPaginas();
    const actual = this.paginaActual();
    const fin = Math.min(total, Math.max(actual + 2, 5));
    const desde = Math.max(1, fin - 4);
    return Array.from({ length: Math.min(total, fin) - desde + 1 }, (_, i) => desde + i);
  });

  ngOnInit() {
    const codigo = this.unidad.membresias().find((m) => m.id_unidad === this.unidad.idUnidad())?.codigo;
    if (String(codigo || '').toUpperCase() !== 'SORELA') {
      this.router.navigateByUrl('/tratamientos');
      return;
    }
    this.cargar();
  }

  cargar() {
    this.cargando.set(true);
    this.api.listar().subscribe({
      next: (res: any) => {
        const cuerpo = res?.data?.registros ? res.data : (res?.data?.data || res?.data || res);
        this.items.set(cuerpo?.registros || cuerpo?.items || []);
        this.tecnologias.set(cuerpo?.tecnologias || []);
        this.cargando.set(false);
      },
      error: (e) => {
        this.cargando.set(false);
        this.alert.error(e?.error?.message || e?.error?.mensaje || 'No se pudo cargar el catálogo.');
      },
    });
  }

  elegir(p: Pestana) {
    this.pestana.set(p);
    this.categoria.set('');
    this.abierto.set(null);
    this.pagina.set(1);
  }

  cambiarFecha(valor: string) {
    if (valor) this.fecha.set(valor);
  }

  cambiarBusca(valor: string) {
    this.busca.set(valor);
    this.pagina.set(1);
  }

  cambiarCategoria(valor: string) {
    this.categoria.set(valor || '');
    this.pagina.set(1);
  }

  irPagina(n: number) {
    this.pagina.set(Math.min(this.totalPaginas(), Math.max(1, n)));
  }

  fechaTexto() {
    const [anio, mes, dia] = this.fecha().split('-');
    return dia && mes && anio ? `${dia}/${mes}/${anio}` : this.fecha();
  }

  nombreLista() {
    if (this.pestana() === 'tec') return 'tecnologías';
    return this.pestana() === 'paquete' ? 'paquetes' : 'servicios';
  }

  precio(item: ItemCatalogo) { return precioAl(item, this.fecha()); }
  sesiones(item: ItemCatalogo) { return sesionesDe(item, this.items()); }
  suma(item: ItemCatalogo) { return sumaTarifas(item, this.items(), this.fecha()); }
  soles = soles;
  estado = estadoVigencia;
  contenido(item: ItemCatalogo) {
    if (!item.componentes?.length) return 'Según evaluación';
    return item.componentes.map((c) => `${c.cantidad}× ${c.nombre.replace(/^Depilación láser — /, '')}`).join(' + ');
  }

  historico(item: ItemCatalogo) {
    this.abierto.update((id) => id === item.id_item ? null : item.id_item);
  }

  abrirPrecio(tpl: TemplateRef<unknown>, item: ItemCatalogo) {
    this.precioDe.set(item);
    this.precioForm.reset({ monto: null, vigente_desde: this.fecha(), vigente_hasta: '', motivo: '' });
    this.modal.open(tpl, { centered: true, backdrop: 'static' });
  }

  guardarPrecio(modal: { close: () => void }) {
    const item = this.precioDe();
    if (!item || this.precioForm.invalid) {
      this.precioForm.markAllAsTouched();
      return;
    }
    const raw = this.precioForm.getRawValue();
    this.api.nuevoPrecio(item.id_item, {
      monto: Number(raw.monto),
      vigente_desde: raw.vigente_desde,
      vigente_hasta: raw.vigente_hasta || null,
      motivo: raw.motivo,
    }).subscribe({
      next: () => { modal.close(); this.alert.success('Precio registrado.'); this.cargar(); },
      error: (e) => this.alert.error(e?.error?.message || e?.error?.mensaje || 'No se pudo guardar el precio.'),
    });
  }

  puedeEditar() {
    return this.perms.hasPermission('actualizar_tratamiento');
  }

  abrirItem(tpl: TemplateRef<unknown>) {
    this.editando.set(null);
    this.componentesBorrador.set(this.pestana() === 'paquete' ? [{ id_servicio: null, cantidad: 1 }] : []);
    this.itemForm.reset({
      nombre: '', categoria: '', sesiones: null, intervalo_dias_sugerido: null,
      nota: '', sin_tarifa: false,
      monto: null, vigente_desde: this.fecha(), motivo: 'Tarifa inicial',
      descuento_pct: 0, promo_nombre: '', promo_desde: '', promo_hasta: '',
    });
    this.modal.open(tpl, { centered: true, backdrop: 'static', size: 'lg' });
  }

  abrirEdicion(tpl: TemplateRef<unknown>, item: ItemCatalogo) {
    if (!this.puedeEditar()) return;
    this.editando.set(item);
    this.componentesBorrador.set(
      item.tipo === 'paquete'
        ? (item.componentes.length
          ? item.componentes.map((c) => ({ id_servicio: c.id_servicio, cantidad: c.cantidad }))
          : [{ id_servicio: null, cantidad: 1 }])
        : [],
    );
    this.itemForm.reset({
      nombre: item.nombre,
      categoria: item.categoria,
      sesiones: item.sesiones,
      intervalo_dias_sugerido: item.intervalo_dias_sugerido ?? null,
      nota: item.nota || '',
      sin_tarifa: item.sin_tarifa,
      monto: null,
      vigente_desde: this.fecha(),
      motivo: 'Tarifa inicial',
      descuento_pct: Number((item as any).descuento_pct || 0),
      promo_nombre: String((item as any).promo_nombre || ''),
      promo_desde: String((item as any).promo_desde || ''),
      promo_hasta: String((item as any).promo_hasta || ''),
    });
    this.modal.open(tpl, { centered: true, backdrop: 'static', size: 'lg' });
  }

  quitarComponente(indice: number) {
    this.componentesBorrador.update((lista) => lista.filter((_, i) => i !== indice));
  }

  guardarItem(modal: { close: () => void }) {
    if (this.itemForm.invalid) {
      this.itemForm.markAllAsTouched();
      return;
    }
    const raw = this.itemForm.getRawValue();
    const actual = this.editando();
    const tipo = actual?.tipo || (this.pestana() === 'paquete' ? 'paquete' : 'servicio');
    const cuerpo = {
      ...raw,
      tipo,
      sin_tarifa: tipo === 'servicio' && !!raw.sin_tarifa,
      componentes: tipo === 'paquete'
        ? this.componentesBorrador().filter((c) => c.id_servicio && c.cantidad > 0)
        : [],
    };
    const pedido = actual ? this.api.actualizar(actual.id_item, cuerpo) : this.api.crear(cuerpo);
    pedido.subscribe({
      next: () => {
        modal.close();
        this.alert.success(actual ? 'Registro actualizado.' : 'Registro creado.');
        this.cargar();
      },
      error: (e) => this.alert.error(e?.error?.message || e?.error?.mensaje || 'No se pudo guardar el registro.'),
    });
  }

  abrirTecnologia(tpl: TemplateRef<unknown>, tec?: Tecnologia) {
    if (tec && !this.puedeEditar()) return;
    this.tecEditando.set(tec || null);
    this.tecForm.reset({
      nombre: tec?.nombre || '',
      serie: tec?.serie || '',
      activo: tec ? tec.activo : true,
    });
    this.modal.open(tpl, { centered: true, backdrop: 'static' });
  }

  guardarTecnologia(modal: { close: () => void }) {
    if (this.tecForm.invalid) {
      this.tecForm.markAllAsTouched();
      return;
    }
    const raw = this.tecForm.getRawValue();
    const actual = this.tecEditando();
    const cuerpo = { nombre: raw.nombre, serie: raw.serie, activo: !!raw.activo };
    const pedido = actual ? this.api.tecnologia(actual.id_tecnologia, cuerpo) : this.api.crearTecnologia(cuerpo);
    pedido.subscribe({
      next: () => {
        modal.close();
        this.alert.success(actual ? 'Tecnología actualizada.' : 'Tecnología creada.');
        this.cargar();
      },
      error: (e) => this.alert.error(e?.error?.message || e?.error?.mensaje || 'No se pudo guardar la tecnología.'),
    });
  }
}
