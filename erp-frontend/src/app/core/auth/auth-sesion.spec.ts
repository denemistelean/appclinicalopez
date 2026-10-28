import { Component } from '@angular/core';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../interceptors/auth/auth-interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { AuthService } from '../services/auth.service';
import { UnidadContextService } from '../services/unidad-context.service';
import { AlertService } from '../services/ui/alert.service';
import { environment } from '../../../environments/environment';

@Component({ standalone: true, template: '' })
class PaginaVacia {}

function jwt(payload: Record<string, unknown>): string {
  const parte = (valor: unknown) => btoa(JSON.stringify(valor)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return `${parte({ alg: 'none', typ: 'JWT' })}.${parte(payload)}.firma`;
}

function drenar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0));
}

function emitir(sessionExp: number, accessExp: number, jti = 'jti-1') {
  const sid = '11111111-1111-4111-8111-111111111111';
  const access = jwt({ sub: 1, token_use: 'access', sid, session_exp: sessionExp, exp: accessExp });
  const refresh = jwt({ sub: 1, token_use: 'refresh', sid, session_exp: sessionExp, exp: sessionExp, jti });
  return {
    sid,
    access,
    refresh,
    body: {
      success: true,
      data: {
        access_token: access,
        csrf_token: 'csrf-sintetico',
        sessionId: sid,
        usuario: { id_usuario: 1, correo: 'ana@test' },
      },
    },
  };
}

describe('Fase 2E-9 — sesión del frontend', () => {
  const ahora = Math.floor(Date.now() / 1000);
  const sessionExp = ahora + 7 * 24 * 3600;
  const accessExp = ahora + 600;
  const api = environment.apiUrlGestion;
  const alerta = { toast: vi.fn(), error: vi.fn(), warning: vi.fn() };

  let auth: AuthService;
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let unidad: UnidadContextService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    alerta.toast.mockClear();
    alerta.error.mockClear();
    alerta.warning.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/login', component: PaginaVacia },
          { path: 'agenda', component: PaginaVacia },
        ]),
        provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AlertService, useValue: alerta },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    unidad = TestBed.inject(UnidadContextService);
  });

  function usarServicio(): AuthService {
    auth = TestBed.inject(AuthService);
    return auth;
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
    document.cookie = 'cli_csrf=; Path=/; Max-Age=0';
  });

  function entrar() {
    usarServicio();
    const sesion = emitir(sessionExp, accessExp);
    let listo = false;
    auth.login({ correo: 'ana@test', password: 'secreta' }).subscribe(() => { listo = true; });
    const req = httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/login'));
    expect(req.request.withCredentials).toBe(true);
    req.flush(sesion.body);
    expect(listo).toBe(true);
    return sesion;
  }

  it('1. guarda el login sin persistir el access y sin dejar el refresh en localStorage', () => {
    localStorage.setItem('token', 'access-viejo');
    usarServicio();
    expect(localStorage.getItem('token')).toBeNull();
    const sesion = entrar();
    expect(auth.getToken()).toBe(sesion.access);
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(sessionStorage.getItem('cli_sid')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('usuario')).not.toContain(sesion.access);
    expect(localStorage.getItem('usuario')).not.toContain(sesion.refresh);
  });

  it('2. un login fallido no deja sesión local', () => {
    usarServicio();
    let estado = 0;
    auth.login({ correo: 'ana@test', password: 'mala' }).subscribe({ error: (error) => { estado = error.status; } });
    httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/login')).flush(
      { mensaje: 'Credenciales incorrectas' },
      { status: 401, statusText: 'Unauthorized' },
    );
    expect(estado).toBe(401);
    expect(auth.getToken()).toBeNull();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
  });

  it('3. un access vigente no dispara renovación', async () => {
    entrar();
    let ok = false;
    auth.ensureSession().then((valor) => { ok = valor; });
    await drenar();
    expect(ok).toBe(true);
    httpMock.expectNone((llamada) => llamada.url.includes('/auth/refresh'));
  });

  it('4. renueva una sola vez ante un access expirado y reintenta la petición', async () => {
    const inicial = entrar();
    const renovada = emitir(sessionExp, ahora + 900, 'jti-2');
    let codigo = 0;
    http.get(`${api}/pacientes`).subscribe({ next: () => { codigo = 200; }, error: () => { codigo = 401; } });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).flush(
      { mensaje: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const refresh = httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/refresh'));
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.body).toEqual({});
    expect(refresh.request.headers.get('X-CSRF-Token')).toBe('csrf-sintetico');
    expect(JSON.stringify(refresh.request.body)).not.toContain(inicial.refresh);
    refresh.flush(renovada.body);
    await drenar();
    const reintento = httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes'));
    expect(reintento.request.headers.get('Authorization')).toBe(`Bearer ${renovada.access}`);
    reintento.flush({ ok: true });
    await drenar();
    expect(codigo).toBe(200);
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
    expect(auth.getToken()).toBe(renovada.access);
  });

  it('5 y 6. varias peticiones comparten una renovación y cada una se reintenta una vez', async () => {
    entrar();
    const renovada = emitir(sessionExp, ahora + 900, 'jti-3');
    let una = 0;
    let otra = 0;
    http.get(`${api}/pacientes`).subscribe({ next: () => { una = 1; }, error: () => { una = 0; } });
    http.get(`${api}/agenda`).subscribe({ next: () => { otra = 1; }, error: () => { otra = 0; } });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).flush(
      { mensaje: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );
    httpMock.expectOne((llamada) => llamada.url.endsWith('/agenda')).flush(
      { mensaje: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const refreshes = httpMock.match((llamada) => llamada.url.endsWith('/auth/refresh'));
    expect(refreshes).toHaveLength(1);
    refreshes[0].flush(renovada.body);
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).flush({ ok: true });
    httpMock.expectOne((llamada) => llamada.url.endsWith('/agenda')).flush(
      { mensaje: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await drenar();
    expect(httpMock.match((llamada) => llamada.url.endsWith('/auth/refresh'))).toHaveLength(0);
    expect(una).toBe(1);
    expect(otra).toBe(0);
    expect(auth.getToken()).toBeNull();
  });

  it('7. descarta el refresh legado y no llama al backend si no hay cookie csrf', async () => {
    const sid = '22222222-2222-4222-8222-222222222222';
    sessionStorage.setItem('cli_refresh', jwt({
      token_use: 'refresh', sid, session_exp: ahora - 5, exp: ahora - 5, jti: 'viejo',
    }));
    sessionStorage.setItem('cli_sid', sid);
    localStorage.setItem('cli_refresh', jwt({ token_use: 'refresh', sid }));
    usarServicio();
    let ok = true;
    auth.ensureSession().then((valor) => { ok = valor; });
    await drenar();
    expect(ok).toBe(false);
    httpMock.expectNone((llamada) => llamada.url.includes('/auth/refresh'));
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(sessionStorage.getItem('cli_sid')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
  });

  it('8. el logout confirmado limpia la sesión local', async () => {
    entrar();
    auth.logout();
    const baja = httpMock.expectOne((llamada) => llamada.method === 'DELETE' && llamada.url.endsWith('/auth/logout'));
    expect(baja.request.withCredentials).toBe(true);
    baja.flush({ success: true });
    await drenar();
    expect(auth.getToken()).toBeNull();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(sessionStorage.getItem('cli_aviso')).toBeNull();
    expect(localStorage.getItem('usuario')).toBeNull();
  });

  it('9. si el logout no llega al servidor, limpia igual y no afirma la revocación', async () => {
    entrar();
    auth.logout();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/logout')).error(new ProgressEvent('error'));
    await drenar();
    expect(auth.getToken()).toBeNull();
    expect(sessionStorage.getItem('cli_aviso')).toBe('sin_confirmar');
  });

  it('10. un 401 de sesión inválida no renueva y cierra la sesión', async () => {
    entrar();
    http.get(`${api}/pacientes`).subscribe({ error: () => undefined });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).flush(
      { mensaje: 'Token inválido' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await drenar();
    httpMock.expectNone((llamada) => llamada.url.includes('/auth/refresh'));
    expect(auth.getToken()).toBeNull();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(alerta.warning).toHaveBeenCalled();
  });

  it('11. un 403 de membresía no cierra la sesión ni la otra empresa', async () => {
    entrar();
    unidad.membresias.set([
      { id_unidad: 1, id_rol: 2, opera_finanzas: 0, codigo: 'A', nombre: 'López' },
      { id_unidad: 2, id_rol: 3, opera_finanzas: 1, codigo: 'B', nombre: 'Sorela' },
    ]);
    unidad.setUnidad(2);
    http.get(`${api}/pacientes`).subscribe({ error: () => undefined });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).flush(
      { mensaje: 'No tiene acceso a esta empresa' },
      { status: 403, statusText: 'Forbidden' },
    );
    await drenar();
    expect(auth.getToken()).toBeTruthy();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
    expect(unidad.idUnidad()).toBe(1);
    expect(alerta.warning).toHaveBeenCalledWith(expect.stringContaining('empresa seleccionada'));
  });

  it('12. un 503 no trata al usuario como no autenticado', async () => {
    entrar();
    http.get(`${api}/pacientes`).subscribe({ error: () => undefined });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).flush(
      { mensaje: 'No se pudo verificar la sesión' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await drenar();
    expect(auth.getToken()).toBeTruthy();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
    expect(alerta.warning).toHaveBeenCalledWith(expect.stringContaining('no puede verificar'));
    httpMock.expectNone((llamada) => llamada.url.includes('/auth/refresh'));
  });

  it('12b. si el servicio no responde al renovar, la sesión sigue abierta', async () => {
    entrar();
    let estado = -1;
    http.get(`${api}/tratamientos`).subscribe({ error: (error) => { estado = error.status; } });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/tratamientos')).flush(
      { mensaje: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );
    const refresh = httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/refresh'));
    refresh.error(new ProgressEvent('error'));
    await drenar();
    expect(estado).toBe(0);
    expect(auth.getToken()).toBeTruthy();
    expect(auth.enCorte()).toBe(true);
    expect(alerta.warning).toHaveBeenCalledWith('No se pudo contactar con el servidor.');
    expect(alerta.warning).not.toHaveBeenCalledWith(expect.stringContaining('ya no es válida'));
  });

  it('13. una renovación incompleta o que alarga el vencimiento absoluto se descarta', async () => {
    entrar();
    let primera = true;
    auth.refreshCompartido().then((valor) => { primera = valor; });
    httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/refresh')).flush({ success: true, data: {} });
    await drenar();
    expect(primera).toBe(false);
    expect(auth.getToken()).toBeNull();

    const base = entrar();
    const alargada = emitir(sessionExp + 3600, ahora + 900, 'jti-larga');
    let segunda = true;
    auth.refreshCompartido().then((valor) => { segunda = valor; });
    httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/refresh')).flush(alargada.body);
    await drenar();
    expect(segunda).toBe(false);
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
    expect(auth.getToken()).not.toBe(base.access);
  });

  it('14. el cambio de empresa envía el encabezado de la empresa activa', async () => {
    entrar();
    unidad.setUnidad(1);
    http.get(`${api}/sedes`).subscribe();
    await drenar();
    const primera = httpMock.expectOne((llamada) => llamada.url.endsWith('/sedes'));
    expect(primera.request.headers.get('X-Unidad-Id')).toBe('1');
    primera.flush({ data: [] });
    unidad.setUnidad(2);
    http.get(`${api}/sedes`).subscribe();
    await drenar();
    const segunda = httpMock.expectOne((llamada) => llamada.url.endsWith('/sedes'));
    expect(segunda.request.headers.get('X-Unidad-Id')).toBe('2');
    expect(segunda.request.headers.get('Authorization')?.startsWith('Bearer ')).toBe(true);
    segunda.flush({ data: [] });
  });

  it('14b. un encabezado de empresa ya indicado se conserva para el borrador', async () => {
    entrar();
    unidad.setUnidad(1);
    http.get(`${api}/sedes`, { headers: { 'X-Unidad-Id': '2' } }).subscribe();
    await drenar();
    const llamada = httpMock.expectOne((peticion) => peticion.url.endsWith('/sedes'));
    expect(llamada.request.headers.get('X-Unidad-Id')).toBe('2');
    llamada.flush({ data: [] });
  });

  it('15. una renovación tardía no restaura la sesión después del logout', async () => {
    entrar();
    const renovada = emitir(sessionExp, ahora + 900, 'jti-tarde');
    let resultado = true;
    auth.refreshCompartido().then((valor) => { resultado = valor; });
    auth.logout();
    const refresh = httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/refresh'));
    const logout = httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/logout'));
    refresh.flush(renovada.body);
    logout.flush({ success: true });
    await drenar();
    expect(resultado).toBe(false);
    expect(auth.getToken()).toBeNull();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(sessionStorage.getItem('cli_sid')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
  });

  it('18. al recargar usa la cookie csrf y no el refresh legado', async () => {
    document.cookie = 'cli_csrf=csrf-recarga';
    sessionStorage.setItem('cli_refresh', jwt({ token_use: 'refresh', sid: 'legado' }));
    usarServicio();
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    const renovada = emitir(sessionExp, ahora + 900, 'jti-recarga');
    let ok = false;
    auth.ensureSession().then((valor) => { ok = valor; });
    const refresh = httpMock.expectOne((llamada) => llamada.url.endsWith('/auth/refresh'));
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.body).toEqual({});
    expect(refresh.request.headers.get('X-CSRF-Token')).toBe('csrf-recarga');
    refresh.flush(renovada.body);
    await drenar();
    expect(ok).toBe(true);
    expect(auth.getToken()).toBe(renovada.access);
    expect(sessionStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('cli_refresh')).toBeNull();
  });

  it('16 y 17. no escribe tokens en consola ni guarda el refresh en localStorage', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sesion = entrar();
    const volcado = JSON.stringify([...log.mock.calls, ...error.mock.calls, ...warn.mock.calls]);
    expect(volcado).not.toContain(sesion.access);
    expect(volcado).not.toContain(sesion.refresh);
    expect(localStorage.getItem('cli_refresh')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    log.mockRestore();
    error.mockRestore();
    warn.mockRestore();
  });

  it('un error de red no cierra la sesión', async () => {
    entrar();
    http.get(`${api}/pacientes`).subscribe({ error: () => undefined });
    await drenar();
    httpMock.expectOne((llamada) => llamada.url.endsWith('/pacientes')).error(new ProgressEvent('error'));
    await drenar();
    expect(auth.getToken()).toBeTruthy();
    expect(alerta.warning).toHaveBeenCalledWith('No se pudo contactar con el servidor.');
  });
});
