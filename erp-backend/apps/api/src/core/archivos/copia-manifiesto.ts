import {
  constants,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from 'fs';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { esRutaDeManifiestoBackend } from './paquete-exclusion';

/**
 * Orígenes fijos dentro de erp-backend y destinos de la raíz Node.
 * No hay búsqueda ni sustitutos. dist/apps/api/main.js solo se acepta aquí,
 * y en el destino se llama main.js.
 */
export const CORRESPONDENCIAS_BACKEND = [
  { origen: 'app.js', destino: 'app.js' },
  { origen: 'dist/apps/api/main.js', destino: 'main.js' },
  { origen: 'package.json', destino: 'package.json' },
  { origen: 'package-lock.json', destino: 'package-lock.json' },
  { origen: 'assets/branding/logo-clinica-lopez.png', destino: 'assets/branding/logo-clinica-lopez.png' },
] as const;

const SEGMENTOS_PROHIBIDOS = new Set(['node_modules', 'storage', 'uploads']);

export class ErrorCopiaManifiesto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCopiaManifiesto';
  }
}

/**
 * Comprueba las cinco correspondencias y solo entonces copia.
 * Entre la comprobación y la copia el disco puede cambiar: no hay bloqueo
 * de directorio ni protección completa frente a una condición de carrera.
 * COPYFILE_EXCL evita un sobrescrito silencioso si el destino aparece en ese hueco.
 */
export function copiarManifiestoBackend(opciones: { raizOrigen: string; raizDestino: string }): string[] {
  const origen = afirmarDirectorioReal(opciones.raizOrigen, 'origen');
  const destino = afirmarDirectorioReal(opciones.raizDestino, 'destino');
  if (mismoDirectorio(origen, destino)) {
    throw new ErrorCopiaManifiesto('El origen y el destino no pueden ser la misma raíz.');
  }

  const plan: { desde: string; hacia: string; relativo: string }[] = [];
  for (const mapa of CORRESPONDENCIAS_BACKEND) {
    if (!esRutaDeManifiestoBackend(mapa.destino)) {
      throw new ErrorCopiaManifiesto('El destino del manifiesto no está autorizado.');
    }
    const desde = afirmarArchivoRegular(origen, mapa.origen);
    const hacia = afirmarDestinoLibre(destino, mapa.destino);
    plan.push({ desde, hacia, relativo: mapa.destino });
  }

  const hechos: string[] = [];
  try {
    for (const paso of plan) {
      const carpeta = dirnameSeguro(destino, paso.hacia);
      if (!existe(carpeta)) mkdirSync(carpeta, { recursive: true });
      afirmarDirectorioReal(carpeta, 'destino');
      copyFileSync(paso.desde, paso.hacia, constants.COPYFILE_EXCL);
      hechos.push(paso.relativo);
    }
  } catch (error) {
    for (const relativo of hechos) {
      try {
        unlinkSync(join(destino, ...relativo.split('/')));
      } catch {
        /* el informe de la causa original sigue siendo el que se lanza */
      }
    }
    if (error instanceof ErrorCopiaManifiesto) throw error;
    throw new ErrorCopiaManifiesto('La copia se interrumpió. No se dejó un manifiesto parcial.');
  }
  return hechos;
}

function existe(ruta: string): boolean {
  try {
    lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

function mismoDirectorio(izquierda: string, derecha: string): boolean {
  if (process.platform === 'win32') return izquierda.toLowerCase() === derecha.toLowerCase();
  return izquierda === derecha;
}

function afirmarDirectorioReal(entrada: string, papel: 'origen' | 'destino'): string {
  if (!existe(entrada)) {
    throw new ErrorCopiaManifiesto(`La raíz de ${papel} no existe.`);
  }
  const absoluta = resolve(entrada);
  let cursor = absoluta.startsWith('\\\\') ? '\\\\' : absoluta.slice(0, absoluta.indexOf(sep) + 1);
  if (!cursor) cursor = sep;
  const resto = absoluta.slice(cursor.length).split(sep).filter(Boolean);
  for (const parte of resto) {
    cursor = bajarRaiz(cursor, parte);
  }
  const real = realpathSync.native(cursor);
  if (escapa(cursor, real)) {
    throw new ErrorCopiaManifiesto('La raíz sale de su ruta por un enlace.');
  }
  return cursor;
}

/** La raíz puede llegar con otra capitalización. Los archivos del manifiesto, no. */
function bajarRaiz(directorio: string, nombre: string): string {
  prohibido(nombre);
  const lower = nombre.toLowerCase();
  const nombres = readdirSync(directorio);
  const realNombre = nombres.find((candidato) => candidato === nombre)
    ?? nombres.find((candidato) => candidato.toLowerCase() === lower);
  if (!realNombre) throw new ErrorCopiaManifiesto('La raíz no existe.');
  const siguiente = join(directorio, realNombre);
  const estado = lstatSync(siguiente);
  if (estado.isSymbolicLink() || !estado.isDirectory() || escapa(siguiente, realpathSync.native(siguiente))) {
    throw new ErrorCopiaManifiesto('La raíz contiene un enlace simbólico.');
  }
  return siguiente;
}

function afirmarArchivoRegular(raiz: string, relativo: string): string {
  const partes = segmentosRelativos(relativo);
  let actual = raiz;
  for (let i = 0; i < partes.length; i++) {
    const ultimo = i === partes.length - 1;
    actual = descender(actual, partes[i], !ultimo);
  }
  contener(raiz, actual);
  return actual;
}

function afirmarDestinoLibre(raiz: string, relativo: string): string {
  const partes = segmentosRelativos(relativo);
  let actual = raiz;
  for (let i = 0; i < partes.length; i++) {
    const ultimo = i === partes.length - 1;
    const estado = clasificar(actual, partes[i]);
    if (estado === 'ausente') {
      const pendiente = join(actual, ...partes.slice(i));
      contener(raiz, pendiente);
      return pendiente;
    }
    if (estado === 'otra-capitalizacion') {
      throw new ErrorCopiaManifiesto('La capitalización del nombre no coincide con el manifiesto.');
    }
    actual = descender(actual, partes[i], !ultimo);
    if (ultimo) {
      throw new ErrorCopiaManifiesto('El destino ya existe. No se sobrescribe.');
    }
  }
  throw new ErrorCopiaManifiesto('El destino del manifiesto no es válido.');
}

export function segmentosRelativos(relativo: string): string[] {
  const uniforme = relativo.replace(/\\/g, '/');
  if (uniforme.startsWith('/') || /^[A-Za-z]:/.test(uniforme)) {
    throw new ErrorCopiaManifiesto('La ruta del manifiesto no puede ser absoluta.');
  }
  const partes = uniforme.split('/');
  if (partes.some((parte) => parte === '' || parte === '.' || parte === '..')) {
    throw new ErrorCopiaManifiesto('La ruta del manifiesto sale de la raíz autorizada.');
  }
  for (const parte of partes) prohibido(parte);
  return partes;
}

function prohibido(nombre: string): void {
  const lower = nombre.toLowerCase();
  if (SEGMENTOS_PROHIBIDOS.has(lower) || lower === '.env' || lower.startsWith('.env.')) {
    throw new ErrorCopiaManifiesto('La ruta entra en un directorio prohibido.');
  }
}

function descender(directorio: string, nombre: string, debeSerDirectorio: boolean): string {
  if (clasificar(directorio, nombre) !== 'exacto') {
    throw new ErrorCopiaManifiesto(
      clasificar(directorio, nombre) === 'ausente'
        ? 'Falta un archivo obligatorio del manifiesto.'
        : 'La capitalización del nombre no coincide con el manifiesto.',
    );
  }
  const siguiente = join(directorio, nombre);
  const estado = lstatSync(siguiente);
  if (estado.isSymbolicLink()) {
    throw new ErrorCopiaManifiesto('La ruta contiene un enlace simbólico.');
  }
  const real = realpathSync.native(siguiente);
  if (escapa(siguiente, real)) {
    throw new ErrorCopiaManifiesto('La ruta contiene un enlace simbólico.');
  }
  if (debeSerDirectorio) {
    if (!estado.isDirectory()) throw new ErrorCopiaManifiesto('Se esperaba un directorio del manifiesto.');
    return siguiente;
  }
  if (!estado.isFile()) throw new ErrorCopiaManifiesto('Se esperaba un archivo regular del manifiesto.');
  return siguiente;
}

function clasificar(directorio: string, nombre: string): 'exacto' | 'otra-capitalizacion' | 'ausente' {
  const nombres = readdirSync(directorio);
  if (nombres.includes(nombre)) return 'exacto';
  if (nombres.some((candidato) => candidato.toLowerCase() === nombre.toLowerCase())) return 'otra-capitalizacion';
  return 'ausente';
}

function contener(raiz: string, candidato: string): void {
  const rel = relative(resolve(raiz), resolve(candidato));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new ErrorCopiaManifiesto('La ruta sale de la raíz autorizada.');
  }
}

function escapa(lexical: string, real: string): boolean {
  const izquierda = sinPrefijo(resolve(lexical));
  const derecha = sinPrefijo(resolve(real));
  if (process.platform === 'win32') return izquierda.toLowerCase() !== derecha.toLowerCase();
  return izquierda !== derecha;
}

function sinPrefijo(ruta: string): string {
  return ruta.startsWith('\\\\?\\') ? ruta.slice(4) : ruta;
}

function dirnameSeguro(raiz: string, archivo: string): string {
  contener(raiz, archivo);
  const carpeta = resolve(archivo, '..');
  const rel = relative(resolve(raiz), carpeta);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new ErrorCopiaManifiesto('La ruta sale de la raíz autorizada.');
  }
  return carpeta;
}
