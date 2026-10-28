const MINIMO = 32;
const MENSAJE = 'JWT_SECRET no es válido. Defina un secreto aleatorio de al menos 32 caracteres.';


const PROHIBIDOS = new Set([
  'emergencia',
  'clinica_lopez_cambiar_este_secreto_largo',
  'definir_localmente',
]);

/** Rechaza ausente, vacío, el ejemplo publicado y el antiguo fallback. No incluye el valor en el error. */
export function exigirSecretoJwt(valor: unknown): string {
  if (typeof valor !== 'string' || valor.length < MINIMO || /\s/.test(valor)) {
    throw new Error(MENSAJE);
  }
  const normalizado = valor.toLowerCase();
  const marcador = normalizado.includes('definir_localmente')
    || normalizado.includes('cambiar_este')
    || normalizado.includes('reemplazar')
    || PROHIBIDOS.has(normalizado);
  if (marcador) throw new Error(MENSAJE);
  return valor;
}
