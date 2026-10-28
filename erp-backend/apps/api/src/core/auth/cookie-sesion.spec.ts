import { readFileSync } from 'fs';
import { join } from 'path';
import { afirmarCookiesDeProduccion, cookieSameSite, cookieSecure, origenCors, origenesPermitidos } from './cookie-sesion';

describe('Fase 2E-15 — cookies y CORS', () => {
  const previo = {
    NODE_ENV: process.env.NODE_ENV,
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    COOKIE_SAMESITE: process.env.COOKIE_SAMESITE,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
  };

  afterEach(() => {
    const restaurar = (clave: 'NODE_ENV' | 'COOKIE_SECURE' | 'COOKIE_SAMESITE' | 'CORS_ORIGINS') => {
      const valor = previo[clave];
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    };
    restaurar('NODE_ENV');
    restaurar('COOKIE_SECURE');
    restaurar('COOKIE_SAMESITE');
    restaurar('CORS_ORIGINS');
  });

  it('en producción no admite desactivar Secure ni un origen comodín con credenciales', () => {
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECURE = 'false';
    expect(() => afirmarCookiesDeProduccion()).toThrow(/COOKIE_SECURE/);
    delete process.env.COOKIE_SECURE;
    expect(cookieSecure()).toBe(true);

    process.env.NODE_ENV = 'test';
    delete process.env.COOKIE_SECURE;
    process.env.COOKIE_SAMESITE = 'none';
    expect(cookieSameSite()).toBe('lax');
    expect(cookieSecure()).toBe(false);

    process.env.CORS_ORIGINS = '*';
    expect(origenesPermitidos()).toEqual([]);
    expect(origenCors('http://localhost:4202')).toBe(false);
    expect(origenCors(undefined)).toBe(false);

    process.env.CORS_ORIGINS = 'http://localhost:4202';
    expect(origenCors('http://localhost:4202')).toBe('http://localhost:4202');
    expect(origenCors('https://evil.example')).toBe(false);

    delete process.env.NODE_ENV;
    delete process.env.COOKIE_SECURE;
    expect(cookieSecure()).toBe(false);
    process.env.NODE_ENV = 'production';
    process.env.COOKIE_SECURE = '';
    expect(cookieSecure()).toBe(true);
    process.env.COOKIE_SECURE = 'FALSE';
    expect(() => afirmarCookiesDeProduccion()).toThrow(/true o false/);
    process.env.COOKIE_SECURE = 'true';
    process.env.COOKIE_SAMESITE = 'lax';
    expect(() => afirmarCookiesDeProduccion()).not.toThrow();
    expect(cookieSameSite()).toBe('lax');
    process.env.COOKIE_SAMESITE = 'cualquiera';
    expect(() => afirmarCookiesDeProduccion()).toThrow(/COOKIE_SAMESITE/);

    const main = readFileSync(join(__dirname, '../../main.ts'), 'utf8');
    expect(main).not.toMatch(/origin:\s*true/);
    expect(main).toMatch(/credentials:\s*true/);
  });
});
