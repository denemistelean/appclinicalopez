const INTERFACES_ABIERTAS = new Set(['0.0.0.0', '::', '::0', '*']);

/** Producción solo si NODE_ENV es exactamente production. Un valor vacío no lo es. */
export function esProduccion(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/**
 * Desarrollo sin HOST escucha en 127.0.0.1 para que Angular en esta máquina
 * llegue por localhost y por 127.0.0.1, sin abrir todas las interfaces.
 * Producción no elige interfaz: HOST es obligatorio y no puede ser un comodín.
 */
export function resolverHost(entorno: NodeJS.ProcessEnv = process.env): string {
  const host = (entorno.HOST ?? '').trim();
  if (esProduccion(entorno.NODE_ENV)) {
    if (!host) {
      throw new Error(
        'HOST es obligatorio en producción. Indique la interfaz del proxy, por ejemplo 127.0.0.1. No hay un valor por defecto.',
      );
    }
    if (INTERFACES_ABIERTAS.has(host)) {
      throw new Error('HOST no puede exponer todas las interfaces en producción.');
    }
    return host;
  }
  return host || '127.0.0.1';
}

/** Socket que Phusion Passenger inyecta. No es una interfaz de red. */
export const SOCKET_PASSENGER = 'passenger';

export interface ControlPasajero {
  configure(opciones: { autoInstall: boolean }): void;
}

/**
 * Solo el runtime de Passenger define este global antes de cargar la aplicación.
 * Una variable de entorno no activa el modo.
 */
export function detectarPasajero(ambito: object = globalThis): ControlPasajero | null {
  const candidato = (ambito as { PhusionPassenger?: Partial<ControlPasajero> }).PhusionPassenger;
  if (!candidato || typeof candidato.configure !== 'function') return null;
  return candidato as ControlPasajero;
}

export type ModoEscucha =
  | { tipo: 'passenger'; socket: typeof SOCKET_PASSENGER }
  | { tipo: 'tcp'; host: string; port: string };

/**
 * Con Passenger no hay bind TCP. Sin ese runtime se mantiene la validación de HOST.
 */
export function resolverEscucha(
  entorno: NodeJS.ProcessEnv = process.env,
  pasajero: ControlPasajero | null = detectarPasajero(),
): ModoEscucha {
  if (pasajero) return { tipo: 'passenger', socket: SOCKET_PASSENGER };
  return {
    tipo: 'tcp',
    host: resolverHost(entorno),
    port: String(entorno.PORT || 3777),
  };
}
