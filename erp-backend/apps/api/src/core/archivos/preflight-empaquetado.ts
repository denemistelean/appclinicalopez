import { lstatSync, readdirSync, realpathSync } from 'fs';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { CORRESPONDENCIAS_BACKEND } from './copia-manifiesto';
import { esRutaDeManifiestoBackend } from './paquete-exclusion';

/**
 * Lectura previa al empaquetado. No crea, no copia, no borra y no modifica.
 * El resultado describe el disco en el momento de la lectura. No impide que
 * cambie antes de una copia posterior.
 */
export const LIMITE_PREFLIGHT =
  'La comprobación solo describe el estado leído. No impide que el disco cambie antes de una copia posterior.';

const SEGMENTOS_PROHIBIDOS = new Set(['node_modules', 'storage', 'uploads']);

export type AmbitoPreflight = 'origen' | 'destino' | 'manifiesto';

export type ComprobacionPreflight =
  | 'raiz-inexistente'
  | 'raiz-enlace'
  | 'raiz-no-directorio'
  | 'segmento-prohibido'
  | 'archivo-ausente'
  | 'capitalizacion'
  | 'enlace-simbolico'
  | 'escape'
  | 'tipo-incorrecto'
  | 'destino-existente'
  | 'ruta-no-autorizada'
  | 'ruta-omitida'
  | 'raices-iguales';

export interface DiagnosticoPreflight {
  comprobacion: ComprobacionPreflight;
  rutaRelativa: string;
  ambito: AmbitoPreflight;
  mensaje: string;
}

export interface EntradaPreflight {
  origen: string;
  destino: string;
}

export interface ResultadoPreflight {
  ok: boolean;
  diagnosticos: DiagnosticoPreflight[];
  /** Directorios de destino que todavía no existen. Esta función no los crea. */
  carpetasPendientes: string[];
  correspondencias: readonly EntradaPreflight[];
  limite: string;
}

export function preflightEmpaquetadoBackend(opciones: {
  raizOrigen: string;
  raizDestino: string;
  entradas?: readonly EntradaPreflight[];
}): ResultadoPreflight {
  const diagnosticos: DiagnosticoPreflight[] = [];
  revisarManifiesto(opciones.entradas, diagnosticos);

  const origen = resolverRaiz(opciones.raizOrigen, 'origen', diagnosticos);
  const destino = resolverRaiz(opciones.raizDestino, 'destino', diagnosticos);
  const pendientes = new Set<string>();

  if (origen && destino) {
    if (mismoDirectorio(origen, destino)) {
      diagnosticos.push(diag('manifiesto', '', 'raices-iguales', 'El origen y el destino son la misma raíz.'));
    } else {
      for (const mapa of CORRESPONDENCIAS_BACKEND) {
        revisarOrigen(origen, mapa.origen, diagnosticos);
        revisarDestino(destino, mapa.destino, diagnosticos, pendientes);
      }
    }
  }

  return {
    ok: diagnosticos.length === 0,
    diagnosticos,
    carpetasPendientes: [...pendientes],
    correspondencias: CORRESPONDENCIAS_BACKEND,
    limite: LIMITE_PREFLIGHT,
  };
}

function revisarManifiesto(entradas: readonly EntradaPreflight[] | undefined, diagnosticos: DiagnosticoPreflight[]): void {
  if (!entradas) return;
  for (const entrada of entradas) {
    const autorizada = CORRESPONDENCIAS_BACKEND.some(
      (mapa) => mapa.origen === entrada.origen && mapa.destino === entrada.destino,
    );
    if (autorizada && esRutaDeManifiestoBackend(entrada.destino)) continue;
    diagnosticos.push(diag(
      'manifiesto',
      rutaDiagnostico(entrada.destino || entrada.origen),
      'ruta-no-autorizada',
      'La entrada no pertenece a las cinco correspondencias autorizadas.',
    ));
  }
  for (const mapa of CORRESPONDENCIAS_BACKEND) {
    const presente = entradas.some((entrada) => entrada.origen === mapa.origen && entrada.destino === mapa.destino);
    if (!presente) {
      diagnosticos.push(diag(
        'manifiesto',
        mapa.destino,
        'ruta-omitida',
        `Falta la correspondencia ${mapa.origen} -> ${mapa.destino}.`,
      ));
    }
  }
}

function resolverRaiz(entrada: string, ambito: 'origen' | 'destino', diagnosticos: DiagnosticoPreflight[]): string | undefined {
  if (!existe(entrada)) {
    diagnosticos.push(diag(ambito, '', 'raiz-inexistente', 'La raíz no existe. El preflight no la crea.'));
    return undefined;
  }
  const absoluta = resolve(entrada);
  let cursor = absoluta.startsWith('\\\\') ? '\\\\' : absoluta.slice(0, absoluta.indexOf(sep) + 1);
  if (!cursor) cursor = sep;
  const resto = absoluta.slice(cursor.length).split(sep).filter(Boolean);
  for (const parte of resto) {
    if (prohibido(parte)) {
      diagnosticos.push(diag(ambito, '', 'segmento-prohibido', 'La raíz entra en un directorio prohibido.'));
      return undefined;
    }
    const nombres = leerNombres(cursor);
    if (!nombres) {
      diagnosticos.push(diag(ambito, '', 'raiz-inexistente', 'No se pudo leer un componente de la raíz.'));
      return undefined;
    }
    const realNombre = nombres.find((candidato) => candidato === parte)
      ?? nombres.find((candidato) => candidato.toLowerCase() === parte.toLowerCase());
    if (!realNombre) {
      diagnosticos.push(diag(ambito, '', 'raiz-inexistente', 'La raíz no existe. El preflight no la crea.'));
      return undefined;
    }
    const siguiente = join(cursor, realNombre);
    const estado = lstatSync(siguiente);
    if (estado.isSymbolicLink()) {
      diagnosticos.push(diag(ambito, '', 'raiz-enlace', 'La raíz contiene un enlace simbólico.'));
      return undefined;
    }
    if (!estado.isDirectory()) {
      diagnosticos.push(diag(ambito, '', 'raiz-no-directorio', 'La raíz no es un directorio.'));
      return undefined;
    }
    let real: string;
    try {
      real = realpathSync.native(siguiente);
    } catch {
      diagnosticos.push(diag(ambito, '', 'escape', 'La raíz no permanece en su ruta.'));
      return undefined;
    }
    if (escapa(siguiente, real)) {
      diagnosticos.push(diag(ambito, '', 'escape', 'La raíz no permanece en su ruta.'));
      return undefined;
    }
    cursor = siguiente;
  }
  return cursor;
}

function revisarOrigen(raiz: string, relativo: string, diagnosticos: DiagnosticoPreflight[]): void {
  const partes = relativo.split('/');
  let actual = raiz;
  for (let i = 0; i < partes.length; i++) {
    const ultimo = i === partes.length - 1;
    const nombre = partes[i];
    if (prohibido(nombre)) {
      diagnosticos.push(diag('origen', relativo, 'segmento-prohibido', 'La ruta entra en un directorio prohibido.'));
      return;
    }
    const estado = clasificar(actual, nombre);
    if (estado === 'ausente') {
      diagnosticos.push(diag('origen', relativo, 'archivo-ausente', 'Falta un archivo obligatorio del manifiesto.'));
      return;
    }
    if (estado === 'otra-capitalizacion') {
      diagnosticos.push(diag('origen', relativo, 'capitalizacion', 'La capitalización del nombre no coincide con el manifiesto.'));
      return;
    }
    if (estado === 'ilegible') {
      diagnosticos.push(diag('origen', relativo, 'archivo-ausente', 'No se pudo leer el directorio del origen.'));
      return;
    }
    const siguiente = join(actual, nombre);
    if (!aceptarNodo(raiz, relativo, siguiente, ultimo, 'origen', diagnosticos)) return;
    actual = siguiente;
  }
}

function revisarDestino(
  raiz: string,
  relativo: string,
  diagnosticos: DiagnosticoPreflight[],
  pendientes: Set<string>,
): void {
  const partes = relativo.split('/');
  let actual = raiz;
  for (let i = 0; i < partes.length; i++) {
    const ultimo = i === partes.length - 1;
    const nombre = partes[i];
    if (prohibido(nombre)) {
      diagnosticos.push(diag('destino', relativo, 'segmento-prohibido', 'La ruta entra en un directorio prohibido.'));
      return;
    }
    const estado = clasificar(actual, nombre);
    if (estado === 'ausente') {
      if (!ultimo) {
        for (let j = i; j < partes.length - 1; j++) pendientes.add(partes.slice(0, j + 1).join('/'));
      }
      const candidato = join(actual, ...partes.slice(i));
      if (sale(raiz, candidato)) {
        diagnosticos.push(diag('destino', relativo, 'escape', 'El destino saldría de la raíz autorizada.'));
      }
      return;
    }
    if (estado === 'otra-capitalizacion') {
      diagnosticos.push(diag('destino', relativo, 'capitalizacion', 'La capitalización del nombre no coincide con el manifiesto.'));
      return;
    }
    if (estado === 'ilegible') {
      diagnosticos.push(diag('destino', relativo, 'escape', 'No se pudo leer el directorio de destino.'));
      return;
    }
    const siguiente = join(actual, nombre);
    const nodo = aceptarNodo(raiz, relativo, siguiente, ultimo, 'destino', diagnosticos);
    if (!nodo) return;
    if (ultimo) {
      diagnosticos.push(diag('destino', relativo, 'destino-existente', 'El destino ya existe. El preflight no lo modifica.'));
      return;
    }
    actual = siguiente;
  }
}

function aceptarNodo(
  raiz: string,
  relativo: string,
  ruta: string,
  ultimo: boolean,
  ambito: 'origen' | 'destino',
  diagnosticos: DiagnosticoPreflight[],
): boolean {
  const estado = lstatSync(ruta);
  if (estado.isSymbolicLink()) {
    diagnosticos.push(diag(ambito, relativo, 'enlace-simbolico', 'La ruta contiene un enlace simbólico.'));
    return false;
  }
  let real: string;
  try {
    real = realpathSync.native(ruta);
  } catch {
    diagnosticos.push(diag(ambito, relativo, 'escape', 'La ruta resuelta no permanece en la raíz.'));
    return false;
  }
  if (escapa(ruta, real) || sale(raiz, ruta)) {
    diagnosticos.push(diag(ambito, relativo, 'escape', 'La ruta resuelta no permanece en la raíz.'));
    return false;
  }
  if (ultimo) {
    if (!estado.isFile()) {
      diagnosticos.push(diag(ambito, relativo, 'tipo-incorrecto', 'Se esperaba un archivo regular.'));
      return false;
    }
    return true;
  }
  if (!estado.isDirectory()) {
    diagnosticos.push(diag(ambito, relativo, 'tipo-incorrecto', 'Se esperaba un directorio del manifiesto.'));
    return false;
  }
  return true;
}

function clasificar(directorio: string, nombre: string): 'exacto' | 'otra-capitalizacion' | 'ausente' | 'ilegible' {
  const nombres = leerNombres(directorio);
  if (!nombres) return 'ilegible';
  if (nombres.includes(nombre)) return 'exacto';
  if (nombres.some((candidato) => candidato.toLowerCase() === nombre.toLowerCase())) return 'otra-capitalizacion';
  return 'ausente';
}

function leerNombres(directorio: string): string[] | undefined {
  try {
    return readdirSync(directorio);
  } catch {
    return undefined;
  }
}

function existe(ruta: string): boolean {
  try {
    lstatSync(ruta);
    return true;
  } catch {
    return false;
  }
}

function prohibido(nombre: string): boolean {
  const lower = nombre.toLowerCase();
  return SEGMENTOS_PROHIBIDOS.has(lower) || lower === '.env' || lower.startsWith('.env.');
}

function mismoDirectorio(izquierda: string, derecha: string): boolean {
  if (process.platform === 'win32') return izquierda.toLowerCase() === derecha.toLowerCase();
  return izquierda === derecha;
}

function sale(raiz: string, candidato: string): boolean {
  const rel = relative(resolve(raiz), resolve(candidato));
  return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
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

function rutaDiagnostico(valor: string): string {
  const uniforme = valor.replace(/\\/g, '/').trim();
  if (
    uniforme.length === 0
    || uniforme.length > 200
    || /^[A-Za-z]:/.test(uniforme)
    || uniforme.startsWith('/')
    || uniforme.startsWith('\\\\')
  ) {
    return '(ruta rechazada)';
  }
  return uniforme;
}

function diag(
  ambito: AmbitoPreflight,
  rutaRelativa: string,
  comprobacion: ComprobacionPreflight,
  mensaje: string,
): DiagnosticoPreflight {
  return { ambito, rutaRelativa, comprobacion, mensaje };
}
