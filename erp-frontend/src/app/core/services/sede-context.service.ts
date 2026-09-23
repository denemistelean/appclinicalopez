import { Injectable, signal, computed } from '@angular/core';

const STORAGE_KEY = 'cli_sede_activa';

export type SedeSeleccion = number | 'TODAS' | null;

@Injectable({ providedIn: 'root' })
export class SedeContextService {
  private readonly sedeId = signal<SedeSeleccion>(this.readInitial());

  readonly idSedeActiva = this.sedeId.asReadonly();
  readonly esTodas = computed(() => this.sedeId() === 'TODAS');
  readonly idSedeFiltro = computed(() => {
    const v = this.sedeId();
    return typeof v === 'number' ? v : null;
  });

  setSede(id: SedeSeleccion) {
    this.sedeId.set(id);
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, String(id));
  }

  private readInitial(): SedeSeleccion {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 'TODAS';
    if (raw === 'TODAS') return 'TODAS';
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 'TODAS';
  }
}
