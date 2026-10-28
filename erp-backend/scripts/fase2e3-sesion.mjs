/**
 * Pruebas HTTP reales de sesiones contra app_clinica_lopez_sesion_test.
 * No abre escrituras sobre app_clinica_lopez.
 * Uso: node scripts/fase2e3-sesion.mjs
 * Si la base de pruebas no existe, la crea. No la elimina al terminar.
 */
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const DB = 'app_clinica_lopez_sesion_test';
const NEGOCIO = 'app_clinica_lopez';
const HOST = 'localhost';
const PORT_DB = 3306;
const PORT_API = 3791;
const API = `http://127.0.0.1:${PORT_API}/api`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKEND = path.join(ROOT, 'erp-backend');

const CLAVES = {
  ana: 'ClaveTest-Ana1',
  sin: 'ClaveTest-Sin1',
  inactivo: 'ClaveTest-Ina1',
  baja: 'ClaveTest-Baja1',
  clave: 'ClaveTest-Clave1',
  rollback: 'ClaveTest-Roll1',
};

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

function assertNombre(nombre, etiqueta) {
  if (nombre !== DB) {
    throw new Error(`${etiqueta}: base ${nombre || '(ninguna)'} en lugar de ${DB}`);
  }
}

async function baseActual(conn) {
  const [[row]] = await conn.query('SELECT DATABASE() AS db');
  return row.db;
}

async function exigir(conn, etiqueta) {
  const db = await baseActual(conn);
  assertNombre(db, etiqueta);
  return db;
}

function mysqlCli(args, password) {
  return new Promise((resolve, reject) => {
    const child = spawn('D:\\xampp\\mysql\\bin\\mysql.exe', ['-u', 'root', '-h', HOST, '-P', String(PORT_DB), ...args], {
      env: { ...process.env, MYSQL_PWD: password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (b) => { err += b.toString(); });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `mysql salió ${code}`));
    });
  });
}

async function fuente(password, archivo) {
  const check = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password, database: DB });
  try {
    await exigir(check, `antes de ${path.basename(archivo)}`);
  } finally {
    await check.end();
  }
  await mysqlCli(['--default-character-set=utf8mb4', DB, '-e', `source ${archivo.replace(/\\/g, '/')}`], password);
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
  try { json = text ? JSON.parse(text) : null; } catch { json = { crudo: text.slice(0, 300) }; }
  return { status: res.status, json };
}

async function sesiones(conn, idUsuario) {
  await exigir(conn, 'lectura de cli_sesion');
  await conn.query("SET time_zone = '-05:00'");
  const [rows] = await conn.query(
    `SELECT id_sesion, id_usuario, CHAR_LENGTH(hash_refresh) AS hash_len,
            hash_refresh REGEXP '^[0-9a-f]{64}$' AS hash_hex,
            fecha_creacion, vence_en, fecha_revocacion, motivo_revocacion, fecha_renovacion
     FROM cli_sesion WHERE id_usuario = ? ORDER BY fecha_creacion, id_sesion`,
    [idUsuario],
  );
  return rows;
}

async function fila(conn, sid) {
  await exigir(conn, 'lectura de una sesion');
  await conn.query("SET time_zone = '-05:00'");
  const [rows] = await conn.query(
    `SELECT id_sesion, id_usuario, hash_refresh, CHAR_LENGTH(hash_refresh) AS hash_len,
            fecha_revocacion, motivo_revocacion, fecha_renovacion, vence_en,
            vence_en = FROM_UNIXTIME(?) AS vence_ok
     FROM cli_sesion WHERE id_sesion = ?`,
    [0, sid],
  );
  return rows[0] || null;
}

async function compararVence(conn, sid, sessionExp) {
  await exigir(conn, 'comparar vence_en');
  await conn.query("SET time_zone = '-05:00'");
  const [[row]] = await conn.query(
    `SELECT vence_en, FROM_UNIXTIME(?) AS esperado, vence_en = FROM_UNIXTIME(?) AS igual
     FROM cli_sesion WHERE id_sesion = ?`,
    [sessionExp, sessionExp, sid],
  );
  return row;
}

function resumir(rows) {
  return rows.map((r) => ({
    sid: r.id_sesion,
    hash_len: Number(r.hash_len),
    hash_hex: Number(r.hash_hex),
    vence_en: r.vence_en,
    revocada: r.fecha_revocacion ? String(r.fecha_revocacion) : null,
    motivo: r.motivo_revocacion,
    renovada: r.fecha_renovacion ? String(r.fecha_renovacion) : null,
  }));
}

function arrancarApi(envExtra) {
  const childEnv = { ...process.env, ...envExtra };
  delete childEnv.MYSQL_PWD;
  const child = spawn(
    process.execPath,
    [path.join(BACKEND, 'dist', 'apps', 'api', 'main.js')],
    {
      cwd: BACKEND,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let log = '';
  child.stdout.on('data', (b) => { log += b.toString(); });
  child.stderr.on('data', (b) => { log += b.toString(); });
  return { child, leer: () => log };
}

async function esperarApi(child, leer) {
  const inicio = Date.now();
  while (Date.now() - inicio < 90000) {
    if (child.exitCode != null) {
      throw new Error(`La API terminó antes de escuchar.\n${leer().slice(-2000)}`);
    }
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ correo: 'nadie@sesion.test', password: 'x' }),
      });
      if (res.status === 401 || res.status === 200) return;
    } catch { /* aún arranca */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`La API no respondió.\n${leer().slice(-2000)}`);
}

async function negocio(password) {
  const conn = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password, database: NEGOCIO });
  try {
    const [[db]] = await conn.query('SELECT DATABASE() AS db');
    const [[ses]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'cli_sesion'`,
      [NEGOCIO],
    );
    const [[u]] = await conn.query(
      `SELECT COUNT(*) AS n, SHA2(GROUP_CONCAT(CONCAT_WS('|', id_usuario, id_rol, estado_registro) ORDER BY id_usuario), 256) AS h
       FROM sis_usuario`,
    );
    const [[m]] = await conn.query(
      `SELECT COUNT(*) AS n, SHA2(GROUP_CONCAT(CONCAT_WS('|', id_usuario_unidad, id_usuario, id_unidad, id_rol, estado_registro) ORDER BY id_usuario_unidad), 256) AS h
       FROM cli_usuario_unidad`,
    );
    const [[c]] = await conn.query(
      `SELECT
         (SELECT COUNT(*) FROM cli_paciente) AS pacientes,
         (SELECT COUNT(*) FROM cli_cita) AS citas,
         (SELECT COUNT(*) FROM cli_consulta) AS consultas,
         (SELECT COUNT(*) FROM cli_documento) AS documentos`,
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

async function main() {
  const env = leerEnv();
  const rootPass = env.DB_PASSWORD;
  if (!rootPass) throw new Error('DB_PASSWORD ausente');
  const dbPass = randomBytes(18).toString('base64url');
  const jwtSecret = randomBytes(24).toString('base64url');
  const resultados = [];
  const anotar = (nombre, ok, detalle) => {
    resultados.push({ nombre, ok, detalle });
    console.log(`${ok ? 'OK' : 'FALLO'} ${nombre} ${detalle || ''}`);
  };

  const version = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: rootPass });
  const [[ver]] = await version.query('SELECT VERSION() AS v');
  const [existe] = await version.query(
    'SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME = ?',
    [DB],
  );
  await version.end();
  console.log(`MariaDB ${ver.v}`);
  console.log(`Base de pruebas ${DB}: ${existe.length ? 'ya existe' : 'no existe'}`);

  const antes = await negocio(rootPass);
  console.log(`ANTES ${NEGOCIO} ${JSON.stringify(antes)}`);

  let reutilizar = false;
  if (existe.length) {
    const sonda = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: rootPass, database: DB });
    await exigir(sonda, 'base ya existente');
    const [[marca]] = await sonda.query(
      `SELECT
         (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = 'cli_sesion') AS sesion,
         (SELECT COUNT(*) FROM cli_unidad WHERE codigo = 'EMP_A') AS empresa,
         (SELECT COUNT(*) FROM sis_usuario WHERE correo = 'ana.prueba@sesion.test') AS ana`,
      [DB],
    );
    const [tablas] = await sonda.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name`,
      [DB],
    );
    await sonda.end();
    console.log(`CONTENIDO_EXISTENTE ${tablas.map((t) => t.table_name || t.TABLE_NAME).join(',')}`);
    if (!(Number(marca.sesion) === 1 && Number(marca.empresa) === 1 && Number(marca.ana) === 1)) {
      throw new Error(`${DB} ya existe y no coincide con el esquema sintético. No se sobrescribe.`);
    }
    reutilizar = true;
    console.log('Se reutiliza el esquema sintético de esta misma fase. No se recrea ni se vacía.');
  } else {
  const admin = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: rootPass, multipleStatements: true });
  await admin.query(
    `CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`,
  );
  await admin.end();

  await fuente(rootPass, path.join(ROOT, 'bd', 'pruebas', 'sesion_test_esquema.sql'));
  await fuente(rootPass, path.join(ROOT, 'bd', 'pruebas', 'sesion_test_procedimientos.sql'));

  const conn = await createConnection({
    host: HOST, port: PORT_DB, user: 'root', password: rootPass, database: DB, timezone: '-05:00',
  });
  await exigir(conn, 'alta de usuarios');
  const usuarios = [
    [10, 'ana.prueba@sesion.test', CLAVES.ana, 'ANA', 'PRUEBA', 'ACTIVO'],
    [11, 'sin.membresia@sesion.test', CLAVES.sin, 'SIN', 'MEMBRESIA', 'ACTIVO'],
    [12, 'inactivo@sesion.test', CLAVES.inactivo, 'INACTIVO', 'PRUEBA', 'BLOQUEADO'],
    [13, 'baja.prueba@sesion.test', CLAVES.baja, 'BAJA', 'PRUEBA', 'ACTIVO'],
    [14, 'clave.prueba@sesion.test', CLAVES.clave, 'CLAVE', 'PRUEBA', 'ACTIVO'],
    [90, 'rollback.prueba@sesion.test', CLAVES.rollback, 'ROLLBACK', 'PRUEBA', 'ACTIVO'],
  ];
  if (!reutilizar) for (const [id, correo, clave, nombres, apellidos, estado] of usuarios) {
    await exigir(conn, `insertar ${id}`);
    const hash = await bcrypt.hash(clave, 10);
    await conn.query(
      `INSERT INTO sis_usuario (id_usuario, id_rol, nombres, apellidos, correo, password, estado_registro)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
      [id, nombres, apellidos, correo, hash, estado],
    );
  }
  const membresias = [
    [10, 1, 2],
    [10, 2, 3],
    [13, 1, 2],
    [14, 1, 2],
    [90, 1, 2],
  ];
  if (!reutilizar) for (const [idUsuario, idUnidad, idRol] of membresias) {
    await exigir(conn, `membresia ${idUsuario}-${idUnidad}`);
    await conn.query(
      `INSERT INTO cli_usuario_unidad (id_usuario, id_unidad, id_rol, estado_registro)
       VALUES (?, ?, ?, 'ACTIVO')`,
      [idUsuario, idUnidad, idRol],
    );
  }
  await conn.end();

  if (!reutilizar) await fuente(rootPass, path.join(ROOT, 'bd', 'pruebas', '034_cli_sesion_sin_use.sql'));
  }

  await mysqlCli([
    '-e',
    `CREATE USER IF NOT EXISTS 'cli_sesion_test'@'localhost' IDENTIFIED BY '${dbPass}';
     CREATE USER IF NOT EXISTS 'cli_sesion_test'@'127.0.0.1' IDENTIFIED BY '${dbPass}';
     ALTER USER 'cli_sesion_test'@'localhost' IDENTIFIED BY '${dbPass}';
     ALTER USER 'cli_sesion_test'@'127.0.0.1' IDENTIFIED BY '${dbPass}';
     GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON \`${DB}\`.* TO 'cli_sesion_test'@'localhost';
     GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON \`${DB}\`.* TO 'cli_sesion_test'@'127.0.0.1';
     FLUSH PRIVILEGES;`,
  ], rootPass);

  const limitado = await createConnection({ host: HOST, port: PORT_DB, user: 'cli_sesion_test', password: dbPass, database: DB });
  const dbLimitada = await exigir(limitado, 'usuario de prueba');
  let negocioBloqueado = false;
  try {
    await limitado.query(`SELECT COUNT(*) AS n FROM \`${NEGOCIO}\`.sis_usuario`);
  } catch (error) {
    negocioBloqueado = /SELECT|denied|1142|1044/i.test(String(error.message));
  }
  const [[estructura]] = await limitado.query(
    `SELECT ENGINE, TABLE_COLLATION FROM information_schema.tables
     WHERE table_schema = ? AND table_name = 'cli_sesion'`,
    [DB],
  );
  const [indices] = await limitado.query(
    `SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'cli_sesion' ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [DB],
  );
  const [fks] = await limitado.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cli_sesion' AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [DB],
  );
  console.log(`API_DB=${dbLimitada}`);
  console.log(`USUARIO_PRUEBA_BLOQUEA_${NEGOCIO}=${negocioBloqueado}`);
  console.log(`TABLA ${JSON.stringify({ estructura, indices, fks })}`);

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
  console.log(`BACKEND_DB=${comun.DB_DATABASE} HOST=${comun.DB_HOST} PORT_API=${comun.PORT} USER=${comun.DB_USER} JWT_EXPIRES_IN=${comun.JWT_EXPIRES_IN}`);
  if (comun.DB_DATABASE === NEGOCIO) throw new Error('El backend de prueba apunta a la base de negocio');

  let api = arrancarApi(comun);
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const cerrar = async (child) => {
    if (!child || child.exitCode != null) return;
    child.kill();
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 5000);
      child.once('exit', () => { clearTimeout(t); resolve(); });
    });
  };
  const login = async (correo, password) => http('POST', '/auth/login', { body: { correo, password } });

  try {
  await esperarApi(api.child, api.leer);
  const [[dbApi]] = await limitado.query('SELECT DATABASE() AS db, (SELECT COUNT(*) FROM cli_sesion) AS sesiones');
  assertNombre(dbApi.db, 'API en marcha');
  console.log(`CONEXION_PRUEBA db=${dbApi.db} sesiones=${dbApi.sesiones}`);

    const antesAna = await sesiones(limitado, 10);
    const okAna = await login('ana.prueba@sesion.test', CLAVES.ana);
    const data = okAna.json?.data;
    const p = payload(data?.access_token);
    const pr = payload(data?.refresh_token);
    const row = data?.sessionId ? await fila(limitado, data.sessionId) : null;
    const vence = data?.sessionId && p ? await compararVence(limitado, data.sessionId, p.session_exp) : null;
    const hashIgualToken = row && data?.refresh_token ? row.hash_refresh === data.refresh_token : null;
    const hashSha = row && data?.refresh_token
      ? row.hash_refresh === createHash('sha256').update(data.refresh_token).digest('hex')
      : false;
    anotar('1 login y sesion', okAna.status === 200 && !!row && hashSha && hashIgualToken === false && Number(vence?.igual) === 1 && p?.token_use === 'access' && pr?.token_use === 'refresh' && p?.sid === data.sessionId && p?.sub === 10 && Number(p.exp) - Number(p.iat) <= 900,
      `status=${okAna.status} filas_antes=${antesAna.length} hash_sha=${hashSha} texto_plano=${hashIgualToken} vence_ok=${vence?.igual} session_exp=${p?.session_exp} roleId=${p?.roleId}`);

    const sin = await login('sin.membresia@sesion.test', CLAVES.sin);
    const ina = await login('inactivo@sesion.test', CLAVES.inactivo);
    const filasSin = await sesiones(limitado, 11);
    const filasIna = await sesiones(limitado, 12);
    anotar('2 sin membresia e inactivo', sin.status === 401 && ina.status === 401 && filasSin.length === 0 && filasIna.length === 0,
      `sin=${sin.status}:${sin.json?.mensaje} inactivo=${ina.status}:${ina.json?.mensaje}`);

    const s2 = await login('ana.prueba@sesion.test', CLAVES.ana);
    const refresh1 = await http('POST', '/auth/refresh', {
      body: { refreshToken: data.refresh_token, sessionId: data.sessionId },
    });
    const p2 = payload(refresh1.json?.data?.refresh_token);
    const row2 = await fila(limitado, data.sessionId);
    const vence2 = await compararVence(limitado, data.sessionId, p.session_exp);
    const otra = await fila(limitado, s2.json.data.sessionId);
    const hashNuevo = row2.hash_refresh === createHash('sha256').update(refresh1.json.data.refresh_token).digest('hex');
    anotar('3 refresh rota el hash', refresh1.status === 200 && hashNuevo && row2.hash_refresh !== row.hash_refresh && Number(vence2.igual) === 1 && p2.session_exp === p.session_exp && otra.hash_refresh !== row2.hash_refresh && row2.fecha_revocacion == null,
      `status=${refresh1.status} mismo_session_exp=${p2?.session_exp === p?.session_exp} vence_ok=${vence2?.igual} renovada=${!!row2?.fecha_renovacion}`);

    const reuso = await http('POST', '/auth/refresh', {
      body: { refreshToken: data.refresh_token, sessionId: data.sessionId },
    });
    const rowReuso = await fila(limitado, data.sessionId);
    const s2sigue = await http('POST', '/auth/refresh', {
      body: { refreshToken: s2.json.data.refresh_token, sessionId: s2.json.data.sessionId },
    });
    anotar('4 reutilizacion', reuso.status === 401 && rowReuso.motivo_revocacion === 'REUTILIZACION' && s2sigue.status === 200,
      `reuso=${reuso.status}:${reuso.json?.mensaje} motivo=${rowReuso.motivo_revocacion} otra=${s2sigue.status}`);

    const estable = await login('ana.prueba@sesion.test', CLAVES.ana);
    const baseConcurrente = s2sigue.json.data;
    const antesConc = await fila(limitado, baseConcurrente.sessionId);
    const pareja = await Promise.all([
      http('POST', '/auth/refresh', { body: { refreshToken: baseConcurrente.refresh_token, sessionId: baseConcurrente.sessionId } }),
      http('POST', '/auth/refresh', { body: { refreshToken: baseConcurrente.refresh_token, sessionId: baseConcurrente.sessionId } }),
    ]);
    const despuesConc = await fila(limitado, baseConcurrente.sessionId);
    const abiertas = (await sesiones(limitado, 10)).filter((r) => r.id_sesion === baseConcurrente.sessionId && !r.fecha_revocacion);
    const codigos = pareja.map((x) => x.status).sort();
    const ganador = pareja.find((x) => x.status === 200);
    const reusoGanador = ganador?.json?.data
      ? await http('POST', '/auth/refresh', { body: { refreshToken: ganador.json.data.refresh_token, sessionId: ganador.json.data.sessionId } })
      : { status: 0, json: {} };
    const estableSigue = await http('POST', '/auth/refresh', {
      body: { refreshToken: estable.json.data.refresh_token, sessionId: estable.json.data.sessionId },
    });
    anotar('5 dos refresh concurrentes', codigos.join(',') === '200,401' && despuesConc.motivo_revocacion === 'REUTILIZACION' && abiertas.length === 0 && despuesConc.hash_refresh !== antesConc.hash_refresh && reusoGanador.status === 401 && estableSigue.status === 200,
      `codigos=${codigos.join(',')} motivo=${despuesConc.motivo_revocacion} abiertas=${abiertas.length} hash_cambio=${despuesConc.hash_refresh !== antesConc.hash_refresh} ganador_reusado=${reusoGanador.status} otra_sesion=${estableSigue.status}`);

    const a = await login('ana.prueba@sesion.test', CLAVES.ana);
    const b = await login('ana.prueba@sesion.test', CLAVES.ana);
    const logout = await http('DELETE', '/auth/logout', { token: a.json.data.access_token });
    const refreshLogout = await http('POST', '/auth/refresh', {
      body: { refreshToken: a.json.data.refresh_token, sessionId: a.json.data.sessionId },
    });
    const rowLogout = await fila(limitado, a.json.data.sessionId);
    anotar('6 logout rechaza el refresh', logout.status === 200 && refreshLogout.status === 401 && rowLogout.motivo_revocacion === 'LOGOUT',
      `logout=${logout.status} refresh=${refreshLogout.status}:${refreshLogout.json?.mensaje} motivo=${rowLogout.motivo_revocacion}`);

    const otraViva = await http('POST', '/auth/refresh', {
      body: { refreshToken: b.json.data.refresh_token, sessionId: b.json.data.sessionId },
    });
    const rowB = await fila(limitado, b.json.data.sessionId);
    anotar('7 la otra sesion sigue', otraViva.status === 200 && rowB.fecha_revocacion == null,
      `status=${otraViva.status} motivo=${rowB.motivo_revocacion}`);

    const acceso = await http('GET', '/usuarios', {
      token: a.json.data.access_token,
      headers: { 'x-unidad-id': '1' },
    });
    const expAcceso = payload(a.json.data.access_token);
    anotar('14 access vigente tras logout', acceso.status === 200 && Number(expAcceso.exp) > Math.floor(Date.now() / 1000) && Number(expAcceso.exp) - Number(expAcceso.iat) <= 900,
      `status=${acceso.status} segundos=${Number(expAcceso.exp) - Number(expAcceso.iat)}`);

    const listaA = await http('GET', '/usuarios', { token: b.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    const listaB = await http('GET', '/usuarios', { token: b.json.data.access_token, headers: { 'x-unidad-id': '2' } });
    const listaSin = await http('GET', '/usuarios', { token: b.json.data.access_token });
    anotar('10 dos empresas y roles distintos', listaA.status === 200 && listaB.status === 403 && listaSin.status === 400,
      `A=${listaA.status} B=${listaB.status}:${listaB.json?.mensaje} sin=${listaSin.status}:${listaSin.json?.mensaje}`);

    await exigir(limitado, 'retirar membresia B');
    const [retiro] = await limitado.query(
      `UPDATE cli_usuario_unidad SET estado_registro = 'ELIMINADO'
       WHERE id_usuario = 10 AND id_unidad = 2 AND estado_registro = 'ACTIVO'`,
    );
    const trasA = await http('GET', '/usuarios', { token: otraViva.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    const trasB = await http('GET', '/usuarios', { token: otraViva.json.data.access_token, headers: { 'x-unidad-id': '2' } });
    const refreshTras = await http('POST', '/auth/refresh', {
      body: { refreshToken: otraViva.json.data.refresh_token, sessionId: otraViva.json.data.sessionId },
    });
    const rowTras = await fila(limitado, otraViva.json.data.sessionId);
    anotar('11 retirar una membresia', retiro.affectedRows === 1 && trasA.status === 200 && trasB.status === 403 && refreshTras.status === 200 && rowTras.fecha_revocacion == null,
      `filas=${retiro.affectedRows} A=${trasA.status} B=${trasB.status} refresh=${refreshTras.status} motivo=${rowTras.motivo_revocacion}`);

    const c1 = await login('clave.prueba@sesion.test', CLAVES.clave);
    const c2 = await login('clave.prueba@sesion.test', CLAVES.clave);
    const cambio = await http('POST', '/auth/cambiar-clave', {
      token: c1.json.data.access_token,
      body: { clave_actual: CLAVES.clave, clave_nueva: 'ClaveTest-Nueva1' },
    });
    const r1 = await http('POST', '/auth/refresh', { body: { refreshToken: c1.json.data.refresh_token, sessionId: c1.json.data.sessionId } });
    const r2 = await http('POST', '/auth/refresh', { body: { refreshToken: c2.json.data.refresh_token, sessionId: c2.json.data.sessionId } });
    const rowsClave = (await sesiones(limitado, 14)).filter((r) => r.id_sesion === c1.json.data.sessionId || r.id_sesion === c2.json.data.sessionId);
    const nueva = await login('clave.prueba@sesion.test', 'ClaveTest-Nueva1');
    anotar('8 cambio de clave', cambio.status === 200 && r1.status === 401 && r2.status === 401 && rowsClave.length === 2 && rowsClave.every((r) => r.motivo_revocacion === 'CAMBIO_CLAVE') && nueva.status === 200,
      `cambio=${cambio.status}:${cambio.json?.message || cambio.json?.mensaje} r1=${r1.status} r2=${r2.status} nueva=${nueva.status} motivos=${rowsClave.map((r) => r.motivo_revocacion).join(',')}`);

    const bajaLogin = await login('baja.prueba@sesion.test', CLAVES.baja);
    const bajaHttp = await http('DELETE', '/usuarios/13', {
      token: nueva.json.data.access_token,
      headers: { 'x-unidad-id': '1' },
    });
    const bajaRefresh = await http('POST', '/auth/refresh', {
      body: { refreshToken: bajaLogin.json.data.refresh_token, sessionId: bajaLogin.json.data.sessionId },
    });
    const rowsBaja = await sesiones(limitado, 13);
    const [[estadoBaja]] = await limitado.query(`SELECT estado_registro FROM sis_usuario WHERE id_usuario = 13`);
    const anaSigue = await http('POST', '/auth/refresh', {
      body: { refreshToken: refreshTras.json.data.refresh_token, sessionId: refreshTras.json.data.sessionId },
    });
    anotar('9 baja revoca sus sesiones', bajaHttp.status === 200 && bajaRefresh.status === 401 && rowsBaja[0]?.motivo_revocacion === 'BAJA' && estadoBaja.estado_registro === 'ELIMINADO' && anaSigue.status === 200,
      `baja=${bajaHttp.status}:${bajaHttp.json?.message || bajaHttp.json?.mensaje} refresh=${bajaRefresh.status} motivo=${rowsBaja[0]?.motivo_revocacion} estado=${estadoBaja.estado_registro} ana=${anaSigue.status}`);

    const root = await createConnection({ host: HOST, port: PORT_DB, user: 'root', password: rootPass, database: DB });
    await exigir(root, 'trigger de rollback');
    await root.query('DROP TRIGGER IF EXISTS trg_cli_sesion_fallo_sintetico');
    await root.query(`CREATE TRIGGER trg_cli_sesion_fallo_sintetico
      BEFORE INSERT ON cli_sesion FOR EACH ROW
      BEGIN
        IF NEW.id_usuario = 90 THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fallo sintetico de persistencia';
        END IF;
      END`);
    const antesRoll = await sesiones(limitado, 90);
    const roll = await login('rollback.prueba@sesion.test', CLAVES.rollback);
    const despuesRoll = await sesiones(limitado, 90);
    await root.query('DROP TRIGGER IF EXISTS trg_cli_sesion_fallo_sintetico');
    const rollOk = await login('rollback.prueba@sesion.test', CLAVES.rollback);
    await root.end();
    anotar('13 rollback si falla la persistencia', antesRoll.length === 0 && roll.status === 401 && !roll.json?.data?.access_token && despuesRoll.length === 0 && rollOk.status === 200,
      `antes=${antesRoll.length} login=${roll.status}:${roll.json?.mensaje} despues=${despuesRoll.length} sin_trigger=${rollOk.status}`);

    await cerrar(api.child);
    api = arrancarApi({ ...comun, JWT_EXPIRES_IN: '8s', JWT_REFRESH_EXPIRES_IN: '12s' });
    await esperarApi(api.child, api.leer);
    console.log('BACKEND_DB_CORTO=app_clinica_lopez_sesion_test JWT_EXPIRES_IN=8s JWT_REFRESH_EXPIRES_IN=12s');
    const corto = await login('ana.prueba@sesion.test', CLAVES.ana);
    const pc = payload(corto.json?.data?.refresh_token);
    const venceCorto = await compararVence(limitado, corto.json.data.sessionId, pc.session_exp);
    const refCorto = await http('POST', '/auth/refresh', {
      body: { refreshToken: corto.json.data.refresh_token, sessionId: corto.json.data.sessionId },
    });
    const pc2 = payload(refCorto.json?.data?.refresh_token);
    const venceIgual = await compararVence(limitado, corto.json.data.sessionId, pc.session_exp);
    const espera = Math.max(0, pc.session_exp * 1000 - Date.now() + 1500);
    await dormir(espera);
    const tarde = await http('POST', '/auth/refresh', {
      body: { refreshToken: refCorto.json.data.refresh_token, sessionId: refCorto.json.data.sessionId },
    });
    const venceFinal = await compararVence(limitado, corto.json.data.sessionId, pc.session_exp);
    const rowCorto = await fila(limitado, corto.json.data.sessionId);
    anotar('12 vencimiento absoluto', corto.status === 200 && refCorto.status === 200 && pc2.session_exp === pc.session_exp && Number(venceCorto.igual) === 1 && Number(venceIgual.igual) === 1 && String(venceIgual.vence_en) === String(venceCorto.vence_en) && tarde.status === 401 && Number(venceFinal.igual) === 1 && rowCorto.fecha_revocacion == null,
      `refresh=${refCorto.status} mismo_exp=${pc2?.session_exp === pc?.session_exp} tarde=${tarde.status}:${tarde.json?.mensaje} motivo=${rowCorto.motivo_revocacion} espera_ms=${espera}`);

    const vivoLogin = await login('ana.prueba@sesion.test', CLAVES.ana);
    const pa = payload(vivoLogin.json.data.access_token);
    await http('DELETE', '/auth/logout', { token: vivoLogin.json.data.access_token });
    const sigue = await http('GET', '/usuarios', { token: vivoLogin.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    await dormir(Math.max(0, pa.exp * 1000 - Date.now() + 1500));
    const caduco = await http('GET', '/usuarios', { token: vivoLogin.json.data.access_token, headers: { 'x-unidad-id': '1' } });
    anotar('14b access muere al vencer', sigue.status === 200 && caduco.status === 401,
      `tras_logout=${sigue.status} tras_exp=${caduco.status} segundos=${Number(pa.exp) - Number(pa.iat)}`);
  } finally {
    await cerrar(api.child);
    await limitado.end();
  }

  const despues = await negocio(rootPass);
  console.log(`DESPUES ${NEGOCIO} ${JSON.stringify(despues)}`);
  const igual = JSON.stringify(antes) === JSON.stringify(despues);
  console.log(`NEGOCIO_SIN_CAMBIOS=${igual}`);
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`RESUMEN ok=${resultados.length - fallos.length} fallo=${fallos.length}`);
  if (!igual || fallos.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`ERROR ${error.message}`);
  process.exit(1);
});
