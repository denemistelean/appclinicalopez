import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { resolve } from 'path';

const require = createRequire(resolve('package.json'));
const mysql = require('mysql2/promise');

function envValue(name) {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.startsWith(name + '='));
  return line ? line.slice(name.length + 1).trim() : '';
}

const base = 'http://localhost:3789/api';
const results = [];

function ok(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'OK' : 'FALLO'}  ${name}  ${detail}`);
}

async function api(path, { method = 'GET', token, unidad, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (unidad != null) headers['X-Unidad-Id'] = String(unidad);
  const res = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const conn = await mysql.createConnection({
  host: envValue('DB_HOST') || 'localhost',
  port: Number(envValue('DB_PORT') || 3306),
  user: envValue('DB_USER') || 'root',
  password: envValue('DB_PASSWORD'),
  database: envValue('DB_DATABASE'),
  timezone: '-05:00',
});

const [antes] = await conn.query(
  `SELECT
     (SELECT COUNT(*) FROM cli_cita WHERE estado_registro='ACTIVO') citas,
     (SELECT COUNT(*) FROM cli_paciente WHERE estado_registro='ACTIVO') pacientes,
     (SELECT COUNT(*) FROM cli_cita WHERE id_unidad=1 AND estado_registro='ACTIVO') citas_lopez,
     (SELECT COUNT(*) FROM cli_pago) pagos,
     (SELECT SUM(precio_base) FROM cli_tratamiento) precio_base`,
);

const login = await api('/auth/login', {
  method: 'POST',
  body: { correo: 'admin', password: '123456' },
});
const token =
  login.json?.data?.access_token ||
  login.json?.data?.token ||
  login.json?.access_token ||
  login.json?.token;
ok('login', login.status === 200 && !!token, `HTTP ${login.status}`);
if (!token) {
  console.log(JSON.stringify(login.json, null, 2).slice(0, 500));
  await conn.end();
  process.exit(1);
}

const citas = await api('/agenda/citas?page=1&limit=100', { token });
const lista = citas.json?.data?.data || citas.json?.data || [];
ok(
  'listado citas solo Lopez',
  citas.status === 200 && Array.isArray(lista) && lista.length === 13 && lista.every((c) => Number(c.id_unidad) === 1),
  `HTTP ${citas.status} total=${Array.isArray(lista) ? lista.length : 'no-array'}`,
);

const pacientes = await api('/pacientes?page=1&limit=50', { token });
const pacs = pacientes.json?.data?.data || pacientes.json?.data || [];
ok(
  'padron pacientes',
  pacientes.status === 200 && Array.isArray(pacs) && pacs.length === 4,
  `HTTP ${pacientes.status} total=${Array.isArray(pacs) ? pacs.length : 'no-array'}`,
);

const sedes = await api('/sedes?page=1&limit=20&estado=ACTIVA', { token });
const sedeRows = sedes.json?.data?.data || [];
ok(
  'sedes de la empresa activa',
  sedes.status === 200 && sedeRows.length === 1 && Number(sedeRows[0].id_sede) === 1,
  `HTTP ${sedes.status} sedes=${sedeRows.map((s) => s.id_sede).join(',')}`,
);

const sedeAjena = await api('/sedes/2', { token });
ok('sede de otra empresa', sedeAjena.status === 403, `HTTP ${sedeAjena.status}`);

const sinHeader = await api('/agenda/citas?page=1&limit=5', { token });
ok('una membresia sin encabezado', sinHeader.status === 200, `HTTP ${sinHeader.status}`);

const headerAjeno = await api('/agenda/citas?page=1&limit=5', { token, unidad: 2 });
ok('empresa sin membresia', headerAjeno.status === 403, `HTTP ${headerAjeno.status}`);

const headerInvalido = await api('/agenda/citas', { token, unidad: 'abc' });
ok('encabezado invalido', headerInvalido.status === 400, `HTTP ${headerInvalido.status}`);

const baseCita = lista[0];
const cuerpoManipulado = {
  id_sede: 1,
  id_paciente: baseCita.id_paciente,
  id_tipo_cita: baseCita.id_tipo_cita,
  id_personal: baseCita.id_personal,
  id_tratamiento: baseCita.id_tratamiento || undefined,
  fecha_cita: '2027-03-15',
  hora_inicio: '07:00:00',
  id_unidad: 2,
};
const manipulado = await api('/agenda/citas', { method: 'POST', token, body: cuerpoManipulado });
ok(
  'id_unidad del cliente no cambia la empresa',
  manipulado.status === 400,
  `HTTP ${manipulado.status}`,
);

const creada = await api('/agenda/citas', {
  method: 'POST',
  token,
  body: { ...cuerpoManipulado, id_unidad: undefined },
});
const idNueva = creada.json?.data?.id;
let unidadNueva = null;
if (idNueva) {
  const [row] = await conn.query(`SELECT id_unidad, id_sede FROM cli_cita WHERE id_cita=?`, [idNueva]);
  unidadNueva = row[0];
}
ok(
  'cita sede 1 queda en Lopez',
  creada.status === 201 || creada.status === 200,
  `HTTP ${creada.status} id_unidad=${unidadNueva?.id_unidad}`,
);
ok(
  'atribucion sede 1',
  Number(unidadNueva?.id_unidad) === 1 && Number(unidadNueva?.id_sede) === 1,
  JSON.stringify(unidadNueva),
);

const sorela = await api('/agenda/citas', {
  method: 'POST',
  token,
  body: { ...cuerpoManipulado, id_sede: 2, id_unidad: undefined },
});
ok('cita en sede de otra empresa', sorela.status === 403, `HTTP ${sorela.status}`);

const pago = await api('/facturacion/pagos', {
  method: 'POST',
  token,
  body: {
    id_paciente: baseCita.id_paciente,
    id_sede: 1,
    fecha_pago: '2026-10-20',
    monto: 10,
    metodo_pago: 'EFECTIVO',
  },
});
ok('finanzas de Lopez bloqueadas', pago.status === 403, `HTTP ${pago.status}`);

const [tmp] = await conn.query(
  `INSERT INTO cli_cita
    (id_sede, id_unidad, id_tipo_cita, id_paciente, id_personal, fecha_cita, hora_inicio, hora_fin, estado, id_usuario_crea)
   SELECT 2, 2, id_tipo_cita, id_paciente, id_personal, '2027-04-01', '08:00:00', '08:30:00', 'PENDIENTE', 1
   FROM cli_cita WHERE id_cita=?`,
  [baseCita.id_cita],
);
const idAjena = Number(tmp.insertId);
const verAjena = await api(`/agenda/citas/${idAjena}`, { token });
ok('detalle de cita de otra empresa', verAjena.status === 403, `HTTP ${verAjena.status}`);
await conn.query(`DELETE FROM cli_cita WHERE id_cita=?`, [idAjena]);

const resumen = await api('/reportes/resumen', { token });
const estados = resumen.json?.data?.citas_por_estado || [];
const totalResumen = estados.reduce((s, r) => s + Number(r.total || 0), 0);
ok(
  'resumen no mezcla empresas',
  resumen.status === 200 && totalResumen >= 13,
  `HTTP ${resumen.status} citas_en_resumen=${totalResumen}`,
);

const nulas = await api('/agenda/citas/999999', { token });
ok('id inexistente', nulas.status === 404, `HTTP ${nulas.status}`);

const paralelas = await Promise.all([
  api('/agenda/citas?page=1&limit=20', { token, unidad: 1 }),
  api('/agenda/citas?page=1&limit=20', { token, unidad: 2 }),
  api('/pacientes?page=1&limit=20', { token, unidad: 1 }),
]);
ok(
  'solicitudes simultaneas',
  paralelas[0].status === 200 && paralelas[1].status === 403 && paralelas[2].status === 200,
  paralelas.map((r) => r.status).join(','),
);

if (idNueva) {
  await api(`/agenda/citas/${idNueva}`, { method: 'DELETE', token });
  await conn.query(`DELETE FROM cli_cita_recurso_humano WHERE id_cita=?`, [idNueva]);
  await conn.query(`DELETE FROM cli_cita_tratamiento WHERE id_cita=?`, [idNueva]);
  await conn.query(`DELETE FROM cli_cita WHERE id_cita=?`, [idNueva]);
}

const [despues] = await conn.query(
  `SELECT
     (SELECT COUNT(*) FROM cli_cita WHERE estado_registro='ACTIVO') citas,
     (SELECT COUNT(*) FROM cli_paciente WHERE estado_registro='ACTIVO') pacientes,
     (SELECT COUNT(*) FROM cli_pago) pagos,
     (SELECT SUM(precio_base) FROM cli_tratamiento) precio_base,
     (SELECT COUNT(*) FROM cli_cita WHERE id_unidad IS NULL AND estado_registro='ACTIVO') citas_sin_unidad`,
);
ok(
  'conteos clinicos intactos',
  Number(despues[0].citas) === Number(antes[0].citas) &&
    Number(despues[0].pacientes) === 4 &&
    Number(despues[0].pagos) === Number(antes[0].pagos) &&
    Number(despues[0].precio_base) === Number(antes[0].precio_base) &&
    Number(despues[0].citas_sin_unidad) === 0,
  `antes=${antes[0].citas}/${antes[0].pacientes} despues=${despues[0].citas}/${despues[0].pacientes} pagos=${despues[0].pagos} precio_base=${despues[0].precio_base}`,
);

const [roles] = await conn.query(
  `SELECT id_rol, nombre FROM sis_rol WHERE estado_registro='ACTIVO' ORDER BY id_rol`,
);
const limitado = roles.find((r) => Number(r.id_rol) !== 1);
if (limitado) {
  await conn.query(
    `INSERT INTO cli_usuario_unidad (id_usuario, id_unidad, id_rol, estado_registro, id_usuario_crea)
     VALUES (1, 2, ?, 'ACTIVO', 1)`,
    [limitado.id_rol],
  );
  const sinEmpresa = await api('/agenda/citas?page=1&limit=5', { token });
  const permisosLopez = await api('/seguridad/permisos', { token, unidad: 1 });
  const permisosSorela = await api('/seguridad/permisos', { token, unidad: 2 });
  const nLopez = (permisosLopez.json?.data?.permisos || permisosLopez.json?.data?.data?.permisos || []).length;
  const nSorela = (permisosSorela.json?.data?.permisos || permisosSorela.json?.data?.data?.permisos || []).length;
  ok('varias membresias exigen encabezado', sinEmpresa.status === 400, `HTTP ${sinEmpresa.status}`);
  ok(
    'permisos de la membresia activa',
    permisosLopez.status === 200 && permisosSorela.status === 200 && nLopez !== nSorela,
    `rol ${limitado.id_rol} lopez=${nLopez} sorela=${nSorela}`,
  );
  await conn.query(
    `DELETE FROM cli_usuario_unidad WHERE id_usuario=1 AND id_unidad=2`,
  );
} else {
  ok('permisos de la membresia activa', false, 'no hay un segundo rol para comparar');
}

await conn.end();
const fallos = results.filter((r) => !r.pass);
console.log(`RESULTADO ${results.length - fallos.length}/${results.length}`);
process.exit(fallos.length ? 1 : 0);
