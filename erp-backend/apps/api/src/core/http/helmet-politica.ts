import type { HelmetOptions } from 'helmet';
import { esProduccion } from './escucha';

/**
 * HSTS solo en producción. Sin includeSubDomains ni preload: el alcance
 * de subdominios no está evaluado y el encabezado no demuestra que HTTPS funcione.
 * En HTTP local el encabezado queda desactivado. El resto de Helmet se mantiene.
 */
export function opcionesHelmet(nodeEnv: string | undefined = process.env.NODE_ENV): HelmetOptions {
  return {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: esProduccion(nodeEnv)
      ? { maxAge: 31536000, includeSubDomains: false, preload: false }
      : false,
  };
}
