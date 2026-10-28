import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ReportesService } from './reportes.service';
import { UnidadContextService } from 'src/app/core/services/unidad-context.service';

const SORELA_TIPOS = [
  { id: 'resumen', label: '7.1 Resumen' },
  { id: 'cosmiatra', label: '7.2 Por cosmiatra' },
  { id: 'canales', label: '7.3 Canales' },
  { id: 'nuevos-recurrentes', label: '7.4 Nuevos / recurrentes' },
  { id: 'servicios', label: '7.5 Servicios y paquetes' },
  { id: 'sesiones-pendientes', label: '7.6 Sesiones pendientes' },
  { id: 'seguimiento', label: '7.7 Seguimiento' },
  { id: 'saldos', label: '7.8 Saldos' },
  { id: 'historico', label: '7.9 Histórico' },
  { id: 'comision-externa', label: '7.10 Comisión externa' },
] as const;

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportesComponent implements OnInit {
  private service = inject(ReportesService);
  private router = inject(Router);
  private unidad = inject(UnidadContextService);

  loading = signal(false);
  kpis = signal({ total: 0, masculinos: 0, femeninos: 0, nuevos_mes: 0 });
  pacientes = signal<any[]>([]);
  page = signal(1);
  limit = signal(10);
  total = signal(0);
  lastPage = signal(1);

  vista = signal<'pacientes' | 'sorela'>('pacientes');
  sorelaTipos = SORELA_TIPOS;
  sorelaTipo = signal<string>('resumen');
  sorelaDesde = signal(this.mesInicio());
  sorelaHasta = signal(this.hoy());
  sorelaData = signal<any>(null);
  sorelaLoading = signal(false);

  searchControl = new FormControl('');

  ngOnInit() {
    this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.page.set(1);
      this.cargar();
    });
    this.cargar();
    if (this.esSorela()) {
      this.vista.set('sorela');
      this.cargarSorela();
    }
  }

  cargar() {
    this.loading.set(true);
    this.service.getPacientes(this.page(), this.limit(), this.searchControl.value || '').subscribe({
      next: (res: any) => {
        const body = res?.data || res || {};
        const k = body.kpis || {};
        this.kpis.set({
          total: Number(k.total || 0),
          masculinos: Number(k.masculinos || 0),
          femeninos: Number(k.femeninos || 0),
          nuevos_mes: Number(k.nuevos_mes || 0),
        });
        const list = body.data || [];
        this.pacientes.set(Array.isArray(list) ? list : []);
        const meta = body.meta || {};
        this.total.set(Number(meta.total || 0));
        this.lastPage.set(Number(meta.lastPage || 1));
        this.loading.set(false);
      },
      error: () => {
        this.pacientes.set([]);
        this.loading.set(false);
      },
    });
  }

  cargarSorela() {
    this.sorelaLoading.set(true);
    this.service
      .getSorela(this.sorelaTipo(), {
        desde: this.sorelaDesde(),
        hasta: this.sorelaHasta(),
      })
      .subscribe({
        next: (res: any) => {
          this.sorelaData.set(res?.data || res || null);
          this.sorelaLoading.set(false);
        },
        error: () => {
          this.sorelaData.set(null);
          this.sorelaLoading.set(false);
        },
      });
  }

  setVista(v: 'pacientes' | 'sorela') {
    this.vista.set(v);
    if (v === 'sorela') this.cargarSorela();
  }

  setSorelaTipo(id: string) {
    this.sorelaTipo.set(id);
    this.cargarSorela();
  }

  onDesde(v: string) {
    this.sorelaDesde.set(v);
  }

  onHasta(v: string) {
    this.sorelaHasta.set(v);
  }

  irPagina(p: number) {
    const next = Math.min(this.lastPage(), Math.max(1, p));
    if (next === this.page()) return;
    this.page.set(next);
    this.cargar();
  }

  cambiarLimite(n: number) {
    this.limit.set(Number(n) || 10);
    this.page.set(1);
    this.cargar();
  }

  rangoLabel(): string {
    const t = this.total();
    if (!t) return 'Mostrando 0 de 0 resultados';
    const desde = (this.page() - 1) * this.limit() + 1;
    const hasta = Math.min(t, this.page() * this.limit());
    return `Mostrando ${desde}–${hasta} de ${t} resultados`;
  }

  esSorela(): boolean {
    const codigo = this.unidad.membresias().find((m) => m.id_unidad === this.unidad.idUnidad())?.codigo;
    return String(codigo || '').toUpperCase() === 'SORELA';
  }

  abrirHistoria(id: number) {
    if (this.esSorela() || !id) return;
    this.router.navigate(['/atencion-paciente'], {
      queryParams: { id_paciente: id, tab: 'resumen' },
    });
  }

  iniciales(p: any): string {
    const a = String(p?.apellidos || '').trim();
    const n = String(p?.nombres || '').trim();
    const ia = a.charAt(0);
    const ino = n.charAt(0);
    return (ia + ino).toUpperCase() || '—';
  }

  genero(sexo: string): string {
    const map: Record<string, string> = {
      M: 'Masculino',
      F: 'Femenino',
      X: 'X',
      NO_ESPECIFICADO: 'No especificado',
    };
    return map[String(sexo || '').toUpperCase()] || '—';
  }

  telefono(p: any): string {
    return p?.telefono || p?.telefono_alterno || '—';
  }

  fechaCorta(v: any): string {
    if (!v) return '—';
    const raw = String(v).slice(0, 10);
    const d = new Date(raw + 'T12:00:00');
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  edadLabel(p: any): string {
    if (p?.edad == null || p?.edad === '' || !p?.fecha_nacimiento) return '—';
    const n = Number(p.edad);
    if (!Number.isFinite(n) || n < 0) return '—';
    return `${n} ${n === 1 ? 'año' : 'años'}`;
  }

  dinero(v: any): string {
    const n = Number(v || 0);
    return n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  keysOf(obj: any): string[] {
    if (!obj || typeof obj !== 'object') return [];
    return Object.keys(obj).filter((k) => !Array.isArray(obj[k]));
  }

  filasTabla(): any[] {
    const d = this.sorelaData();
    if (!d) return [];
    if (Array.isArray(d.filas)) return d.filas;
    if (Array.isArray(d.sin_proxima_cita)) return [];
    return [];
  }

  columnasFilas(): string[] {
    const f = this.filasTabla()[0];
    return f ? Object.keys(f) : [];
  }

  private hoy(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private mesInicio(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  }
}
