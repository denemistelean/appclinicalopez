import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/** Permite volver a crear la pantalla actual al pulsar Conectar, sin desmontar el marco. */
@Injectable({ providedIn: 'root' })
export class RecargaConexion extends BaseRouteReuseStrategy {
  private pendiente = false;

  marcar(): void {
    this.pendiente = true;
  }

  soltar(): void {
    this.pendiente = false;
  }

  override shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    const reutilizar = super.shouldReuseRoute(future, curr);
    if (!this.pendiente || !reutilizar) return reutilizar;
    const pagina = !!future.routeConfig?.component || !!future.routeConfig?.loadComponent;
    if (pagina && !future.firstChild) {
      this.pendiente = false;
      return false;
    }
    return true;
  }
}
