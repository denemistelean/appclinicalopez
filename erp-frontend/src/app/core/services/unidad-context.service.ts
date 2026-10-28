import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

const STORAGE_KEY = 'cli_unidad_activa';

export interface MembresiaUnidad {
  id_unidad: number;
  id_rol: number;
  opera_finanzas: number;
  requiere_comprobante?: number;
  codigo: string;
  nombre: string;
  omni?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UnidadContextService {
  private http = inject(HttpClient);
  readonly membresias = signal<MembresiaUnidad[]>([]);
  readonly idUnidad = signal<number | null>(this.readInitial());

  cargar() {
    return this.http.get<any>(`${environment.apiUrlGestion}/unidades/mias`).pipe(
      tap((res) => {
        const rows = this.unwrap(res);
        this.membresias.set(rows);
        const saved = this.idUnidad();
        const valid = rows.find((r) => r.id_unidad === saved);
        const chosen = valid || rows[0] || null;
        if (chosen) this.setUnidad(chosen.id_unidad);
        else this.clear();
      }),
    );
  }

  setUnidad(id: number) {
    this.idUnidad.set(id);
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  clear() {
    this.idUnidad.set(null);
    this.membresias.set([]);
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Quita la empresa rechazada y conserva el resto de membresías ya cargadas. */
  soltarSeleccion() {
    const actual = this.idUnidad();
    const restantes = this.membresias().filter((fila) => fila.id_unidad !== actual);
    this.membresias.set(restantes);
    if (restantes.length === 1) {
      this.setUnidad(restantes[0].id_unidad);
      return;
    }
    this.idUnidad.set(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  private readInitial(): number | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private unwrap(res: any): MembresiaUnidad[] {
    const data = res?.data?.data || res?.data || res;
    return Array.isArray(data) ? data : [];
  }
}
