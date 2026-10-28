const LOCAL_DESARROLLO = 'http://localhost:4202';

function esProduccion(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/**
 * Los enlaces de correo salen de esta URL. En producción no hay dominio
 * inventado ni respaldo local: si falta o apunta a la máquina, el arranque falla.
 * En desarrollo, si no está definida, se usa el puerto real del frontend.
 */
export function resolverFrontendUrl(opciones: {
  configurada?: string | null;
  nodeEnv?: string;
} = {}): string {
  const configurada = (opciones.configurada ?? '').trim().replace(/\/+$/, '');
  const nodeEnv = opciones.nodeEnv ?? process.env.NODE_ENV;
  if (!esProduccion(nodeEnv)) return configurada || LOCAL_DESARROLLO;
  if (!configurada) {
    throw new Error(
      'FRONTEND_URL es obligatoria en producción. Indique el origen HTTPS del sitio. No hay un dominio por defecto.',
    );
  }
  let url: URL;
  try {
    url = new URL(configurada);
  } catch {
    throw new Error('FRONTEND_URL debe ser una URL absoluta http o https.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('FRONTEND_URL debe ser una URL absoluta http o https.');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
    throw new Error('FRONTEND_URL no puede ser una dirección local en producción.');
  }
  return configurada;
}
