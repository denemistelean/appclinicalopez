import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { UnidadContextService } from '../services/unidad-context.service';
import { AlertService } from '../services/ui/alert.service';
import { mensajeHttp } from '../auth/sesion-token';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const alert = inject(AlertService);
  const unidad = inject(UnidadContextService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 403) {
        const msg = mensajeHttp(error).toLowerCase();
        if (msg.includes('no tiene acceso a esta empresa')) {
          unidad.soltarSeleccion();
          alert.warning('Ya no tienes acceso a la empresa seleccionada. Elige otra si tienes membresía.');
        } else {
          router.navigate(['/agenda']);
          alert.error('No tienes permisos suficientes para ver este módulo o realizar esta acción.');
        }
      } else if (error.status === 503) {
        alert.warning('El servicio no puede verificar la sesión en este momento. Inténtalo de nuevo.');
      } else if (error.status === 0) {
        alert.warning('No se pudo contactar con el servidor.');
      } else if (error.status === 400 && mensajeHttp(error).toLowerCase().includes('empresa activa')) {
        alert.warning('Selecciona la empresa con la que quieres trabajar.');
      }

      return throwError(() => error);
    })
  );
};
