import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { UnidadContextService } from '../../services/unidad-context.service';
import { esSesionInvalida, mensajeHttp } from '../../auth/sesion-token';

export const AUTH_REINTENTO = new HttpContextToken<boolean>(() => false);

function esRutaAuth(url: string): boolean {
  return url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/logout');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const unidad = inject(UnidadContextService);

  const enviar = (origen: typeof req, reintento: boolean) => {
    const token = auth.getToken();
    let salida = origen;
    if (reintento) salida = salida.clone({ context: salida.context.set(AUTH_REINTENTO, true) });
    if (token && !esRutaAuth(salida.url)) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      const idUnidad = unidad.idUnidad();
      if (idUnidad && !salida.headers.has('X-Unidad-Id')) headers['X-Unidad-Id'] = String(idUnidad);
      salida = salida.clone({ setHeaders: headers });
    }
    return next(salida);
  };

  const preparar = async (): Promise<boolean> => {
    if (req.context.get(AUTH_REINTENTO) || esRutaAuth(req.url) || !auth.convieneRenovar()) return true;
    const ok = await auth.refreshCompartido();
    if (!ok && !auth.enCorte()) auth.abandonar();
    return ok;
  };

  return from(preparar()).pipe(
    switchMap((seguir) => {
      if (!seguir) {
        const status = auth.enCorte() ? 0 : 401;
        return throwError(() => new HttpErrorResponse({ status, statusText: status === 0 ? 'Unknown Error' : 'Unauthorized' }));
      }
      return enviar(req, false).pipe(
        catchError((error: HttpErrorResponse) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401 || esRutaAuth(req.url)) {
            return throwError(() => error);
          }
          if (req.context.get(AUTH_REINTENTO) || esSesionInvalida(mensajeHttp(error))) {
            auth.abandonar();
            return throwError(() => error);
          }
          return from(auth.refreshCompartido()).pipe(
            switchMap((ok) => {
              if (!ok) {
                if (!auth.enCorte()) auth.abandonar();
                return throwError(() => auth.enCorte()
                  ? new HttpErrorResponse({ status: 0, statusText: 'Unknown Error' })
                  : error);
              }
              return enviar(req, true).pipe(
                catchError((reintento: HttpErrorResponse) => {
                  if (reintento instanceof HttpErrorResponse && reintento.status === 401) auth.abandonar();
                  return throwError(() => reintento);
                }),
              );
            }),
          );
        }),
      );
    }),
  );
};
