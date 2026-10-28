import { posix, win32 } from 'path';
import { esProduccion } from '../http/escucha';

function esRutaWindows(ruta: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(ruta) || ruta.includes('\\');
}

function contieneRaizPublica(ruta: string): boolean {
  return ruta.split(/[\\/]+/).some((parte) => {
    const nombre = parte.toLowerCase();
    return nombre === 'public_html' || nombre === 'htdocs';
  });
}

function normalizar(ruta: string, plataforma: NodeJS.Platform): string {
  const limpia = ruta.replace(/\\/g, '/').replace(/\/+$/, '');
  return plataforma === 'win32' ? limpia.toLowerCase() : limpia;
}

/** True si las rutas son la misma o una vive dentro de la otra. */
export function rutasSeSolapan(izquierda: string, derecha: string, plataforma: NodeJS.Platform): boolean {
  const a = normalizar(izquierda, plataforma);
  const b = normalizar(derecha, plataforma);
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/**
 * En producción no hay respaldo: la ruta la define el despliegue, es absoluta
 * para ese sistema y queda fuera de la web pública y de /uploads.
 * No depende de dónde esté el bundle. En desarrollo se conserva el respaldo local.
 */
export function resolverDocumentosRoot(opciones: {
  configurada?: string | null;
  nodeEnv?: string;
  plataforma?: NodeJS.Platform;
  respaldo?: string;
  uploadsRoot?: string;
} = {}): string {
  const configurada = (opciones.configurada ?? '').trim();
  const nodeEnv = opciones.nodeEnv ?? process.env.NODE_ENV;
  const plataforma = opciones.plataforma ?? process.platform;
  if (esProduccion(nodeEnv)) {
    if (!configurada) {
      throw new Error(
        'DOCUMENTOS_ROOT es obligatorio en producción. Indique un directorio absoluto, persistente y fuera de la raíz pública del sitio.',
      );
    }
    if (plataforma !== 'win32' && esRutaWindows(configurada)) {
      throw new Error('DOCUMENTOS_ROOT no puede ser una ruta de Windows en este sistema.');
    }
    const absoluto = (plataforma === 'win32' ? win32 : posix).isAbsolute(configurada);
    if (!absoluto) {
      throw new Error('DOCUMENTOS_ROOT debe ser una ruta absoluta en producción.');
    }
    if (contieneRaizPublica(configurada)) {
      throw new Error('DOCUMENTOS_ROOT debe quedar fuera del directorio público del sitio.');
    }
    if (opciones.uploadsRoot && rutasSeSolapan(opciones.uploadsRoot, configurada, plataforma)) {
      throw new Error('DOCUMENTOS_ROOT no puede coincidir con la carpeta pública uploads ni quedar dentro de ella.');
    }
    return configurada;
  }
  if (configurada) return configurada;
  if (opciones.respaldo) return opciones.respaldo;
  throw new Error('DOCUMENTOS_ROOT no está configurado.');
}

/** Falla el arranque de producción antes de abrir el servidor. */
export function afirmarDocumentosDeProduccion(
  entorno: NodeJS.ProcessEnv = process.env,
  plataforma: NodeJS.Platform = process.platform,
  uploadsRoot?: string,
): void {
  if (!esProduccion(entorno.NODE_ENV)) return;
  resolverDocumentosRoot({
    configurada: entorno.DOCUMENTOS_ROOT,
    nodeEnv: entorno.NODE_ENV,
    plataforma,
    uploadsRoot,
  });
}
