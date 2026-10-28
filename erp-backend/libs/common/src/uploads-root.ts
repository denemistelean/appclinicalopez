import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

/** Nombre del manifiesto que identifica la raíz, esté el bundle en dist o junto a app.js. */
export const NOMBRE_PAQUETE = 'app-clinica-lopez-backend';

/**
 * Sube desde el directorio del módulo hasta el package.json de esta API.
 * No usa una cantidad fija de `..`, porque dist/apps/api y la raíz Passenger
 * no dejan `__dirname` en el mismo sitio.
 */
export function buscarRaizAplicacion(directorioModulo: string): string {
  let actual = resolve(directorioModulo);
  for (let i = 0; i < 8; i++) {
    const manifiesto = join(actual, 'package.json');
    if (existsSync(manifiesto)) {
      try {
        const datos = JSON.parse(readFileSync(manifiesto, 'utf8')) as { name?: string };
        if (datos?.name === NOMBRE_PAQUETE) return actual;
      } catch {
        /* un manifiesto ajeno o ilegible no detiene la búsqueda */
      }
    }
    const padre = dirname(actual);
    if (padre === actual) break;
    actual = padre;
  }
  throw new Error(
    'No se encontró la raíz de la aplicación para uploads. Hace falta el package.json de la API.',
  );
}

/** Carpeta pública /uploads, siempre junto al package.json. No es DOCUMENTOS_ROOT. */
export function resolverUploadsRoot(directorioModulo: string): string {
  return join(buscarRaizAplicacion(directorioModulo), 'uploads');
}
