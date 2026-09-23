# Módulos de negocio (`erp/`)

Aquí viven las features comerciales del POS/ERP (productos, ventas, inventario, caja, sucursales, etc.).

## Reglas

- Estructura plana por feature: `.dto.ts` · `.service.ts` · `.controller.ts` · `.module.ts`
- Registrar cada módulo nuevo en `apps/api/src/api.module.ts`
- Auth/permisos: usar guards existentes + `@RequirePermissions` — no reinventar
- Convenciones: `erp-backend/docs/CONVENCIONES-POS.md` + `CLAUDE.md`

## Actual

| Carpeta | Estado |
|---------|--------|
| `dashboard/` | Activo (resumen) |
| *(siguientes fases)* | productos, ventas, inventario, caja, … |
