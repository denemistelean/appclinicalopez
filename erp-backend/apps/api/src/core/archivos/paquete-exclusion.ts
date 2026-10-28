const SEGMENTOS_EXCLUIDOS = new Set([
  'node_modules',
  'dist',
  'logs',
  'certs',
  'coverage',
  'backups',
  'storage',
  'uploads',
  'pacientes',
  'clientes',
  'fase2e8',
  'tmp',
  'temp',
  '.tmp',
  '.temp',
  '.angular',
]);

/** Aparecen en cualquier tramo del nombre, no solo al final: clave.pem.txt, dump.sql.gz. */
const EXTENSIONES_EXCLUIDAS = new Set([
  'sql',
  'dump',
  'bak',
  'backup',
  'tmp',
  'temp',
  'log',
  'swp',
  'pem',
  'key',
  'pfx',
  'p12',
  'crt',
  'cer',
]);

/**
 * Rutas relativas a la futura raíz Node. No es un recorrido del repositorio:
 * la selección futura tiene que aceptar solo estas cadenas, ya normalizadas.
 * main.js es la copia de dist/apps/api/main.js colocada junto a app.js.
 */
export const MANIFIESTO_BACKEND = [
  'app.js',
  'main.js',
  'package.json',
  'package-lock.json',
  'assets/branding/logo-clinica-lopez.png',
] as const;

function partes(ruta: string): string[] {
  return ruta.replace(/\\/g, '/').split('/').filter((parte) => parte && parte !== '.');
}

/**
 * True si la ruta no debe entrar en un paquete. No abre el archivo.
 * Un directorio pacientes o clientes se excluye en cualquier mayúscula: eso
 * también alcanza al código fuente que vive en una carpeta con ese nombre.
 * La única plantilla de entorno permitida por nombre es exactamente .env.example.
 */
export function excluirDelPaquete(ruta: string): boolean {
  const piezas = partes(ruta);
  if (piezas.length === 0) return true;
  if (piezas.some((parte) => SEGMENTOS_EXCLUIDOS.has(parte.toLowerCase()))) return true;

  const base = piezas[piezas.length - 1];
  if (base === '.env.example') return false;

  const lower = base.toLowerCase();
  if (lower.includes('.env') || lower === '.envrc') return true;

  const tramos = lower.split('.').filter(Boolean);
  if (tramos.some((tramo) => EXTENSIONES_EXCLUIDAS.has(tramo))) return true;
  if (lower.endsWith('.spec.ts') || lower.endsWith('.spec.js') || lower.endsWith('.test.ts') || lower.endsWith('.test.js')) {
    return true;
  }
  return false;
}

/**
 * Única normalización: `\` pasa a `/`.
 * No se quitan `.` ni `..`, no se resuelve la ruta y no se recortan espacios.
 * Una absoluta, con otro nombre o con mayúsculas distintas no entra en la lista.
 */
export function esRutaDeManifiestoBackend(ruta: string): boolean {
  if (ruta.length === 0 || ruta !== ruta.trim()) return false;
  if (/^[A-Za-z]:[\\/]/.test(ruta) || ruta.startsWith('/') || ruta.startsWith('\\')) return false;
  const uniforme = ruta.replace(/\\/g, '/');
  const segmentos = uniforme.split('/');
  if (segmentos.some((parte) => parte === '' || parte === '.' || parte === '..')) return false;
  return (MANIFIESTO_BACKEND as readonly string[]).includes(uniforme);
}
