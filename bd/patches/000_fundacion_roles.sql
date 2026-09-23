-- ==============================================================================
-- PATCH 000 — Fundación: roles clínicos base (sin tocar procedures sis_*)
-- BD: app_clinica_lopez
-- ==============================================================================
USE app_clinica_lopez;

INSERT INTO `sis_rol` (`nombre`, `descripcion`, `estado_registro`)
SELECT 'ADMIN_CLINICA', 'Administración clínica multi-sede', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_rol WHERE nombre = 'ADMIN_CLINICA' AND estado_registro = 'ACTIVO');

INSERT INTO `sis_rol` (`nombre`, `descripcion`, `estado_registro`)
SELECT 'RECEPCION', 'Recepción y agenda', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_rol WHERE nombre = 'RECEPCION' AND estado_registro = 'ACTIVO');

INSERT INTO `sis_rol` (`nombre`, `descripcion`, `estado_registro`)
SELECT 'ESPECIALISTA', 'Personal clínico / especialista', 'ACTIVO'
WHERE NOT EXISTS (SELECT 1 FROM sis_rol WHERE nombre = 'ESPECIALISTA' AND estado_registro = 'ACTIVO');

-- Permisos actuales del core para ADMIN_CLINICA (se ampliarán por fase)
INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
CROSS JOIN sis_accion a
WHERE r.nombre = 'ADMIN_CLINICA'
  AND a.estado_registro = 'ACTIVO'
  AND a.codigo_accion IN ('ver_dashboard', 'ver_usuario', 'ver_seguridad');

INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
CROSS JOIN sis_accion a
WHERE r.nombre IN ('RECEPCION', 'ESPECIALISTA')
  AND a.estado_registro = 'ACTIVO'
  AND a.codigo_accion = 'ver_dashboard';
