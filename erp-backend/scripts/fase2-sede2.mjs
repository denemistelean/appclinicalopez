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

const conn = await mysql.createConnection({
  host: envValue('DB_HOST') || 'localhost',
  port: Number(envValue('DB_PORT') || 3306),
  user: envValue('DB_USER') || 'root',
  password: envValue('DB_PASSWORD'),
  database: envValue('DB_DATABASE'),
});

const login = await fetch('http://localhost:3789/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ correo: 'admin', password: '123456' }),
});
const loginJson = await login.json();
const token = loginJson?.data?.access_token || loginJson?.data?.token;
const citas = await fetch('http://localhost:3789/api/agenda/citas?page=1&limit=1', {
  headers: { Authorization: `Bearer ${token}`, 'X-Unidad-Id': '1' },
});
const citasJson = await citas.json();
const base = (citasJson?.data?.data || [])[0];

await conn.query(
  `INSERT INTO cli_usuario_unidad (id_usuario, id_unidad, id_rol, estado_registro, id_usuario_crea)
   VALUES (1, 2, 1, 'ACTIVO', 1)`,
);
let idNueva = null;
try {
  const creada = await fetch('http://localhost:3789/api/agenda/citas', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Unidad-Id': '2',
    },
    body: JSON.stringify({
      id_sede: 2,
      id_paciente: base.id_paciente,
      id_tipo_cita: base.id_tipo_cita,
      id_personal: base.id_personal,
      id_tratamiento: base.id_tratamiento || undefined,
      fecha_cita: '2027-05-20',
      hora_inicio: '11:00:00',
      id_unidad: 1,
    }),
  });
  const body = await creada.json();
  console.log('POST_SEDE2', creada.status);
  idNueva = body?.data?.id || null;
  if (creada.status === 400) {
    const sinCliente = await fetch('http://localhost:3789/api/agenda/citas', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Unidad-Id': '2',
      },
      body: JSON.stringify({
        id_sede: 2,
        id_paciente: base.id_paciente,
        id_tipo_cita: base.id_tipo_cita,
        id_personal: base.id_personal,
        id_tratamiento: base.id_tratamiento || undefined,
        fecha_cita: '2027-05-20',
        hora_inicio: '11:00:00',
      }),
    });
    const body2 = await sinCliente.json();
    idNueva = body2?.data?.id || null;
    console.log('POST_SEDE2_LIMPIO', sinCliente.status, 'id', idNueva || '');
  }
  if (idNueva) {
    const [row] = await conn.query(`SELECT id_sede, id_unidad FROM cli_cita WHERE id_cita=?`, [idNueva]);
    console.log('ATRIBUCION', JSON.stringify(row[0]));
    await fetch(`http://localhost:3789/api/agenda/citas/${idNueva}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'X-Unidad-Id': '2' },
    });
    await conn.query(`DELETE FROM cli_cita_recurso_humano WHERE id_cita=?`, [idNueva]);
    await conn.query(`DELETE FROM cli_cita_tratamiento WHERE id_cita=?`, [idNueva]);
    await conn.query(`DELETE FROM cli_cita WHERE id_cita=?`, [idNueva]);
  }
} finally {
  await conn.query(`DELETE FROM cli_usuario_unidad WHERE id_usuario=1 AND id_unidad=2`);
  const [rest] = await conn.query(
    `SELECT
       (SELECT COUNT(*) FROM cli_usuario_unidad WHERE id_unidad=2) sorela,
       (SELECT COUNT(*) FROM cli_cita WHERE estado_registro='ACTIVO') citas,
       (SELECT COUNT(*) FROM cli_cita WHERE id_sede=2) citas_sede2`,
  );
  console.log('LIMPIEZA', JSON.stringify(rest[0]));
  await conn.end();
}
