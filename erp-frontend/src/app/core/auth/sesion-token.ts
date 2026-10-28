export interface SesionEmitida {
  access: string;
  csrf: string;
  sessionId: string;
  usuario: Record<string, unknown> | null;
  sessionExp: number;
}

export function decodificarPayload(token: string): Record<string, unknown> | null {
  try {
    const parte = String(token || '').split('.')[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const data = JSON.parse(atob(padded));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

function numero(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export function segundosHasta(token: string | null, campo: 'exp' | 'session_exp'): number | null {
  if (!token) return null;
  const exp = numero(decodificarPayload(token)?.[campo]);
  if (exp == null) return null;
  return exp - Math.floor(Date.now() / 1000);
}

export function mensajeHttp(error: { error?: unknown; message?: string } | null | undefined): string {
  const body = error?.error as { mensaje?: unknown; message?: unknown } | string | undefined;
  if (typeof body === 'string') return body;
  const msg = body?.mensaje ?? body?.message ?? error?.message ?? '';
  return Array.isArray(msg) ? msg.join(' ') : String(msg ?? '');
}

export function textoPublico(error: { error?: unknown; message?: string; status?: number } | null | undefined): string {
  if (error?.status === 0 || error?.status === 503) {
    return 'No se pudo contactar con el servicio de acceso. Inténtalo de nuevo.';
  }
  const msg = mensajeHttp(error);
  if (!msg || msg.includes('eyJ') || msg.length > 180) return 'No se pudo iniciar sesión.';
  return msg;
}

/** El backend usa el mismo texto para sesión revocada, inexistente o vencida en base. */
export function esSesionInvalida(mensaje: string): boolean {
  const m = mensaje.toLowerCase();
  return m.includes('token inválido') || m.includes('token invalido');
}

export function extraerSesion(respuesta: unknown, sessionExpAnterior: number | null): SesionEmitida | null {
  const raiz = respuesta as { data?: unknown } | null;
  const nivel1 = raiz?.data as { access_token?: unknown; data?: unknown } | undefined;
  const cuerpo = (nivel1?.access_token ? nivel1 : nivel1?.data) as {
    access_token?: unknown;
    refresh_token?: unknown;
    csrf_token?: unknown;
    sessionId?: unknown;
    usuario?: unknown;
  } | undefined;
  if (!cuerpo) return null;
  if (typeof cuerpo.refresh_token === 'string' && cuerpo.refresh_token) return null;
  const access = cuerpo.access_token;
  const csrf = cuerpo.csrf_token;
  const sessionId = cuerpo.sessionId;
  if (typeof access !== 'string' || typeof csrf !== 'string' || typeof sessionId !== 'string') return null;
  if (!access || !csrf || !sessionId) return null;
  const pa = decodificarPayload(access);
  if (!pa || pa['token_use'] !== 'access') return null;
  if (pa['sid'] !== sessionId) return null;
  const sessionExp = numero(pa['session_exp']);
  if (sessionExp == null || sessionExp <= Math.floor(Date.now() / 1000)) return null;
  if (sessionExpAnterior != null && sessionExp > sessionExpAnterior) return null;
  const usuario = cuerpo.usuario && typeof cuerpo.usuario === 'object'
    ? { ...(cuerpo.usuario as Record<string, unknown>) }
    : null;
  if (usuario) {
    delete usuario['access_token'];
    delete usuario['refresh_token'];
    delete usuario['password'];
  }
  return { access, csrf, sessionId, usuario, sessionExp };
}
