# Convenciones dominio clínico (`cli_*`)

## Prefijos y núcleo

- Tablas de dominio: `cli_*`.
- Núcleo `sis_*`: no alterar procedures ni hacer `DROP DATABASE` en patches.
- Soft delete: `estado_registro ENUM('ACTIVO','ELIMINADO')`.
- Trazabilidad de fila: `id_usuario_crea`, `id_usuario_mod`.
- Fechas clínicas de negocio sí se modelan (`fecha_cita`, `fecha_medida`, etc.).

## Patches SQL

Ubicación: `bd/patches/NNN_descripcion.sql`

Orden de aplicación (instalación existente):

```bash
mysql -u root -p app_clinica_lopez < bd/patches/000_fundacion_roles.sql
mysql -u root -p app_clinica_lopez < bd/patches/001_cli_sedes.sql
# ... siguientes en orden numérico
```

Cada patch incluye `CREATE TABLE` + seed `sis_modulo` / `sis_accion` / permisos SUPERADMIN.

## Checklist por módulo

1. Migración limpia sobre esquema actual.
2. DTOs + errores consistentes.
3. Listados con `page` / `limit` / `search` → `{ data, meta }`.
4. Filtro `id_sede` cuando aplique + selector global.
5. UI con componentes shared existentes.
6. Integraciones vía API real (no hardcode).
7. Reglas de negocio no triviales cubiertas.

## Integraciones

- Eventos Nest (`EventEmitter`): p.ej. `cita.completada` → inventario FEFO.
- No inyectar services entre módulos de dominio.
