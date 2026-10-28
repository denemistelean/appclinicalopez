import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const API_ORIGEN = 'http://127.0.0.1:3789';
export const API_AUTENTICADA = 'http://localhost:3789';
export const FRONT_ORIGEN = 'http://localhost:4202';

const RUTAS = {
  login: '/api/auth/login',
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
  mias: '/api/unidades/mias',
};

const CLAVES_CONTEO = ['usuarios', 'membresias', 'pacientes', 'citas', 'consultas', 'documentos', 'tratamientos', 'auditoria'];
const UUID_SESION = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const require = createRequire(import.meta.url);
const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function clasificarDestino(urlValor) {
  const url = new URL(urlValor);
  const puerto = url.port || (url.protocol === 'https:' ? '443' : '80');
  const esApi = (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    && puerto === '3789'
    && (url.pathname === '/api' || url.pathname.startsWith('/api/'));
  const esFrontend = (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    && puerto === '4202';
  return {
    host: url.hostname,
    puerto,
    ruta: url.pathname,
    esApi,
    esFrontend,
  };
}

export function exigirApi(urlValor) {
  const destino = clasificarDestino(urlValor);
  if (!destino.esApi || destino.esFrontend || destino.puerto !== '3789') {
    throw new Error(`destino_no_api:${destino.host}:${destino.puerto}${destino.ruta}`);
  }
  return destino;
}

export function exigirApiAutenticada(urlValor) {
  let url;
  try {
    url = new URL(urlValor);
  } catch {
    throw new Error('destino_autenticado_invalido');
  }
  const puerto = url.port || (url.protocol === 'https:' ? '443' : '80');
  const rutaOk = url.pathname === '/api' || url.pathname.startsWith('/api/');
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || puerto !== '3789' || !rutaOk || url.username || url.password || url.search) {
    throw new Error('destino_autenticado_invalido');
  }
  return { host: url.hostname, puerto, ruta: url.pathname };
}

export function esHtml(tipo, cuerpo) {
  const contenido = String(tipo || '').toLowerCase();
  const inicio = String(cuerpo || '').trimStart().slice(0, 80).toLowerCase();
  return contenido.includes('text/html') || inicio.startsWith('<!doctype') || inicio.startsWith('<html');
}

export function registrarRespuesta(metodo, urlValor, codigo, tipo, cuerpo, ubicacion) {
  const destino = exigirApi(urlValor);
  if (codigo >= 300 && codigo < 400) throw new Error(`redireccion_api:${codigo}`);
  if (ubicacion) {
    const hacia = clasificarDestino(new URL(ubicacion, urlValor).href);
    if (!hacia.esApi) throw new Error(`redireccion_fuera_de_api:${hacia.puerto}${hacia.ruta}`);
  }
  if (esHtml(tipo, cuerpo)) throw new Error('respuesta_html');
  let json = null;
  if (String(tipo || '').toLowerCase().includes('json') || String(cuerpo || '').trimStart().startsWith('{')) {
    json = JSON.parse(cuerpo);
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('json_inesperado');
  }
  return {
    metodo,
    ruta: destino.ruta,
    puerto: destino.puerto,
    codigo,
    json: json ? Object.keys(json) : [],
    mensaje: typeof json?.mensaje === 'string' ? json.mensaje.slice(0, 180) : '',
  };
}

export function esLoginDeApi(urlValor, codigo) {
  const destino = clasificarDestino(urlValor);
  return destino.esApi && destino.ruta === RUTAS.login && codigo === 200;
}

export function decodificarPayload(token) {
  try {
    const parte = String(token || '').split('.')[1];
    if (!parte) return null;
    const base64 = parte.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const data = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data;
  } catch {
    return null;
  }
}

export function leerCredencialesTexto(texto) {
  const lineas = String(texto || '').replace(/^\uFEFF/, '').split(/\r?\n/);
  while (lineas.length && lineas[lineas.length - 1].trim() === '') lineas.pop();
  if (lineas.length !== 2) throw new Error('credenciales_formato');
  const identificador = lineas[0].trim();
  const password = lineas[1].trim();
  if (!identificador || !password) throw new Error('credenciales_formato');
  return { identificador, password };
}

export function validarOrigenAutenticado(origen) {
  let url;
  try {
    url = new URL(origen);
  } catch {
    throw new Error('config_api');
  }
  if (url.protocol !== 'http:' || url.hostname !== 'localhost' || url.port !== '3789' || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('config_api');
  }
}

export function validarConfigDb(mapa) {
  if (!mapa || mapa.DB_HOST !== 'localhost' || String(mapa.DB_PORT) !== '3306' || mapa.DB_DATABASE !== 'app_clinica_lopez' || !mapa.DB_USER || !mapa.DB_PASSWORD) {
    throw new Error('config_db');
  }
}

export function validarSesionEmitida(json, anterior) {
  if (!json || typeof json !== 'object' || Array.isArray(json) || json.success !== true || json.message !== 'Login exitoso' || typeof json.timestamp !== 'string') {
    throw new Error('envoltorio_invalido');
  }
  const data = json.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('envoltorio_invalido');
  if (typeof data.primera_sesion !== 'boolean') throw new Error('sesion_incompleta');
  if (!data.usuario || typeof data.usuario !== 'object' || Array.isArray(data.usuario)) throw new Error('sesion_incompleta');
  const idUsuario = Number(data.usuario.id_usuario);
  if (!Number.isInteger(idUsuario) || idUsuario <= 0) throw new Error('sesion_incompleta');
  const access = data.access_token;
  const refresh = data.refresh_token;
  const sessionId = data.sessionId;
  if (typeof access !== 'string' || typeof refresh !== 'string' || typeof sessionId !== 'string' || !access || !refresh || !sessionId || access === refresh) {
    throw new Error('sesion_incompleta');
  }
  if (!UUID_SESION.test(sessionId)) throw new Error('sid_distinto');
  const pa = decodificarPayload(access);
  const pr = decodificarPayload(refresh);
  if (!pa || !pr) throw new Error('sesion_incompleta');
  if (pa.token_use !== 'access' || pr.token_use !== 'refresh') throw new Error('token_use_invalido');
  if (pa.sid !== sessionId || pr.sid !== sessionId || String(sessionId) === String(idUsuario)) throw new Error('sid_distinto');
  const sessionExp = Number(pa.session_exp);
  if (!Number.isFinite(sessionExp) || sessionExp !== Number(pr.session_exp)) throw new Error('session_exp_distinta');
  if (sessionExp <= Math.floor(Date.now() / 1000)) throw new Error('session_exp_invalida');
  if (Number(pa.sub) !== idUsuario || Number(pr.sub) !== idUsuario) throw new Error('usuario_distinto');
  if (anterior) {
    if (sessionId !== anterior.sessionId) throw new Error('sid_distinto');
    if (sessionExp !== anterior.sessionExp) throw new Error('expiracion_distinta');
    if (refresh === anterior.refresh) throw new Error('refresh_no_rotado');
  }
  return { access, refresh, sessionId, sessionExp, idUsuario };
}

export function validarMias(registro) {
  if (registro?.codigo !== 200) throw new Error('mias_http');
  const json = registro.json;
  if (!json || json.success !== true || typeof json.message !== 'string' || typeof json.timestamp !== 'string' || !Array.isArray(json.data) || json.data.length < 1) {
    throw new Error('mias_http');
  }
  for (const fila of json.data) {
    if (!fila || typeof fila !== 'object' || Array.isArray(fila)) throw new Error('mias_http');
    if (!Number.isInteger(Number(fila.id_unidad)) || Number(fila.id_unidad) <= 0) throw new Error('mias_http');
    if (!Number.isInteger(Number(fila.id_rol)) || !Number.isFinite(Number(fila.opera_finanzas))) throw new Error('mias_http');
    if (typeof fila.codigo !== 'string' || typeof fila.nombre !== 'string') throw new Error('mias_http');
  }
}

export function validarLogout(json) {
  if (!json || json.success !== true || json.message !== 'Sesión cerrada' || typeof json.timestamp !== 'string' || !json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
    throw new Error('logout_http');
  }
}

export function validarRevocacion(registro) {
  const json = registro?.json;
  if (registro?.codigo !== 401 || !json || json.exito !== false || json.estado !== 401 || json.mensaje !== 'Token inválido' || typeof json.ruta !== 'string' || typeof json.fecha !== 'string') {
    throw new Error('revocacion_http');
  }
}

export async function solicitarApi(urlValor, opciones, fetchImpl = fetch) {
  const destino = exigirApiAutenticada(urlValor);
  const respuesta = await fetchImpl(urlValor, { ...opciones, redirect: 'manual' });
  const tipo = respuesta.headers.get('content-type') || '';
  const ubicacion = respuesta.headers.get('location');
  const cuerpo = await respuesta.text();
  if (respuesta.status >= 300 && respuesta.status < 400) throw new Error('redireccion_api');
  if (ubicacion) {
    let hacia;
    try {
      hacia = exigirApiAutenticada(new URL(ubicacion, urlValor).href);
    } catch {
      throw new Error('redireccion_fuera_de_api');
    }
    if (!hacia) throw new Error('redireccion_fuera_de_api');
  }
  if (esHtml(tipo, cuerpo)) throw new Error('respuesta_html');
  if (!tipo.toLowerCase().includes('json')) throw new Error('contenido_no_json');
  let json;
  try {
    json = JSON.parse(cuerpo);
  } catch {
    throw new Error('json_invalido');
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('json_inesperado');
  return { metodo: opciones.method || 'GET', ruta: destino.ruta, codigo: respuesta.status, json };
}

function paso(metodo, ruta, codigo, veredicto) {
  return { metodo, ruta, codigo, veredicto };
}

function codigoError(error) {
  const mensaje = String(error?.message || '');
  return /^[a-z0-9_]+$/.test(mensaje) ? mensaje : 'error_opaco';
}

function normalizarConteos(valor) {
  const salida = {};
  for (const clave of CLAVES_CONTEO) {
    const n = Number(valor?.[clave]);
    if (!Number.isInteger(n) || n < 0) throw new Error('conteos_distintos');
    salida[clave] = n;
  }
  return salida;
}

function mismosConteos(antes, despues) {
  return CLAVES_CONTEO.every((clave) => antes[clave] === despues[clave]);
}

function normalizarFila(fila) {
  if (!fila || typeof fila !== 'object') throw new Error('sesion_fila');
  const idSesion = String(fila.idSesion || fila.id_sesion || '');
  const idUsuario = Number(fila.idUsuario ?? fila.id_usuario);
  const hash = String(fila.hash || fila.hash_refresh || '').toLowerCase();
  const venceUnix = Number(fila.venceUnix ?? fila.vence_unix);
  const revocada = fila.revocada === true || Number(fila.revocada) === 1;
  const motivoBruto = fila.motivo ?? fila.motivo_revocacion;
  const motivo = motivoBruto == null || motivoBruto === '' ? null : String(motivoBruto);
  if (!UUID_SESION.test(idSesion) || !Number.isInteger(idUsuario) || idUsuario <= 0 || !/^[0-9a-f]{64}$/.test(hash) || !Number.isFinite(venceUnix)) {
    throw new Error('sesion_fila');
  }
  return { idSesion, idUsuario, hash, venceUnix, revocada, motivo };
}

function normalizarResumen(fila) {
  const idSesion = String(fila?.idSesion || '');
  const idUsuario = Number(fila?.idUsuario);
  const motivo = fila?.motivo == null || fila?.motivo === '' ? null : String(fila.motivo);
  if (!UUID_SESION.test(idSesion) || !Number.isInteger(idUsuario)) throw new Error('sesion_fila');
  return { idSesion, idUsuario, revocada: fila.revocada === true, motivo };
}

function exigirFilaActiva(fila, sesion) {
  if (fila.idSesion !== sesion.sessionId || fila.idUsuario !== sesion.idUsuario || String(fila.idUsuario) === fila.idSesion || fila.revocada || fila.motivo || fila.venceUnix !== sesion.sessionExp) {
    throw new Error('sesion_fila');
  }
}

function compararSesiones(antes, despues, propia) {
  const mapa = new Map(antes.map((fila) => [fila.idSesion, fila]));
  const ajenas = despues.filter((fila) => fila.idSesion !== propia.id);
  if (ajenas.length !== antes.length || mapa.has(propia.id)) throw new Error('sesiones_ajenas');
  for (const fila of ajenas) {
    const previa = mapa.get(fila.idSesion);
    if (!previa || previa.idUsuario !== fila.idUsuario || previa.revocada !== fila.revocada || previa.motivo !== fila.motivo) {
      throw new Error('sesiones_ajenas');
    }
  }
  const actual = despues.find((fila) => fila.idSesion === propia.id);
  if (!actual || actual.idUsuario !== propia.idUsuario || !actual.revocada || actual.motivo !== 'LOGOUT') throw new Error('sesion_fila');
}

export async function ejecutarCiclo(deps) {
  const informe = {
    modo: 'autenticado',
    completo: false,
    pasos: [],
    detuvoEn: 'configuracion',
    error: '',
    revocacionNoConfirmada: false,
    credencialesEliminadas: false,
    sesion: null,
    conteos: null,
  };
  let accessParaCierre = null;
  let sessionIdCierre = null;
  let idUsuarioCierre = null;
  let sesionCreada = false;
  let logoutEnviado = false;
  let sesion = null;
  let antes = null;

  const confirmarRevocacion = async () => {
    if (!sessionIdCierre) {
      informe.revocacionNoConfirmada = true;
      return;
    }
    try {
      const fila = normalizarFila(await deps.leerSesion(sessionIdCierre));
      informe.revocacionNoConfirmada = !(fila.revocada && fila.motivo === 'LOGOUT' && (idUsuarioCierre == null || fila.idUsuario === idUsuarioCierre));
    } catch {
      informe.revocacionNoConfirmada = true;
    }
  };

  const cerrarSiHaceFalta = async () => {
    if (!sesionCreada || logoutEnviado) {
      if (sesionCreada) await confirmarRevocacion();
      return;
    }
    if (!accessParaCierre) {
      informe.revocacionNoConfirmada = true;
      return;
    }
    logoutEnviado = true;
    try {
      const cierre = await deps.solicitar(`${API_AUTENTICADA}${RUTAS.logout}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessParaCierre}` },
      });
      if (cierre.codigo !== 200) {
        await confirmarRevocacion();
        return;
      }
      validarLogout(cierre.json);
      await confirmarRevocacion();
    } catch {
      await confirmarRevocacion();
    }
  };

  try {
    const config = await deps.cargarConfig();
    validarOrigenAutenticado(config.apiOrigen);
    validarConfigDb(config.db);
    if (config.apiOrigen !== API_AUTENTICADA) throw new Error('config_api');

    informe.detuvoEn = 'credenciales';
    const cred = await deps.leerCredenciales();
    if (!cred || typeof cred.identificador !== 'string' || typeof cred.password !== 'string' || !cred.identificador || !cred.password) {
      throw new Error('credenciales_formato');
    }

    informe.detuvoEn = 'estado_inicial';
    const estadoInicial = await deps.leerEstado();
    antes = {
      conteos: normalizarConteos(estadoInicial.conteos),
      sesiones: (estadoInicial.sesiones || []).map(normalizarResumen),
    };

    informe.detuvoEn = 'login';
    const login = await deps.solicitar(`${config.apiOrigen}${RUTAS.login}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: cred.identificador, password: cred.password }),
    });
    const tokenLogin = login.json?.data?.access_token;
    const sidLogin = login.json?.data?.sessionId;
    if (login.codigo === 200) {
      sesionCreada = true;
      if (typeof tokenLogin === 'string') accessParaCierre = tokenLogin;
      if (typeof sidLogin === 'string') sessionIdCierre = sidLogin;
    }
    if (login.codigo !== 200) throw new Error('login_http');
    sesion = validarSesionEmitida(login.json, null);
    accessParaCierre = sesion.access;
    sessionIdCierre = sesion.sessionId;
    idUsuarioCierre = sesion.idUsuario;
    if (antes.sesiones.some((fila) => fila.idSesion === sesion.sessionId)) throw new Error('sesion_fila');
    informe.pasos.push(paso('POST', RUTAS.login, 200, 'ok'));

    informe.detuvoEn = 'sesion_db';
    const fila = normalizarFila(await deps.leerSesion(sesion.sessionId));
    exigirFilaActiva(fila, sesion);

    informe.detuvoEn = 'protegida';
    const mias = await deps.solicitar(`${config.apiOrigen}${RUTAS.mias}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessParaCierre}` },
    });
    validarMias(mias);
    informe.pasos.push(paso('GET', RUTAS.mias, 200, 'ok'));

    informe.detuvoEn = 'refresh';
    const refresh = await deps.solicitar(`${config.apiOrigen}${RUTAS.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: sesion.refresh, sessionId: sesion.sessionId }),
    });
    if (refresh.codigo === 200 && typeof refresh.json?.data?.access_token === 'string') {
      accessParaCierre = refresh.json.data.access_token;
    }
    if (refresh.codigo !== 200) throw new Error('refresh_http');
    const renovada = validarSesionEmitida(refresh.json, sesion);
    accessParaCierre = renovada.access;
    sessionIdCierre = renovada.sessionId;

    informe.detuvoEn = 'rotacion';
    const filaRenovada = normalizarFila(await deps.leerSesion(renovada.sessionId));
    if (filaRenovada.hash === fila.hash) throw new Error('hash_no_rotado');
    if (filaRenovada.venceUnix !== fila.venceUnix || filaRenovada.venceUnix !== renovada.sessionExp || filaRenovada.revocada) {
      throw new Error('expiracion_distinta');
    }
    informe.pasos.push(paso('POST', RUTAS.refresh, 200, 'rotacion_ok'));

    informe.detuvoEn = 'logout';
    logoutEnviado = true;
    const logout = await deps.solicitar(`${config.apiOrigen}${RUTAS.logout}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessParaCierre}` },
    });
    if (logout.codigo !== 200) throw new Error('logout_http');
    validarLogout(logout.json);
    const filaCerrada = normalizarFila(await deps.leerSesion(renovada.sessionId));
    if (!filaCerrada.revocada || filaCerrada.motivo !== 'LOGOUT' || filaCerrada.idUsuario !== renovada.idUsuario) {
      throw new Error('sesion_fila');
    }
    informe.pasos.push(paso('DELETE', RUTAS.logout, 200, 'ok'));

    informe.detuvoEn = 'revocacion';
    const reuso = await deps.solicitar(`${config.apiOrigen}${RUTAS.mias}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessParaCierre}` },
    });
    validarRevocacion(reuso);
    informe.pasos.push(paso('GET', RUTAS.mias, 401, 'revocacion_inmediata'));

    informe.detuvoEn = 'estado_final';
    const estadoFinal = await deps.leerEstado();
    const despues = {
      conteos: normalizarConteos(estadoFinal.conteos),
      sesiones: (estadoFinal.sesiones || []).map(normalizarResumen),
    };
    if (!mismosConteos(antes.conteos, despues.conteos)) throw new Error('conteos_distintos');
    compararSesiones(antes.sesiones, despues.sesiones, { id: renovada.sessionId, idUsuario: renovada.idUsuario });
    informe.conteos = { antes: antes.conteos, despues: despues.conteos };
    informe.sesion = {
      id: renovada.sessionId,
      idUsuario: renovada.idUsuario,
      revocada: true,
      motivo: 'LOGOUT',
      refreshRotado: true,
      expiracionConservada: true,
    };
    informe.completo = true;
    informe.detuvoEn = '';
    informe.error = '';
  } catch (error) {
    informe.error = codigoError(error);
    if (!sesionCreada) informe.revocacionNoConfirmada = false;
    else if (!logoutEnviado) await cerrarSiHaceFalta();
    else if (informe.detuvoEn === 'logout') await confirmarRevocacion();
    else informe.revocacionNoConfirmada = false;
  } finally {
    try {
      await deps.borrarCredenciales();
      informe.credencialesEliminadas = true;
    } catch {
      informe.credencialesEliminadas = false;
    }
  }
  return informe;
}

export async function sondear(urlValor, opciones) {
  const destino = exigirApi(urlValor);
  const respuesta = await fetch(urlValor, { ...opciones, redirect: 'manual' });
  const cuerpo = await respuesta.text();
  return registrarRespuesta(
    opciones.method || 'GET',
    urlValor,
    respuesta.status,
    respuesta.headers.get('content-type'),
    cuerpo,
    respuesta.headers.get('location'),
  );
}

export async function sondaSinAutenticacion() {
  const login = await sondear(`${API_ORIGEN}${RUTAS.login}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: FRONT_ORIGEN },
    body: '{}',
  });
  const mias = await sondear(`${API_ORIGEN}${RUTAS.mias}`, {
    method: 'GET',
    headers: { Origin: FRONT_ORIGEN },
  });
  const preflight = await fetch(`${API_ORIGEN}${RUTAS.login}`, {
    method: 'OPTIONS',
    redirect: 'manual',
    headers: {
      Origin: FRONT_ORIGEN,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  const origen = preflight.headers.get('access-control-allow-origin');
  const credenciales = preflight.headers.get('access-control-allow-credentials');
  if (preflight.status !== 204 || origen !== FRONT_ORIGEN || credenciales !== 'true') {
    throw new Error(`cors:${preflight.status}`);
  }
  if (login.codigo !== 400 || !login.mensaje) throw new Error(`login_validacion:${login.codigo}`);
  if (mias.codigo !== 401) throw new Error(`mias:${mias.codigo}`);
  return {
    login,
    mias,
    cors: { codigo: preflight.status, origen, credenciales },
    paginaAngularNoEsLogin: esLoginDeApi(`${FRONT_ORIGEN}/auth/login`, 200) === false,
  };
}

function leerEnv(ruta) {
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch {
    throw new Error('config_db');
  }
  const mapa = {};
  for (const linea of texto.split(/\r?\n/)) {
    const coincidencia = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!coincidencia) continue;
    mapa[coincidencia[1]] = coincidencia[2].trim().replace(/^["']|["']$/g, '');
  }
  return {
    DB_HOST: mapa.DB_HOST || '',
    DB_PORT: mapa.DB_PORT || '',
    DB_USER: mapa.DB_USER || '',
    DB_PASSWORD: mapa.DB_PASSWORD || '',
    DB_DATABASE: mapa.DB_DATABASE || '',
  };
}

async function obtenerConexion(env, estado) {
  if (estado.conexion) return estado.conexion;
  const mysql = require(path.join(raizRepo, 'erp-backend', 'node_modules', 'mysql2', 'promise.js'));
  const conexion = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_DATABASE,
    timezone: '-05:00',
    dateStrings: true,
    multipleStatements: false,
  });
  estado.conexion = conexion;
  await conexion.query("SET time_zone = '-05:00'");
  const [filas] = await conexion.query('SELECT DATABASE() AS nombre');
  if (filas[0]?.nombre !== 'app_clinica_lopez') throw new Error('config_db');
  return conexion;
}

async function leerEstadoClinico(conexion) {
  const [sesiones] = await conexion.query(
    `SELECT id_sesion AS idSesion, id_usuario AS idUsuario, motivo_revocacion AS motivo, fecha_revocacion IS NOT NULL AS revocada
     FROM cli_sesion`,
  );
  const [conteos] = await conexion.query(
    `SELECT (SELECT COUNT(*) FROM sis_usuario) AS usuarios,
            (SELECT COUNT(*) FROM cli_usuario_unidad) AS membresias,
            (SELECT COUNT(*) FROM cli_paciente) AS pacientes,
            (SELECT COUNT(*) FROM cli_cita) AS citas,
            (SELECT COUNT(*) FROM cli_consulta) AS consultas,
            (SELECT COUNT(*) FROM cli_documento) AS documentos,
            (SELECT COUNT(*) FROM cli_tratamiento) AS tratamientos,
            (SELECT COUNT(*) FROM sis_auditoria) AS auditoria`,
  );
  return {
    sesiones: sesiones.map((fila) => ({
      idSesion: fila.idSesion,
      idUsuario: Number(fila.idUsuario),
      revocada: Number(fila.revocada) === 1,
      motivo: fila.motivo,
    })),
    conteos: conteos[0],
  };
}

async function leerSesionClinica(conexion, idSesion) {
  if (!UUID_SESION.test(String(idSesion || ''))) throw new Error('sesion_fila');
  const [filas] = await conexion.query(
    `SELECT id_sesion AS idSesion, id_usuario AS idUsuario, hash_refresh AS hash,
            UNIX_TIMESTAMP(vence_en) AS venceUnix, fecha_revocacion IS NOT NULL AS revocada,
            motivo_revocacion AS motivo
     FROM cli_sesion WHERE id_sesion = ? LIMIT 1`,
    [idSesion],
  );
  return filas[0] || null;
}

export async function ejecutarCicloReal() {
  const rutaCred = path.join(raizRepo, 'storage', 'fase2e8', 'acceso.txt');
  const rutaEnv = path.join(raizRepo, 'erp-backend', '.env');
  const estado = { conexion: null };
  try {
    return await ejecutarCiclo({
      cargarConfig: async () => ({ apiOrigen: API_AUTENTICADA, db: leerEnv(rutaEnv) }),
      leerCredenciales: async () => {
        try {
          return leerCredencialesTexto(fs.readFileSync(rutaCred, 'utf8'));
        } catch (error) {
          if (error?.message === 'credenciales_formato') throw error;
          throw new Error('credenciales_ausentes');
        }
      },
      borrarCredenciales: async () => {
        await fs.promises.rm(rutaCred, { force: true });
      },
      solicitar: (url, opciones) => solicitarApi(url, opciones, fetch),
      leerEstado: async () => leerEstadoClinico(await obtenerConexion(leerEnv(rutaEnv), estado)),
      leerSesion: async (id) => leerSesionClinica(await obtenerConexion(leerEnv(rutaEnv), estado), id),
    });
  } finally {
    if (estado.conexion) {
      try { await estado.conexion.end(); } catch { /* el informe ya quedó cerrado */ }
    }
  }
}

function esEntrada() {
  const argumento = process.argv[1];
  return !!argumento && import.meta.url === pathToFileURL(argumento).href;
}

if (esEntrada()) {
  const autenticado = process.argv.includes('--autenticado');
  const sonda = process.argv.includes('--sonda');
  if (autenticado === sonda) {
    console.error('Uso: node scripts/fase2e10-destino.mjs --sonda | --autenticado');
    process.exitCode = 2;
  } else if (autenticado) {
    const informe = await ejecutarCicloReal();
    console.log(JSON.stringify(informe));
    if (!informe.completo) process.exitCode = 1;
  } else {
    console.log(JSON.stringify(await sondaSinAutenticacion()));
  }
}
