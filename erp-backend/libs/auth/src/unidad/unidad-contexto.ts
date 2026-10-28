import { AsyncLocalStorage } from 'async_hooks';

export interface UnidadActiva {
  idUnidad: number;
  roleId: number;
  operaFinanzas: number;
  /** true si el usuario opera como OMNI_ADMINISTRADOR sin membresía por unidad */
  omni?: boolean;
  requiereComprobante?: number;
}

export const unidadAls = new AsyncLocalStorage<UnidadActiva>();
