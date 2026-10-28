import { Injectable, inject } from '@angular/core';
import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, from, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PermissionsService } from './seguridad/permissions.service';
import { UnidadContextService } from './unidad-context.service';
import { AlertService } from './ui/alert.service';
import { extraerSesion, segundosHasta } from '../auth/sesion-token';

const AVISO_KEY = 'cli_aviso';
const CSRF_COOKIE = 'cli_csrf';
const MARGEN_SEGUNDOS = 60;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private raw = new HttpClient(inject(HttpBackend));
  private perms = inject(PermissionsService);
  private unidad = inject(UnidadContextService);
  private alert = inject(AlertService);
  private router = inject(Router);
  private apiUrl = environment.apiUrlGestion;
  private access: string | null = null;
  private csrf: string | null = null;
  private sessionExp: number | null = null;
  private generation = 0;
  private inflight: Promise<boolean> | null = null;
  private cerrando = false;
  private corte = false;

  constructor() {
    sessionStorage.removeItem('cli_refresh');
    sessionStorage.removeItem('cli_sid');
    localStorage.removeItem('cli_refresh');
    localStorage.removeItem('token');
  }

  login(credentials: { correo?: string; username?: string; password: string }): Observable<unknown> {
    return this.raw.post(`${this.apiUrl}/auth/login`, credentials, { withCredentials: true }).pipe(
      map((response) => {
        if (!this.aplicar(response, null)) {
          throw new Error('respuesta_incompleta');
        }
        return response;
      }),
    );
  }

  cambiarClave(clave_actual: string, clave_nueva: string): Observable<unknown> {
    return from(this.prepararAccess()).pipe(
      switchMap((token) => this.raw.post(`${this.apiUrl}/auth/cambiar-clave`, { clave_actual, clave_nueva }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })),
    );
  }

  getToken(): string | null {
    return this.access;
  }

  tieneAccess(): boolean {
    return !!this.access;
  }

  /** La última renovación no llegó al servicio. La sesión local sigue vigente. */
  enCorte(): boolean {
    return this.corte;
  }

  isLoggedIn(): boolean {
    return this.accessVigente() || this.hayCsrf();
  }

  convieneRenovar(): boolean {
    if (!this.hayCsrf()) return false;
    if (!this.access) return true;
    const queda = segundosHasta(this.access, 'exp');
    return queda == null || queda < MARGEN_SEGUNDOS;
  }

  async ensureSession(): Promise<boolean> {
    if (this.accessVigente()) return true;
    if (!this.hayCsrf()) {
      this.limpiar();
      return false;
    }
    return this.refreshCompartido();
  }

  refreshCompartido(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    const generation = this.generation;
    if (!this.hayCsrf()) return Promise.resolve(false);
    const sessionExp = this.sessionExp;
    const tarea = this.ejecutarRefresh(generation, sessionExp).finally(() => {
      if (this.inflight === tarea) this.inflight = null;
    });
    this.inflight = tarea;
    return tarea;
  }

  logout(): void {
    const access = this.iniciarCierre();
    if (!access) {
      this.irAlLogin();
      return;
    }
    this.raw.delete(`${this.apiUrl}/auth/logout`, {
      headers: { Authorization: `Bearer ${access}` },
      withCredentials: true,
    }).subscribe({
      next: () => this.irAlLogin(),
      error: (error: HttpErrorResponse) => {
        const status = error?.status ?? 0;
        if (status === 0 || status >= 500) sessionStorage.setItem(AVISO_KEY, 'sin_confirmar');
        this.irAlLogin();
      },
    });
  }

  /** Revoca la sesión recién creada cuando el ingreso no puede continuar, sin recargar el login. */
  revocarSinSalir(): void {
    const access = this.iniciarCierre();
    if (!access) return;
    this.raw.delete(`${this.apiUrl}/auth/logout`, {
      headers: { Authorization: `Bearer ${access}` },
      withCredentials: true,
    }).subscribe({ error: () => undefined });
  }

  abandonar(): void {
    if (this.cerrando) return;
    this.iniciarCierre();
    this.alert.warning('Tu sesión ya no es válida. Vuelve a ingresar.');
    this.irAlLogin();
  }

  private async prepararAccess(): Promise<string | null> {
    if (this.convieneRenovar()) {
      const ok = await this.refreshCompartido();
      if (!ok) return null;
    }
    return this.access;
  }

  private async ejecutarRefresh(generation: number, sessionExp: number | null): Promise<boolean> {
    const csrf = this.leerCsrf();
    if (!csrf) return false;
    try {
      const respuesta = await firstValueFrom(this.raw.post(`${this.apiUrl}/auth/refresh`, {}, {
        withCredentials: true,
        headers: { 'X-CSRF-Token': csrf },
      }));
      if (generation !== this.generation) return false;
      if (!this.aplicar(respuesta, sessionExp)) {
        this.corte = false;
        this.limpiar();
        return false;
      }
      this.corte = false;
      return true;
    } catch (error) {
      if (generation !== this.generation) return false;
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      if (status === 0 || status >= 500) {
        this.corte = true;
        this.alert.warning('No se pudo contactar con el servidor.');
        return false;
      }
      this.corte = false;
      this.limpiar();
      return false;
    }
  }

  private aplicar(respuesta: unknown, sessionExpAnterior: number | null): boolean {
    const sesion = extraerSesion(respuesta, sessionExpAnterior);
    if (!sesion) return false;
    this.access = sesion.access;
    this.csrf = sesion.csrf;
    this.sessionExp = sesion.sessionExp;
    this.cerrando = false;
    localStorage.removeItem('token');
    if (sesion.usuario) localStorage.setItem('usuario', JSON.stringify(sesion.usuario));
    return true;
  }

  private iniciarCierre(): string | null {
    this.cerrando = true;
    this.generation += 1;
    this.inflight = null;
    const access = this.access;
    this.limpiar();
    this.perms.clear();
    this.unidad.clear();
    return access;
  }

  private limpiar(): void {
    this.access = null;
    this.csrf = null;
    this.sessionExp = null;
    sessionStorage.removeItem('cli_refresh');
    sessionStorage.removeItem('cli_sid');
    localStorage.removeItem('cli_refresh');
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('cli_unidad_activa');
    document.cookie = `${CSRF_COOKIE}=; Path=/; Max-Age=0`;
  }

  private accessVigente(): boolean {
    if (!this.access) return false;
    const absoluto = segundosHasta(this.access, 'session_exp');
    const propio = segundosHasta(this.access, 'exp');
    return absoluto != null && absoluto > 0 && propio != null && propio >= MARGEN_SEGUNDOS;
  }

  private hayCsrf(): boolean {
    return !!this.leerCsrf();
  }

  private leerCsrf(): string | null {
    if (this.csrf) return this.csrf;
    const parte = document.cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${CSRF_COOKIE}=`));
    if (!parte) return null;
    try {
      const valor = decodeURIComponent(parte.slice(CSRF_COOKIE.length + 1));
      return valor || null;
    } catch {
      return null;
    }
  }

  private irAlLogin(): void {
    if (this.router.url.includes('/auth/login')) return;
    void this.router.navigateByUrl('/auth/login');
  }
}
