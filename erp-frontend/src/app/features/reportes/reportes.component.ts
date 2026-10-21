import { Component, inject, OnInit, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { ReportesService } from './reportes.service';

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

  loading = signal(false);
  kpis = signal({ total: 0, masculinos: 0, femeninos: 0, nuevos_mes: 0 });
  pacientes = signal<any[]>([]);
  page = signal(1);
  limit = signal(10);
  total = signal(0);
  lastPage = signal(1);

  searchControl = new FormControl('');

  ngOnInit() {
    this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.page.set(1);
      this.cargar();
    });
    this.cargar();
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
}
