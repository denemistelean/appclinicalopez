# APP Clínica López

Base NestJS + Angular + MariaDB (núcleo `sis_*`) para el sistema de **Clínica López**.

Clonada desde el stack `erp-nestjs-angular-base` (vía base limpia appCiberCafeZRV), **sin módulos de dominio**.

## Qué incluye

| Capa | Contenido |
|------|-----------|
| **BD** | Núcleo `sis_*` + patches `cli_*` (sedes, personal, tratamientos, inventario, pacientes, historia, agenda, HC, transversales) |
| **Backend** | Auth JWT, usuarios, roles/permisos, mail, dashboard + módulos clínicos en `erp/` |
| **Frontend** | Login, layout admin (selector de sede), usuarios, permisos, dashboard + features clínicas |

## Requisitos

- Node.js 20+
- XAMPP / MariaDB
- Angular CLI 21

## 1. Base de datos

```bash
mysql -u root -p < bd/BD_CLINICA_LOPEZ_CORE.sql
```

Luego aplicar patches de dominio clínico (en orden):

```bash
mysql -u root -p app_clinica_lopez < bd/patches/000_fundacion_roles.sql
mysql -u root -p app_clinica_lopez < bd/patches/001_cli_sedes.sql
mysql -u root -p app_clinica_lopez < bd/patches/002_cli_personal.sql
mysql -u root -p app_clinica_lopez < bd/patches/003_cli_tratamientos.sql
mysql -u root -p app_clinica_lopez < bd/patches/004_cli_inventario.sql
mysql -u root -p app_clinica_lopez < bd/patches/005_cli_pacientes.sql
mysql -u root -p app_clinica_lopez < bd/patches/006_cli_historia_paciente.sql
mysql -u root -p app_clinica_lopez < bd/patches/007_cli_agenda.sql
mysql -u root -p app_clinica_lopez < bd/patches/008_cli_historia_clinica.sql
mysql -u root -p app_clinica_lopez < bd/patches/009_cli_transversales.sql
mysql -u root -p app_clinica_lopez < bd/patches/010_fix_seed_acciones.sql
# …continuar en orden hasta el último patch (p. ej. 040_planes_sesiones_pagos.sql)
```

**Permisos ADMIN_CLINICA / OMNI_ADMINISTRADOR:** a partir del patch `040`, **todo patch futuro** que asigne permisos a `ADMIN_CLINICA` **debe** asignarlos también a `OMNI_ADMINISTRADOR` (mismo `INSERT IGNORE` / `WHERE r.nombre IN ('ADMIN_CLINICA','OMNI_ADMINISTRADOR')`). OMNI hereda el alcance clínico de `ADMIN_CLINICA`, no el de `SUPERADMIN` (sin USUARIOS/SEGURIDAD).

**Agenda / RECEPCION:** el seed no otorga `ver_cita` a RECEPCION. Quien agenda en producción debe tener `ver_cita` (y normalmente `crear_cita`) asignados desde **Roles y permisos** en la app, no desde un patch. Sin `ver_cita` no hay agenda ni aviso de sesiones pendientes.

**Pagos legados:** `tipo_pago` NULL se deja como está; la UI muestra «Pago» genérico (no se reclasifica).

**FKs HD:** pendiente de un patch dedicado en otro despliegue (tras buscar huérfanos en desarrollo, con respaldo; `ON DELETE RESTRICT`). Prioridad: `cli_hd_cita_sesion.id_hd_paquete`, `cli_hd_atencion.id_hd_paquete`, `cli_hd_paquete.id_item`.

**Patch 041 (segundo despliegue):** `bd/patches/041_sis_auditoria_id_unidad.sql` — columna nullable `sis_auditoria.id_unidad` + índice; no rellena históricos. Aplicar antes de uso intensivo de OMNI. El backend ya escribe la columna si existe.

Guía corta para el personal: `docs/guia-planes-sesiones-pagos.md`.

### Patch 040 — aplicar y verificar (este despliegue)

```bash
# 1) Respaldo
# 2) Aplicar dos veces en desarrollo (idempotente) y verificar:
mysql -u root -p app_clinica_lopez < bd/patches/040_planes_sesiones_pagos.sql
mysql -u root -p app_clinica_lopez < bd/patches/040_planes_sesiones_pagos.sql
```

Comprobación rápida:

```sql
SHOW COLUMNS FROM cli_pago LIKE 'tipo_pago';
SHOW COLUMNS FROM cli_pago LIKE 'comprobante_%';
SHOW COLUMNS FROM cli_unidad LIKE 'requiere_comprobante';
SHOW COLUMNS FROM cli_catalogo_item LIKE 'intervalo_dias_sugerido';
SELECT nombre FROM sis_rol WHERE nombre = 'OMNI_ADMINISTRADOR' AND estado_registro = 'ACTIVO';
SELECT a.codigo_accion
FROM sis_accion a
WHERE a.codigo_accion IN ('restituir_sesion','ajustar_pago','administrar_configuracion_finanzas')
  AND a.estado_registro = 'ACTIVO';
SELECT INDEX_NAME FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_hd_cita_sesion'
  AND INDEX_NAME = 'idx_hd_cita_sesion_paquete';
```

### Checklist de despliegue (040)

1. Respaldo de la BD.
2. Aplicar `040` en desarrollo **dos veces** + SQL de verificación de arriba.
3. Compilar frontend y backend sin errores nuevos.
4. Ejecutar los 8 casos manuales con roles reales.
5. Producción: respaldo → patch 040 → reinicio API → despliegue frontend.
6. Asignar `OMNI_ADMINISTRADOR` solo a cuentas de confianza; revisar que nadie lo tenga por accidente.
7. En Roles y permisos: dar `ver_cita` (y `crear_cita` si corresponde) al rol que agenda de verdad.
8. Avisar al personal con `docs/guia-planes-sesiones-pagos.md`.

### Segundo despliegue (041, opcional pero recomendado)

```bash
mysql -u root -p app_clinica_lopez < bd/patches/041_sis_auditoria_id_unidad.sql
# Verificar: SHOW COLUMNS FROM sis_auditoria LIKE 'id_unidad';
```

Convenciones: ver `docs/convenciones-dominio-clinico.md`.

Usuario inicial:

- Correo / usuario: `admin`
- Password: `123456` *(cambiar al primer ingreso)*

## 2. Backend

```bash
cd erp-backend
copy .env.example .env
# Editar DB_PASSWORD y JWT_SECRET
npm install
npm run start:dev
```

API: `http://localhost:3789/api` (puerto 3789 para no chocar con otros sistemas).

Escucha local, cookies, HSTS y la entrada `app.js` de Passenger: `erp-backend/docs/despliegue-https.md`.

## 3. Frontend

```bash
cd erp-frontend
npm install
npm start
```

Abrir: `http://localhost:4202`

## Agregar un módulo de dominio

1. Tabla(s) SQL + `sis_modulo` / `sis_accion` / `sis_permiso`
2. Backend en `erp-backend/apps/api/src/erp/<modulo>/`
3. Frontend en `erp-frontend/src/app/features/<modulo>/`
4. Ruta en `app.routes.ts` + ítem en `sidebar.ts`
5. Seguir `erp-backend/CLAUDE.md` y la skill `erp-nestjs-angular-base`
