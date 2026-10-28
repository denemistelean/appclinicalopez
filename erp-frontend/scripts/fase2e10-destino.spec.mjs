import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  esHtml,
  esLoginDeApi,
  exigirApi,
  ejecutarCiclo,
  leerCredencialesTexto,
  registrarRespuesta,
  solicitarApi,
  validarSesionEmitida,
} from './fase2e10-destino.mjs';

test('la página de Angular no cuenta como login de la API', () => {
  assert.equal(esLoginDeApi('http://localhost:4202/auth/login', 200), false);
  assert.equal(esLoginDeApi('http://127.0.0.1:4202/auth/login', 200), false);
  assert.equal(esLoginDeApi('http://127.0.0.1:3789/api/auth/login', 200), true);
});

test('solo acepta la API en el puerto 3789', () => {
  assert.equal(exigirApi('http://127.0.0.1:3789/api/auth/refresh').ruta, '/api/auth/refresh');
  assert.throws(() => exigirApi('http://localhost:4202/auth/login'));
  assert.throws(() => exigirApi('http://127.0.0.1:80/api/auth/login'));
});

test('rechaza HTML y redirecciones fuera de la API', () => {
  assert.equal(esHtml('text/html', '<!doctype html>'), true);
  assert.throws(() => registrarRespuesta(
    'GET',
    'http://127.0.0.1:3789/api/unidades/mias',
    200,
    'text/html',
    '<html></html>',
    null,
  ));
  assert.throws(() => registrarRespuesta(
    'POST',
    'http://127.0.0.1:3789/api/auth/login',
    302,
    'application/json',
    '{}',
    'http://localhost:4202/auth/login',
  ));
  const registro = registrarRespuesta(
    'POST',
    'http://127.0.0.1:3789/api/auth/login',
    400,
    'application/json; charset=utf-8',
    JSON.stringify({ exito: false, estado: 400, mensaje: 'La contraseña es obligatoria' }),
    null,
  );
  assert.deepEqual(registro, {
    metodo: 'POST',
    ruta: '/api/auth/login',
    puerto: '3789',
    codigo: 400,
    json: ['exito', 'estado', 'mensaje'],
    mensaje: 'La contraseña es obligatoria',
  });
});

const SID = '11111111-1111-4111-8111-111111111111';
const PREVIA = 'dd628181-1738-4f88-a29d-ff895885085c';
const AHORA = Math.floor(Date.now() / 1000);

function jwt(payload) {
  return `aaa.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma-simulada`;
}

function sesionJson(extra = {}) {
  const sessionExp = extra.sessionExp ?? (AHORA + 3600);
  const sessionId = extra.sessionId ?? SID;
  const access = jwt({ sub: 7, token_use: 'access', sid: sessionId, session_exp: sessionExp, ...extra.access });
  const refresh = jwt({ sub: 7, token_use: 'refresh', sid: sessionId, session_exp: sessionExp, ...extra.refresh });
  return {
    success: true,
    message: 'Login exitoso',
    timestamp: '2026-10-21T20:00:00.000Z',
    data: {
      access_token: access,
      refresh_token: refresh,
      sessionId,
      primera_sesion: false,
      usuario: { id_usuario: 7 },
    },
  };
}

function configValida() {
  return {
    apiOrigen: 'http://localhost:3789',
    db: { DB_HOST: 'localhost', DB_PORT: '3306', DB_DATABASE: 'app_clinica_lopez', DB_USER: 'usuario', DB_PASSWORD: 'secreto-config-simulado' },
  };
}

function conteos() {
  return { usuarios: 1, membresias: 1, pacientes: 4, citas: 13, consultas: 4, documentos: 9, tratamientos: 23, auditoria: 71 };
}

test('valida el envoltorio y los campos de sesión', () => {
  const json = sesionJson();
  const sesion = validarSesionEmitida(json, null);
  assert.equal(sesion.sessionId, SID);
  assert.equal(sesion.idUsuario, 7);
  assert.equal(sesion.sessionExp, AHORA + 3600);
});

test('rechaza campos ausentes, uso incorrecto y expiración inválida', () => {
  const incompleta = sesionJson();
  delete incompleta.data.access_token;
  assert.throws(() => validarSesionEmitida(incompleta, null), /sesion_incompleta/);

  const uso = sesionJson({ access: { token_use: 'refresh', marca: 'distinta' } });
  assert.throws(() => validarSesionEmitida(uso, null), /token_use_invalido/);

  const vencida = sesionJson({ sessionExp: AHORA - 10 });
  assert.throws(() => validarSesionEmitida(vencida, null), /session_exp_invalida/);

  const distinta = sesionJson();
  const payload = JSON.parse(Buffer.from(distinta.data.refresh_token.split('.')[1], 'base64url').toString());
  payload.session_exp += 5;
  distinta.data.refresh_token = jwt(payload);
  assert.throws(() => validarSesionEmitida(distinta, null), /session_exp_distinta/);

  const base = validarSesionEmitida(sesionJson(), null);
  const alargada = sesionJson({ sessionExp: base.sessionExp + 60 });
  assert.throws(() => validarSesionEmitida(alargada, base), /expiracion_distinta/);
});

test('el modo autenticado rechaza HTML, redirecciones y destinos ajenos', async () => {
  await assert.rejects(() => solicitarApi('http://localhost:3789/api/auth/login', { method: 'POST' }, async () => ({
    status: 200,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => '<!doctype html>',
  })), /respuesta_html/);

  await assert.rejects(() => solicitarApi('http://localhost:3789/api/auth/login', { method: 'POST' }, async () => ({
    status: 302,
    headers: new Headers({ location: 'http://localhost:4202/auth/login', 'content-type': 'application/json' }),
    text: async () => '{}',
  })), /redireccion_api/);

  let llamadas = 0;
  await assert.rejects(() => solicitarApi('http://localhost:4202/auth/login', { method: 'GET' }, async () => {
    llamadas += 1;
    return { status: 200, headers: new Headers(), text: async () => '' };
  }), /destino_autenticado_invalido/);
  await assert.rejects(() => solicitarApi('http://127.0.0.1:3789/api/auth/login', { method: 'POST' }, async () => {
    llamadas += 1;
    return { status: 200, headers: new Headers(), text: async () => '' };
  }), /destino_autenticado_invalido/);
  assert.equal(llamadas, 0);
});

test('las credenciales de prueba no salen en el error de formato', () => {
  assert.throws(() => leerCredencialesTexto('una-sola-linea'), /credenciales_formato/);
  const cred = leerCredencialesTexto('persona\nclave-simulada\r\n');
  assert.equal(cred.identificador, 'persona');
  assert.equal(cred.password, 'clave-simulada');
});

test('una configuración inválida no llama al login y borra el archivo', async () => {
  let solicitudes = 0;
  let borradas = 0;
  const informe = await ejecutarCiclo({
    cargarConfig: async () => ({ apiOrigen: 'http://127.0.0.1:3789', db: configValida().db }),
    leerCredenciales: async () => ({ identificador: 'persona', password: 'clave-simulada' }),
    borrarCredenciales: async () => { borradas += 1; },
    solicitar: async () => { solicitudes += 1; return {}; },
    leerEstado: async () => { throw new Error('no_debe_consultar'); },
    leerSesion: async () => null,
  });
  assert.equal(solicitudes, 0);
  assert.equal(borradas, 1);
  assert.equal(informe.completo, false);
  assert.equal(informe.detuvoEn, 'configuracion');
  assert.equal(informe.error, 'config_api');
  assert.equal(JSON.stringify(informe).includes('clave-simulada'), false);
  assert.equal(JSON.stringify(informe).includes('secreto-config-simulado'), false);
});

test('el ciclo simulado hace una pasada y no repite el login', async () => {
  const llamadas = [];
  let hash = 'a'.repeat(64);
  let revocada = false;
  const sessionExp = AHORA + 7200;
  const solicitar = async (url, opciones) => {
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : null;
    llamadas.push({
      metodo: opciones.method,
      ruta: new URL(url).pathname,
      claves: cuerpo ? Object.keys(cuerpo).sort() : [],
      autorizada: Boolean(opciones.headers?.Authorization),
    });
    if (url.endsWith('/auth/login')) return { codigo: 200, json: sesionJson({ sessionExp }) };
    if (url.endsWith('/unidades/mias') && !revocada) {
      return { codigo: 200, json: { success: true, message: 'Operación exitosa', timestamp: '2026-10-21T20:00:00.000Z', data: [{ id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'L', nombre: 'López' }] } };
    }
    if (url.endsWith('/auth/refresh')) {
      hash = 'b'.repeat(64);
      const json = sesionJson({ sessionExp, refresh: { jti: 'otro' } });
      return { codigo: 200, json };
    }
    if (url.endsWith('/auth/logout')) {
      revocada = true;
      return { codigo: 200, json: { success: true, message: 'Sesión cerrada', timestamp: '2026-10-21T20:00:00.000Z', data: {} } };
    }
    return { codigo: 401, json: { exito: false, estado: 401, mensaje: 'Token inválido', ruta: '/api/unidades/mias', fecha: '2026-10-21T20:00:00.000Z' } };
  };
  const informe = await ejecutarCiclo({
    cargarConfig: async () => configValida(),
    leerCredenciales: async () => ({ identificador: 'persona', password: 'clave-simulada' }),
    borrarCredenciales: async () => undefined,
    solicitar,
    leerEstado: async () => ({
      conteos: conteos(),
      sesiones: revocada
        ? [{ idSesion: PREVIA, idUsuario: 1, revocada: true, motivo: 'LOGOUT' }, { idSesion: SID, idUsuario: 7, revocada: true, motivo: 'LOGOUT' }]
        : [{ idSesion: PREVIA, idUsuario: 1, revocada: true, motivo: 'LOGOUT' }],
    }),
    leerSesion: async () => ({ idSesion: SID, idUsuario: 7, hash, venceUnix: sessionExp, revocada, motivo: revocada ? 'LOGOUT' : null }),
  });
  assert.equal(informe.completo, true);
  assert.deepEqual(informe.pasos.map((item) => `${item.metodo} ${item.ruta} ${item.codigo} ${item.veredicto}`), [
    'POST /api/auth/login 200 ok',
    'GET /api/unidades/mias 200 ok',
    'POST /api/auth/refresh 200 rotacion_ok',
    'DELETE /api/auth/logout 200 ok',
    'GET /api/unidades/mias 401 revocacion_inmediata',
  ]);
  assert.deepEqual(llamadas.map((item) => item.metodo), ['POST', 'GET', 'POST', 'DELETE', 'GET']);
  assert.equal(llamadas.filter((item) => item.ruta === '/api/auth/login').length, 1);
  assert.equal(informe.sesion.refreshRotado, true);
  assert.equal(informe.sesion.expiracionConservada, true);
  assert.equal(informe.sesion.motivo, 'LOGOUT');
  const texto = JSON.stringify(informe);
  assert.equal(texto.includes('firma-simulada'), false);
  assert.equal(texto.includes('clave-simulada'), false);
  assert.equal(texto.includes('secreto-config-simulado'), false);
  assert.equal(texto.includes('a'.repeat(64)), false);
});

test('si el refresh falla, cierra una vez y no reintenta el login', async () => {
  const metodos = [];
  const informe = await ejecutarCiclo({
    cargarConfig: async () => configValida(),
    leerCredenciales: async () => ({ identificador: 'persona', password: 'clave-simulada' }),
    borrarCredenciales: async () => undefined,
    solicitar: async (url) => {
      metodos.push(new URL(url).pathname);
      if (url.endsWith('/auth/login')) return { codigo: 200, json: sesionJson() };
      if (url.endsWith('/unidades/mias')) {
        return { codigo: 200, json: { success: true, message: 'Operación exitosa', timestamp: '2026-10-21T20:00:00.000Z', data: [{ id_unidad: 1, id_rol: 1, opera_finanzas: 0, codigo: 'L', nombre: 'López' }] } };
      }
      if (url.endsWith('/auth/refresh')) return { codigo: 401, json: { exito: false, estado: 401, mensaje: 'Refresh token inválido o expirado', ruta: '/api/auth/refresh', fecha: '2026-10-21T20:00:00.000Z' } };
      return { codigo: 200, json: { success: true, message: 'Sesión cerrada', timestamp: '2026-10-21T20:00:00.000Z', data: {} } };
    },
    leerEstado: async () => ({ conteos: conteos(), sesiones: [] }),
    leerSesion: async () => ({ idSesion: SID, idUsuario: 7, hash: 'c'.repeat(64), venceUnix: AHORA + 3600, revocada: metodos.includes('/api/auth/logout'), motivo: metodos.includes('/api/auth/logout') ? 'LOGOUT' : null }),
  });
  assert.equal(informe.completo, false);
  assert.equal(informe.detuvoEn, 'refresh');
  assert.equal(informe.error, 'refresh_http');
  assert.equal(informe.revocacionNoConfirmada, false);
  assert.deepEqual(metodos, ['/api/auth/login', '/api/unidades/mias', '/api/auth/refresh', '/api/auth/logout']);
});

test('el ejecutor autenticado solo arranca con su argumento', async () => {
  const fuente = fs.readFileSync(new URL('./fase2e10-destino.mjs', import.meta.url), 'utf8');
  assert.equal(fuente.includes('fase_2e10a_no_ejecuta_login'), false);
  const proceso = spawn(process.execPath, ['scripts/fase2e10-destino.mjs'], { cwd: fileURLToPath(new URL('..', import.meta.url)) });
  let salida = '';
  proceso.stdout.on('data', (chunk) => { salida += chunk; });
  proceso.stderr.on('data', (chunk) => { salida += chunk; });
  const codigo = await new Promise((resolve) => proceso.on('close', resolve));
  assert.equal(codigo, 2);
  assert.match(salida, /--autenticado/);
  assert.equal(salida.includes('eyJ'), false);
});
