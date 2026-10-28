/**
 * Ciclo corto de sesiones contra app_clinica_lopez_sesion_test.
 * No inicia sesión con el administrador clínico ni escribe en app_clinica_lopez.
 * Uso: node scripts/fase2e6b-ciclo.mjs
 */
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';

const DB = 'app_clinica_lopez_sesion_test';
const NEGOCIO = 'app_clinica_lopez';
const HOST = 'localhost';
const PORT_DB = 3306;
const PORT_API = 3791;
const API = `http://127.0.0.1:${PORT_API}/api`;
const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORREO = 'ana.prueba@sesion.test';
const CLAVE = 'ClaveTest-Ana1';

function leerEnv() {
  const raw = readFileSync(path.join(BACKEND, '.env'), 'utf8');
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

async function exigir(conn, etiqueta) {
  const [[row]] = await conn.query('SELECT DATABASE() AS db');
  if (row.db !== DB) throw new Error(`${etiqueta}: base ${row.db || '(ninguna)'} en lugar de ${DB}`);
  return row.db;
}

function payload(token) {
  const parte = String(token || '').split('.')[1];
  if (!parte) return null;
  return JSON.parse(Buffer.from(parte, 'base64url').toString('utf8'));
}

async function http(method, ruta, { token, body, headers } = {}) {
  const res = await fetch(`${API}${ruta}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { crudo: text.slice(0, 180) }; }
  return { status: res.status, json };
}

async function negocio(password) {
  const conn = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password, database: NEGOCIO });
  try {
    const [[db]] = await conn.query('SELECT DATABASE() AS db');
    if (db.db !== NEGOCIO) throw new Error(`lectura clínica en ${db.db}`);
    const [[ses]] = await conn.query('SELECT COUNT(*) AS n FROM cli_sesion');
    const [[u]] = await conn.query(
      `SELECT COUNT(*) AS n, SHA2(GROUP_CONCAT(CONCAT_WS('|', id_usuario, id_rol, estado_registro) ORDER BY id_usuario), 256) AS h FROM sis_usuario`,
    );
    const [[m]] = await conn.query(
      `SELECT COUNT(*) AS n, SHA2(GROUP_CONCAT(CONCAT_WS('|', id_usuario_unidad, id_usuario, id_unidad, id_rol, estado_registro) ORDER BY id_usuario_unidad), 256) AS h FROM cli_usuario_unidad`,
    );
    const [[c]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM cli_paciente) AS pacientes, (SELECT COUNT(*) FROM cli_cita) AS citas,
              (SELECT COUNT(*) FROM cli_consulta) AS consultas, (SELECT COUNT(*) FROM cli_documento) AS documentos`,
    );
    const [[t]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ?`,
      [NEGOCIO],
    );
    return {
      db: db.db,
      cli_sesion: Number(ses.n),
      usuarios: Number(u.n),
      usuarios_sha: u.h,
      membresias: Number(m.n),
      membresias_sha: m.h,
      pacientes: Number(c.pacientes),
      citas: Number(c.citas),
      consultas: Number(c.consultas),
      documentos: Number(c.documentos),
      tablas: Number(t.n),
    };
  } finally {
    await conn.end();
  }
}

function arrancar(envExtra) {
  const childEnv = { ...process.env, ...envExtra };
  delete childEnv.MYSQL_PWD;
  const child = spawn(process.execPath, [path.join(BACKEND, 'dist', 'apps', 'api', 'main.js')], {
    cwd: BACKEND,
    env: childEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (b) => { log += b.toString(); });
  child.stderr.on('data', (b) => { log += b.toString(); });
  return { child, leer: () => log };
}

async function esperar(child, leer) {
  const inicio = Date.now();
  while (Date.now() - inicio < 90000) {
    if (child.exitCode != null) throw new Error(`La API de prueba terminó.\n${leer().slice(-1200)}`);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ correo: 'nadie@sesion.test', password: 'x' }),
      });
      if (res.status === 401 || res.status === 200) return;
    } catch { /* arrancando */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`La API de prueba no respondió.\n${leer().slice(-1200)}`);
}

async function cerrar(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 5000);
    child.once('exit', () => { clearTimeout(t); resolve(); });
  });
}

async function main() {
  const env = leerEnv();
  const rootPass = env.DB_PASSWORD;
  if (!rootPass) throw new Error('DB_PASSWORD ausente');
  if (env.DB_DATABASE !== NEGOCIO) throw new Error(`El .env de negocio no apunta a ${NEGOCIO}`);

  const antes = await negocio(rootPass);
  console.log(`ANTES ${JSON.stringify(antes)}`);

  const admin = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: rootPass, database: DB });
  const db = await exigir(admin, 'antes de arrancar');
  const [[ana]] = await admin.query(
    `SELECT id_usuario, estado_registro FROM sis_usuario WHERE correo = ?`,
    [CORREO],
  );
  if (!ana || Number(ana.id_usuario) === 1) throw new Error('La cuenta sintética no está disponible');
  console.log(`DATABASE=${db} USUARIO_SINTETICO=${ana.id_usuario} ESTADO=${ana.estado_registro}`);

  const dbPass = randomBytes(18).toString('base64url');
  const jwtSecret = randomBytes(24).toString('base64url');
  await admin.query(`ALTER USER 'cli_sesion_test'@'localhost' IDENTIFIED BY ?`, [dbPass]);
  await admin.query(`ALTER USER 'cli_sesion_test'@'127.0.0.1' IDENTIFIED BY ?`, [dbPass]);
  await admin.query('FLUSH PRIVILEGES');
  await admin.end();

  const limitado = await createConnection({
    host: HOST, port: PORT_DB, user: 'cli_sesion_test', password: dbPass, database: DB,
  });
  await exigir(limitado, 'usuario de prueba');
  let bloqueado = false;
  try {
    await limitado.query('SELECT COUNT(*) AS n FROM `' + NEGOCIO + '`.cli_sesion');
  } catch (error) {
    bloqueado = /denied|1142|1044/i.test(String(error.message));
  }
  console.log(`USUARIO_PRUEBA_BLOQUEA_CLINICA=${bloqueado}`);

  const comun = {
    DB_HOST: HOST,
    DB_PORT: String(PORT_DB),
    DB_USER: 'cli_sesion_test',
    DB_PASSWORD: dbPass,
    DB_DATABASE: DB,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    PORT: String(PORT_API),
    API_PREFIX: 'api',
  };
  if (comun.DB_DATABASE !== DB || Number(comun.PORT) === 3789) throw new Error('El proceso de prueba no puede usar la API de negocio');
  console.log(`PROCESO_DB=${comun.DB_DATABASE} PORT=${comun.PORT} JWT_EXPIRES_IN=${comun.JWT_EXPIRES_IN} JWT_REFRESH_EXPIRES_IN=${comun.JWT_REFRESH_EXPIRES_IN}`);

  let api = arrancar(comun);
  const resultados = [];
  const anotar = (nombre, ok, detalle) => {
    resultados.push({ nombre, ok });
    console.log(`${ok ? 'OK' : 'FALLO'} ${nombre} ${detalle || ''}`);
  };
  try {
    await esperar(api.child, api.leer);
    await exigir(limitado, 'API en marcha');
    const login = () => http('POST', '/auth/login', { body: { correo: CORREO, password: CLAVE } });
    const s1 = await login();
    const s2 = await login();
    const d1 = s1.json?.data;
    const p1 = payload(d1?.access_token);
    const pr = payload(d1?.refresh_token);
    await limitado.query("SET time_zone = '-05:00'");
    const [[row]] = await limitado.query(
      `SELECT id_usuario, CHAR_LENGTH(hash_refresh) AS hash_len,
              hash_refresh = ? AS texto_plano,
              hash_refresh = ? AS sha_ok,
              vence_en = FROM_UNIXTIME(?) AS vence_ok
       FROM cli_sesion WHERE id_sesion = ?`,
      [d1?.refresh_token || '', createHash('sha256').update(d1?.refresh_token || '').digest('hex'), p1?.session_exp, d1?.sessionId],
    );
    const sieteDias = Number(pr?.session_exp) - Math.floor(Date.now() / 1000);
    anotar('login y hash', s1.status === 200 && s2.status === 200 && row && Number(row.texto_plano) === 0 && Number(row.sha_ok) === 1 && Number(row.hash_len) === 64 && Number(row.vence_ok) === 1 && p1?.token_use === 'access' && pr?.token_use === 'refresh' && String(d1.sessionId) !== String(ana.id_usuario) && Number(p1.exp) - Number(p1.iat) === 900 && sieteDias > 6 * 86400 && sieteDias <= 7 * 86400,
      `status=${s1.status}/${s2.status} sha=${row?.sha_ok} plano=${row?.texto_plano} vence=${row?.vence_ok} access_s=${Number(p1?.exp) - Number(p1?.iat)} refresh_restante_s=${sieteDias}`);

    const renovado = await http('POST', '/auth/refresh', { body: { refreshToken: d1.refresh_token, sessionId: d1.sessionId } });
    const p2 = payload(renovado.json?.data?.refresh_token);
    const [[row2]] = await limitado.query(
      `SELECT hash_refresh = ? AS sha_ok, vence_en = FROM_UNIXTIME(?) AS vence_ok, fecha_revocacion
       FROM cli_sesion WHERE id_sesion = ?`,
      [createHash('sha256').update(renovado.json?.data?.refresh_token || '').digest('hex'), p1.session_exp, d1.sessionId],
    );
    anotar('refresh conserva el vencimiento', renovado.status === 200 && Number(row2.sha_ok) === 1 && Number(row2.vence_ok) === 1 && p2?.session_exp === p1.session_exp && row2.fecha_revocacion == null,
      `status=${renovado.status} mismo_session_exp=${p2?.session_exp === p1?.session_exp} vence=${row2?.vence_ok}`);

    const reuso = await http('POST', '/auth/refresh', { body: { refreshToken: d1.refresh_token, sessionId: d1.sessionId } });
    const [[revocada]] = await limitado.query(
      `SELECT motivo_revocacion FROM cli_sesion WHERE id_sesion = ?`,
      [d1.sessionId],
    );
    const s2sigue = await http('POST', '/auth/refresh', {
      body: { refreshToken: s2.json.data.refresh_token, sessionId: s2.json.data.sessionId },
    });
    anotar('reutilizar el refresh anterior', reuso.status === 401 && revocada.motivo_revocacion === 'REUTILIZACION' && s2sigue.status === 200,
      `reuso=${reuso.status} motivo=${revocada.motivo_revocacion} otra=${s2sigue.status}`);

    const s3 = await login();
    const logout = await http('DELETE', '/auth/logout', { token: s2.json.data.access_token });
    const refreshLogout = await http('POST', '/auth/refresh', {
      body: { refreshToken: s2sigue.json.data.refresh_token, sessionId: s2.json.data.sessionId },
    });
    const [[motivoLogout]] = await limitado.query(
      `SELECT motivo_revocacion FROM cli_sesion WHERE id_sesion = ?`,
      [s2.json.data.sessionId],
    );
    const s3sigue = await http('POST', '/auth/refresh', {
      body: { refreshToken: s3.json.data.refresh_token, sessionId: s3.json.data.sessionId },
    });
    anotar('logout no cierra la otra sesion', logout.status === 200 && refreshLogout.status === 401 && motivoLogout.motivo_revocacion === 'LOGOUT' && s3sigue.status === 200,
      `logout=${logout.status} refresh=${refreshLogout.status} motivo=${motivoLogout.motivo_revocacion} independiente=${s3sigue.status}`);

    const acceso = await http('GET', '/usuarios', {
      token: s2.json.data.access_token,
      headers: { 'x-unidad-id': '1' },
    });
    anotar('access vigente tras logout', acceso.status === 200, `status=${acceso.status}`);

    await cerrar(api.child);
    api = arrancar({ ...comun, JWT_EXPIRES_IN: '8s' });
    await esperar(api.child, api.leer);
    console.log('PROCESO_CORTO_DB=app_clinica_lopez_sesion_test PORT=3791 JWT_EXPIRES_IN=8s');
    const corto = await login();
    const pc = payload(corto.json?.data?.access_token);
    await http('DELETE', '/auth/logout', { token: corto.json.data.access_token });
    const sigue = await http('GET', '/usuarios', { token: corto.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    await new Promise((r) => setTimeout(r, Math.max(0, pc.exp * 1000 - Date.now() + 1500)));
    const caduco = await http('GET', '/usuarios', { token: corto.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    anotar('access muere al vencer', sigue.status === 200 && caduco.status === 401 && Number(pc.exp) - Number(pc.iat) === 8,
      `tras_logout=${sigue.status} tras_exp=${caduco.status} segundos=${Number(pc.exp) - Number(pc.iat)}`);

    const [abiertas] = await limitado.query(
      `SELECT id_usuario, motivo_revocacion, COUNT(*) AS n
       FROM cli_sesion WHERE id_usuario = ? GROUP BY id_usuario, motivo_revocacion`,
      [ana.id_usuario],
    );
    console.log(`SESIONES_SINTETICAS ${JSON.stringify(abiertas)}`);
  } finally {
    await cerrar(api.child);
    await limitado.end();
  }

  const despues = await negocio(rootPass);
  console.log(`DESPUES ${JSON.stringify(despues)}`);
  console.log(`CLINICA_SIN_CAMBIOS=${JSON.stringify(antes) === JSON.stringify(despues)}`);
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`RESUMEN ok=${resultados.length - fallos.length} fallo=${fallos.length}`);
  if (fallos.length || JSON.stringify(antes) !== JSON.stringify(despues)) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
