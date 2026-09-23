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
