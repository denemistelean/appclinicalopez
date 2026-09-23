-- ==============================================================================
-- PATCH 010 — Corregir seed de acciones/permisos (alias `desc` era palabra reservada)
-- ==============================================================================
USE app_clinica_lopez;

DELIMITER //
DROP PROCEDURE IF EXISTS cli_seed_accion//
CREATE PROCEDURE cli_seed_accion(
  IN p_modulo VARCHAR(50),
  IN p_codigo VARCHAR(50),
  IN p_descripcion VARCHAR(200),
  IN p_tipo VARCHAR(20)
)
BEGIN
  DECLARE v_id_modulo INT;
  SELECT id_modulo INTO v_id_modulo FROM sis_modulo WHERE nombre = p_modulo AND estado_registro = 'ACTIVO' LIMIT 1;
  IF v_id_modulo IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM sis_accion
      WHERE id_modulo = v_id_modulo AND codigo_accion = p_codigo AND estado_registro = 'ACTIVO'
    ) THEN
      INSERT INTO sis_accion (id_modulo, codigo_accion, descripcion, tipo_operacion, estado_registro)
      VALUES (v_id_modulo, p_codigo, p_descripcion, p_tipo, 'ACTIVO');
    END IF;
  END IF;
END//
DELIMITER ;

CALL cli_seed_accion('SEDES', 'ver_sede', 'Ver sedes', 'READ');
CALL cli_seed_accion('SEDES', 'crear_sede', 'Crear sedes', 'CREATE');
CALL cli_seed_accion('SEDES', 'actualizar_sede', 'Actualizar sedes', 'UPDATE');
CALL cli_seed_accion('SEDES', 'eliminar_sede', 'Eliminar sedes', 'DELETE');

CALL cli_seed_accion('PERSONAL', 'ver_personal', 'Ver personal', 'READ');
CALL cli_seed_accion('PERSONAL', 'crear_personal', 'Crear personal', 'CREATE');
CALL cli_seed_accion('PERSONAL', 'actualizar_personal', 'Actualizar personal', 'UPDATE');
CALL cli_seed_accion('PERSONAL', 'eliminar_personal', 'Eliminar personal', 'DELETE');

CALL cli_seed_accion('TRATAMIENTOS', 'ver_tratamiento', 'Ver tratamientos', 'READ');
CALL cli_seed_accion('TRATAMIENTOS', 'crear_tratamiento', 'Crear tratamientos', 'CREATE');
CALL cli_seed_accion('TRATAMIENTOS', 'actualizar_tratamiento', 'Actualizar tratamientos', 'UPDATE');
CALL cli_seed_accion('TRATAMIENTOS', 'eliminar_tratamiento', 'Eliminar tratamientos', 'DELETE');

CALL cli_seed_accion('INVENTARIO', 'ver_inventario', 'Ver inventario', 'READ');
CALL cli_seed_accion('INVENTARIO', 'crear_inventario', 'Crear inventario', 'CREATE');
CALL cli_seed_accion('INVENTARIO', 'actualizar_inventario', 'Actualizar inventario', 'UPDATE');
CALL cli_seed_accion('INVENTARIO', 'eliminar_inventario', 'Eliminar inventario', 'DELETE');

CALL cli_seed_accion('PACIENTES', 'ver_paciente', 'Ver pacientes', 'READ');
CALL cli_seed_accion('PACIENTES', 'crear_paciente', 'Crear pacientes', 'CREATE');
CALL cli_seed_accion('PACIENTES', 'actualizar_paciente', 'Actualizar pacientes', 'UPDATE');
CALL cli_seed_accion('PACIENTES', 'eliminar_paciente', 'Eliminar pacientes', 'DELETE');

CALL cli_seed_accion('HISTORIA_PACIENTE', 'ver_historia_paciente', 'Ver historia del paciente', 'READ');
CALL cli_seed_accion('HISTORIA_PACIENTE', 'crear_historia_paciente', 'Crear historia del paciente', 'CREATE');
CALL cli_seed_accion('HISTORIA_PACIENTE', 'actualizar_historia_paciente', 'Actualizar historia del paciente', 'UPDATE');
CALL cli_seed_accion('HISTORIA_PACIENTE', 'eliminar_historia_paciente', 'Eliminar historia del paciente', 'DELETE');

CALL cli_seed_accion('AGENDA', 'ver_cita', 'Ver agenda/citas', 'READ');
CALL cli_seed_accion('AGENDA', 'crear_cita', 'Crear citas', 'CREATE');
CALL cli_seed_accion('AGENDA', 'actualizar_cita', 'Actualizar citas', 'UPDATE');
CALL cli_seed_accion('AGENDA', 'eliminar_cita', 'Eliminar/cancelar citas', 'DELETE');

CALL cli_seed_accion('HISTORIA_CLINICA', 'ver_historia_clinica', 'Ver historia clínica', 'READ');
CALL cli_seed_accion('HISTORIA_CLINICA', 'crear_historia_clinica', 'Crear historia clínica', 'CREATE');
CALL cli_seed_accion('HISTORIA_CLINICA', 'actualizar_historia_clinica', 'Actualizar historia clínica', 'UPDATE');
CALL cli_seed_accion('HISTORIA_CLINICA', 'eliminar_historia_clinica', 'Eliminar historia clínica', 'DELETE');

CALL cli_seed_accion('CONSENTIMIENTOS', 'ver_consentimiento', 'Ver consentimientos', 'READ');
CALL cli_seed_accion('CONSENTIMIENTOS', 'crear_consentimiento', 'Crear consentimientos', 'CREATE');
CALL cli_seed_accion('CONSENTIMIENTOS', 'actualizar_consentimiento', 'Actualizar consentimientos', 'UPDATE');
CALL cli_seed_accion('CONSENTIMIENTOS', 'eliminar_consentimiento', 'Eliminar consentimientos', 'DELETE');

CALL cli_seed_accion('FOTOS_EVOLUCION', 'ver_foto_evolucion', 'Ver fotos de evolución', 'READ');
CALL cli_seed_accion('FOTOS_EVOLUCION', 'crear_foto_evolucion', 'Crear fotos de evolución', 'CREATE');
CALL cli_seed_accion('FOTOS_EVOLUCION', 'actualizar_foto_evolucion', 'Actualizar fotos de evolución', 'UPDATE');
CALL cli_seed_accion('FOTOS_EVOLUCION', 'eliminar_foto_evolucion', 'Eliminar fotos de evolución', 'DELETE');

CALL cli_seed_accion('FACTURACION', 'ver_facturacion', 'Ver cotizaciones y pagos', 'READ');
CALL cli_seed_accion('FACTURACION', 'crear_facturacion', 'Crear cotizaciones/pagos', 'CREATE');
CALL cli_seed_accion('FACTURACION', 'actualizar_facturacion', 'Actualizar facturación', 'UPDATE');
CALL cli_seed_accion('FACTURACION', 'eliminar_facturacion', 'Eliminar facturación', 'DELETE');

CALL cli_seed_accion('NOTIFICACIONES', 'ver_notificacion', 'Ver notificaciones', 'READ');
CALL cli_seed_accion('NOTIFICACIONES', 'crear_notificacion', 'Crear notificaciones', 'CREATE');
CALL cli_seed_accion('NOTIFICACIONES', 'actualizar_notificacion', 'Actualizar notificaciones', 'UPDATE');
CALL cli_seed_accion('NOTIFICACIONES', 'eliminar_notificacion', 'Eliminar notificaciones', 'DELETE');

CALL cli_seed_accion('REPORTES', 'ver_reporte', 'Ver reportes', 'READ');

-- SUPERADMIN + ADMIN_CLINICA: todos los permisos de módulos clínicos
INSERT IGNORE INTO sis_permiso (id_rol, id_accion, estado_registro)
SELECT 1, a.id_accion, 'ACTIVO'
FROM sis_accion a
INNER JOIN sis_modulo m ON m.id_modulo = a.id_modulo
WHERE m.nombre IN (
  'SEDES','PERSONAL','TRATAMIENTOS','INVENTARIO','PACIENTES','HISTORIA_PACIENTE',
  'AGENDA','HISTORIA_CLINICA','CONSENTIMIENTOS','FOTOS_EVOLUCION','FACTURACION',
  'NOTIFICACIONES','REPORTES'
) AND a.estado_registro = 'ACTIVO';

INSERT IGNORE INTO sis_permiso (id_rol, id_accion, estado_registro)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
CROSS JOIN sis_accion a
INNER JOIN sis_modulo m ON m.id_modulo = a.id_modulo
WHERE r.nombre = 'ADMIN_CLINICA'
  AND m.nombre IN (
    'SEDES','PERSONAL','TRATAMIENTOS','INVENTARIO','PACIENTES','HISTORIA_PACIENTE',
    'AGENDA','HISTORIA_CLINICA','CONSENTIMIENTOS','FOTOS_EVOLUCION','FACTURACION',
    'NOTIFICACIONES','REPORTES','DASHBOARD'
  ) AND a.estado_registro = 'ACTIVO';

DROP PROCEDURE IF EXISTS cli_seed_accion;
