/**
 * Revocación inmediata del access contra app_clinica_lopez_sesion_test.
 * No usa la cuenta clínica ni el puerto 3789.
 * Uso: node scripts/fase2e7-revocacion.mjs
 */
import { randomBytes, randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const DB = 'app_clinica_lopez_sesion_test';
const NEGOCIO = 'app_clinica_lopez';
const HOST = 'localhost';
const PORT_DB = 3306;
const PORT_API = 3791;
const API = `http://127.0.0.1:${PORT_API}/api`;
const BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

async function exigir(conn) {
  const [[row]] = await conn.query('SELECT DATABASE() AS db');
  if (row.db !== DB) throw new Error(`base ${row.db || '(ninguna)'} en lugar de ${DB}`);
  return row.db;
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
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

async function negocio(password) {
  const conn = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password, database: NEGOCIO });
  try {
    const [[db]] = await conn.query('SELECT DATABASE() AS db');
    const [[ses]] = await conn.query('SELECT COUNT(*) AS n FROM cli_sesion');
    const [[c]] = await conn.query(
      `SELECT (SELECT COUNT(*) FROM sis_usuario) AS usuarios,
              (SELECT COUNT(*) FROM cli_usuario_unidad) AS membresias,
              (SELECT COUNT(*) FROM cli_paciente) AS pacientes,
              (SELECT COUNT(*) FROM cli_cita) AS citas,
              (SELECT COUNT(*) FROM cli_consulta) AS consultas,
              (SELECT COUNT(*) FROM cli_documento) AS documentos`,
    );
    return { db: db.db, cli_sesion: Number(ses.n), ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)])) };
  } finally {
    await conn.end();
  }
}

function arrancar(envExtra) {
  const childEnv = { ...process.env, ...envExtra };
  delete childEnv.MYSQL_PWD;
  const child = spawn(process.execPath, [path.join(BACKEND, 'dist', 'apps', 'api', 'main.js')], {
    cwd: BACKEND, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (b) => { log += b.toString(); });
  child.stderr.on('data', (b) => { log += b.toString(); });
  return { child, leer: () => log };
}

async function esperar(child, leer) {
  const inicio = Date.now();
  while (Date.now() - inicio < 90000) {
    if (child.exitCode != null) throw new Error(`API de prueba terminó\n${leer().slice(-800)}`);
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
  throw new Error('API de prueba no respondió');
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
  const antes = await negocio(env.DB_PASSWORD);
  console.log(`ANTES ${JSON.stringify(antes)}`);
  const admin = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: env.DB_PASSWORD, database: DB });
  console.log(`DATABASE=${await exigir(admin)}`);
  if (process.env.SOLO_FALLO !== '1') {
  await admin.query(
    `UPDATE cli_usuario_unidad SET estado_registro = 'ACTIVO'
     WHERE id_usuario = 10 AND id_unidad = 2 AND DATABASE() = ?`,
    [DB],
  );
  }
  const dbPass = randomBytes(18).toString('base64url');
  const jwtSecret = randomBytes(24).toString('base64url');
  await admin.query(`ALTER USER 'cli_sesion_test'@'localhost' IDENTIFIED BY ?`, [dbPass]);
  await admin.query(`ALTER USER 'cli_sesion_test'@'127.0.0.1' IDENTIFIED BY ?`, [dbPass]);
  await admin.query('FLUSH PRIVILEGES');
  await admin.end();

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
  if (comun.DB_DATABASE !== DB || comun.PORT === '3789') throw new Error('proceso apuntando a la API de negocio');
  console.log(`PROCESO_DB=${comun.DB_DATABASE} PORT=${comun.PORT}`);

  const login = (correo, password) => http('POST', '/auth/login', { body: { correo, password } });
  const ruta = (token, unidad) => http('GET', '/usuarios', { token, headers: unidad ? { 'x-unidad-id': String(unidad) } : {} });
  const resultados = [];
  const anotar = (nombre, ok, detalle) => {
    resultados.push({ nombre, ok });
    console.log(`${ok ? 'OK' : 'FALLO'} ${nombre} ${detalle || ''}`);
  };

  let api = arrancar(comun);
  try {
    await esperar(api.child, api.leer);
    if (process.env.SOLO_FALLO === '1') {
      const a = await login('ana.prueba@sesion.test', 'ClaveTest-Ana1');
      const root3 = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: env.DB_PASSWORD, database: DB });
      await exigir(root3);
      try {
        await root3.query(`REVOKE SELECT ON \`${DB}\`.* FROM 'cli_sesion_test'@'localhost'`);
        await root3.query(`REVOKE SELECT ON \`${DB}\`.* FROM 'cli_sesion_test'@'127.0.0.1'`);
        await root3.query('FLUSH PRIVILEGES');
        const [procesos] = await root3.query(`SELECT ID AS id FROM information_schema.PROCESSLIST WHERE USER = 'cli_sesion_test'`);
        for (const proceso of procesos) await root3.query('KILL ?', [proceso.id]);
        const caida = await ruta(a.json?.data?.access_token, 1);
        anotar('12 base no disponible', a.status === 200 && caida.status === 503, `login=${a.status} ruta=${caida.status}`);
      } finally {
        await root3.query(`GRANT SELECT ON \`${DB}\`.* TO 'cli_sesion_test'@'localhost'`);
        await root3.query(`GRANT SELECT ON \`${DB}\`.* TO 'cli_sesion_test'@'127.0.0.1'`);
        await root3.query('FLUSH PRIVILEGES');
        const [procesos] = await root3.query(`SELECT ID AS id FROM information_schema.PROCESSLIST WHERE USER = 'cli_sesion_test'`);
        for (const proceso of procesos) await root3.query('KILL ?', [proceso.id]);
        await root3.end();
      }
    } else {
    const a = await login('ana.prueba@sesion.test', 'ClaveTest-Ana1');
    const b = await login('ana.prueba@sesion.test', 'ClaveTest-Ana1');
    const viva = await ruta(a.json?.data?.access_token, 1);
    anotar('1 access con sesion activa', a.status === 200 && viva.status === 200, `login=${a.status} ruta=${viva.status}`);

    const logout = await http('DELETE', '/auth/logout', { token: a.json.data.access_token });
    const trasLogout = await ruta(a.json.data.access_token, 1);
    anotar('2 logout revoca el access', logout.status === 200 && trasLogout.status === 401, `logout=${logout.status} ruta=${trasLogout.status}`);

    const clave = await login('clave.prueba@sesion.test', 'ClaveTest-Nueva1');
    const cambio = await http('POST', '/auth/cambiar-clave', {
      token: clave.json?.data?.access_token,
      body: { clave_actual: 'ClaveTest-Nueva1', clave_nueva: 'ClaveTest-Nueva2' },
    });
    const trasClave = await ruta(clave.json?.data?.access_token, 1);
    anotar('3 cambio de clave', clave.status === 200 && cambio.status === 200 && trasClave.status === 401, `login=${clave.status} cambio=${cambio.status} ruta=${trasClave.status}`);

    const baja = await login('rollback.prueba@sesion.test', 'ClaveTest-Roll1');
    const eliminar = await http('DELETE', '/usuarios/90', { token: b.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    const trasBaja = await ruta(baja.json?.data?.access_token, 1);
    anotar('4 baja del usuario', baja.status === 200 && eliminar.status === 200 && trasBaja.status === 401, `login=${baja.status} baja=${eliminar.status} ruta=${trasBaja.status}`);

    const fantasma = jwt.sign({
      sub: 10, username: 'ana.prueba@sesion.test', roleId: 1, token_use: 'access', sid: randomUUID(), session_exp: Math.floor(Date.now() / 1000) + 3600,
    }, jwtSecret, { expiresIn: '15m' });
    const ausente = await ruta(fantasma, 1);
    anotar('5 sesion inexistente', ausente.status === 401, `ruta=${ausente.status}`);

    const vencidaLogin = await login('ana.prueba@sesion.test', 'ClaveTest-Ana1');
    const root = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: env.DB_PASSWORD, database: DB });
    await exigir(root);
    await root.query(
      `UPDATE cli_sesion SET vence_en = '2000-01-01 00:00:00'
       WHERE id_sesion = ? AND id_usuario = 10 AND DATABASE() = ?`,
      [vencidaLogin.json.data.sessionId, DB],
    );
    await root.end();
    const trasVence = await ruta(vencidaLogin.json.data.access_token, 1);
    anotar('6 sesion vencida', vencidaLogin.status === 200 && trasVence.status === 401, `ruta=${trasVence.status}`);

    const comoRefresh = await ruta(b.json.data.refresh_token, 1);
    anotar('7 refresh en ruta protegida', comoRefresh.status === 401, `ruta=${comoRefresh.status}`);

    const sinSid = jwt.sign({ sub: 10, username: 'ana.prueba@sesion.test', roleId: 1 }, jwtSecret, { expiresIn: '15m' });
    const sin = await ruta(sinSid, 1);
    anotar('8 access sin sid', sin.status === 401, `ruta=${sin.status}`);

    const otra = await ruta(b.json.data.access_token, 1);
    anotar('9 la otra sesion sigue', otra.status === 200, `ruta=${otra.status}`);

    const empA = await ruta(b.json.data.access_token, 1);
    const empB = await ruta(b.json.data.access_token, 2);
    anotar('10 dos empresas', empA.status === 200 && empB.status === 403, `A=${empA.status} B=${empB.status}:${empB.json?.mensaje}`);

    const root2 = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: env.DB_PASSWORD, database: DB });
    await exigir(root2);
    const [retiro] = await root2.query(
      `UPDATE cli_usuario_unidad SET estado_registro = 'ELIMINADO'
       WHERE id_usuario = 10 AND id_unidad = 2 AND DATABASE() = ?`,
      [DB],
    );
    await root2.end();
    const quedaA = await ruta(b.json.data.access_token, 1);
    const quedaB = await ruta(b.json.data.access_token, 2);
    anotar('11 quitar una membresia', retiro.affectedRows === 1 && quedaA.status === 200 && quedaB.status === 403, `filas=${retiro.affectedRows} A=${quedaA.status} B=${quedaB.status}:${quedaB.json?.mensaje}`);

    const root3 = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: env.DB_PASSWORD, database: DB });
    await exigir(root3);
    try {
      await root3.query(`REVOKE SELECT ON \`${DB}\`.* FROM 'cli_sesion_test'@'localhost'`);
      await root3.query(`REVOKE SELECT ON \`${DB}\`.* FROM 'cli_sesion_test'@'127.0.0.1'`);
      await root3.query('FLUSH PRIVILEGES');
      const caida = await ruta(b.json.data.access_token, 1);
      anotar('12 base no disponible', caida.status === 503, `ruta=${caida.status}`);
    } finally {
      await root3.query(`GRANT SELECT ON \`${DB}\`.* TO 'cli_sesion_test'@'localhost'`);
      await root3.query(`GRANT SELECT ON \`${DB}\`.* TO 'cli_sesion_test'@'127.0.0.1'`);
      await root3.query('FLUSH PRIVILEGES');
      await root3.end();
    }
    }
  } finally {
    await cerrar(api.child);
  }

  const despues = await negocio(env.DB_PASSWORD);
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
