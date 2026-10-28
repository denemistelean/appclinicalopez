import express from 'express';
import helmet from 'helmet';
import request from 'supertest';
import { opcionesHelmet } from './helmet-politica';

function appCon(nodeEnv: string | undefined) {
  const app = express();
  app.use(helmet(opcionesHelmet(nodeEnv)));
  app.get('/salud', (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('HSTS por entorno', () => {
  it('el HTTP local no envía HSTS y conserva los otros encabezados de Helmet', async () => {
    for (const entorno of [undefined, '', 'development', 'test']) {
      const res = await request(appCon(entorno)).get('/salud');
      expect(res.headers['strict-transport-security']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    }
  });

  it('producción envía HSTS de un año sin subdominios ni preload', async () => {
    const res = await request(appCon('production')).get('/salud');
    expect(res.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
