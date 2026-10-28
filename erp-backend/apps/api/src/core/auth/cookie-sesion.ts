import { timingSafeEqual } from 'crypto';
import { ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';

export const COOKIE_REFRESH = 'cli_refresh';
export const COOKIE_CSRF = 'cli_csrf';
export const HEADER_CSRF = 'x-csrf-token';

const MENSAJE = 'Solicitud no autorizada';

function valorOpcional(nombre: string): string | undefined {
  const crudo = process.env[nombre];
  if (crudo == null) return undefined;
  const limpio = crudo.trim();
  return limpio === '' ? undefined : limpio;
}

/** Un NODE_ENV vacío o distinto de production no activa el modo de producción. */
export function esProduccion(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function cookieSecure(): boolean {
  const explicito = valorOpcional('COOKIE_SECURE');
  if (explicito === undefined) return esProduccion();
  if (explicito === 'true') return true;
  if (explicito === 'false') return false;
  throw new Error('COOKIE_SECURE solo admite true o false.');
}

export function afirmarCookiesDeProduccion(): void {
  const explicito = valorOpcional('COOKIE_SECURE');
  if (explicito !== undefined && explicito !== 'true' && explicito !== 'false') {
    throw new Error('COOKIE_SECURE solo admite true o false.');
  }
  if (esProduccion() && explicito === 'false') {
    throw new Error('COOKIE_SECURE no puede desactivarse en producción.');
  }
  cookieSameSite();
}

export function cookieSameSite(): 'lax' | 'strict' | 'none' {
  const valor = (valorOpcional('COOKIE_SAMESITE') || 'lax').toLowerCase();
  if (valor !== 'lax' && valor !== 'strict' && valor !== 'none') {
    throw new Error('COOKIE_SAMESITE solo admite lax, strict o none.');
  }
  if (valor === 'none' && !cookieSecure()) return 'lax';
  return valor;
}

export function origenCors(origin: string | undefined): string | false {
  if (!origin) return false;
  return origenesPermitidos().includes(origin) ? origin : false;
}

export function origenesPermitidos(): string[] {
  const crudo = process.env.CORS_ORIGINS || 'http://localhost:4202,http://127.0.0.1:4202';
  return crudo.split(',').map((origen) => origen.trim()).filter((origen) => origen && origen !== '*');
}

export function prefijoApi(): string {
  return (process.env.API_PREFIX || 'api').replace(/^\/+|\/+$/g, '');
}

export function rutaRefresh(): string {
  return `/${prefijoApi()}/auth/refresh`;
}

export function leerCookie(cabecera: string | undefined, nombre: string): string | null {
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const eq = parte.indexOf('=');
    if (eq < 0) continue;
    if (parte.slice(0, eq).trim() !== nombre) continue;
    try {
      return decodeURIComponent(parte.slice(eq + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function mismoValor(izq: string, der: string): boolean {
  const a = Buffer.from(izq);
  const b = Buffer.from(der);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export function exigirOrigen(origen: unknown): void {
  if (typeof origen !== 'string' || !origenesPermitidos().includes(origen)) {
    throw new ForbiddenException(MENSAJE);
  }
}

export function exigirCsrf(cabeceraCookie: string | undefined, encabezado: unknown): void {
  const cookie = leerCookie(cabeceraCookie, COOKIE_CSRF);
  const header = Array.isArray(encabezado) ? encabezado[0] : encabezado;
  if (typeof header !== 'string' || !cookie || !mismoValor(cookie, header)) {
    throw new ForbiddenException(MENSAJE);
  }
}

function opciones(path: string, maxAgeMs: number, httpOnly: boolean) {
  return {
    httpOnly,
    secure: cookieSecure(),
    sameSite: cookieSameSite(),
    path,
    maxAge: maxAgeMs,
  };
}

export function publicarCookies(res: Response, refresh: string, csrf: string, sessionExp: number): void {
  const restante = sessionExp - Math.floor(Date.now() / 1000);
  const maxAge = Math.max(0, restante) * 1000;
  res.cookie(COOKIE_REFRESH, refresh, opciones(rutaRefresh(), maxAge, true));
  res.cookie(COOKIE_CSRF, csrf, opciones('/', maxAge, false));
}

export function borrarCookies(res: Response): void {
  const base = { secure: cookieSecure(), sameSite: cookieSameSite() };
  res.clearCookie(COOKIE_REFRESH, { ...base, httpOnly: true, path: rutaRefresh() });
  res.clearCookie(COOKIE_CSRF, { ...base, httpOnly: false, path: '/' });
}
