-- ==============================================================================
-- PATCH 040 — Planes por sesiones y pagos (Sorela / unidades con finanzas)
-- Extiende cli_pago, cli_unidad, cli_catalogo_item; rol OMNI_ADMINISTRADOR;
-- acciones restituir_sesion, ajustar_pago, administrar_configuracion_finanzas.
-- Idempotente. NO migrar tipo_pago de filas existentes (quedan NULL).
-- NO ejecutar desde el agente: aplicar manualmente.
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- ---------- 1) cli_pago: tipo y comprobante ----------
ALTER TABLE `cli_pago`
  ADD COLUMN IF NOT EXISTS `tipo_pago` ENUM('ADELANTO','ABONO','CANCELACION') NULL
    COMMENT 'Clasificación del cobro al plan; NULL = legado sin tipificar'
    AFTER `metodo_pago`,
  ADD COLUMN IF NOT EXISTS `comprobante_tipo` VARCHAR(30) NULL
    COMMENT 'Tipo de comprobante interno (boleta, factura, recibo, etc.)'
    AFTER `tipo_pago`,
  ADD COLUMN IF NOT EXISTS `comprobante_numero` VARCHAR(40) NULL
    COMMENT 'Número de comprobante interno'
    AFTER `comprobante_tipo`;

-- ---------- 2) cli_unidad: exigir comprobante al cobrar ----------
ALTER TABLE `cli_unidad`
  ADD COLUMN IF NOT EXISTS `requiere_comprobante` TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = comprobante_tipo/numero obligatorios al registrar pago'
    AFTER `opera_finanzas`;

-- ---------- 3) cli_catalogo_item: intervalo sugerido (nunca regla dura) ----------
ALTER TABLE `cli_catalogo_item`
  ADD COLUMN IF NOT EXISTS `intervalo_dias_sugerido` INT NULL
    COMMENT 'Días sugeridos entre sesiones; informativo, no valida agenda'
    AFTER `sesiones`;

-- Valor inicial editable solo donde aún es NULL (no pisa cambios del admin)
UPDATE `cli_catalogo_item`
SET `intervalo_dias_sugerido` = 15
WHERE `tipo` = 'paquete'
  AND `sesiones` IS NOT NULL
  AND `sesiones` > 1
  AND `intervalo_dias_sugerido` IS NULL
  AND `estado_registro` = 'ACTIVO';

-- ---------- 4) Índice para sesiones ligadas a un plan ----------
-- Justificación: cli_hd_cita_sesion.id_hd_paquete no tiene KEY hoy; el endpoint de
-- sesiones pendientes filtra/une por id_hd_paquete + estado_registro.
-- cli_hd_paquete ya tiene idx_hd_paq_historia(id_historia_digital); no se duplica.
-- EXPLAIN no se ejecutó aquí (patch no aplicado por el agente).
SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_hd_cita_sesion'
    AND INDEX_NAME = 'idx_hd_cita_sesion_paquete'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE `cli_hd_cita_sesion` ADD KEY `idx_hd_cita_sesion_paquete` (`id_hd_paquete`, `estado_registro`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 5) Rol OMNI_ADMINISTRADOR ----------
-- Roles administrativos existentes en el esquema (inspección):
--   SUPERADMIN   — seed CORE (id_rol=1), todos los permisos del sistema
--   ADMIN_CLINICA — patch 000, administración clínica multi-sede
-- No existen roles administrativos distintos por unidad; la membresía
-- (cli_usuario_unidad) reutiliza estos nombres globales.
INSERT INTO `sis_rol` (`nombre`, `descripcion`, `estado_registro`)
SELECT 'OMNI_ADMINISTRADOR',
       'Administrador omni: opera cualquier unidad activa vía X-Unidad-Id',
       'ACTIVO'
WHERE NOT EXISTS (
  SELECT 1 FROM `sis_rol`
  WHERE `nombre` = 'OMNI_ADMINISTRADOR' AND `estado_registro` = 'ACTIVO'
);

-- Copia SOLO permisos activos de ADMIN_CLINICA (NO los de SUPERADMIN:
-- USUARIOS / SEGURIDAD / gestión de roles quedan fuera de OMNI).
INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT omni.id_rol, p.id_accion, 'ACTIVO'
FROM `sis_rol` omni
JOIN `sis_rol` admin ON admin.nombre = 'ADMIN_CLINICA' AND admin.estado_registro = 'ACTIVO'
JOIN `sis_permiso` p ON p.id_rol = admin.id_rol AND p.estado_registro = 'ACTIVO'
WHERE omni.nombre = 'OMNI_ADMINISTRADOR' AND omni.estado_registro = 'ACTIVO';

-- ---------- 6) Acciones nuevas ----------
-- No existe administrar_configuracion_finanzas ni equivalente; se crea.
-- restituir_sesion → PACIENTES (historia digital reutiliza permisos de paciente)
-- ajustar_pago / administrar_configuracion_finanzas → FACTURACION

SET @id_mod_pac := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'PACIENTES' AND estado_registro = 'ACTIVO' LIMIT 1);
SET @id_mod_fact := (SELECT id_modulo FROM sis_modulo WHERE nombre = 'FACTURACION' AND estado_registro = 'ACTIVO' LIMIT 1);

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_pac, 'restituir_sesion', 'Restituir sesión de un plan de tratamiento', 'SPECIAL', 'ACTIVO'
WHERE @id_mod_pac IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sis_accion
    WHERE id_modulo = @id_mod_pac AND codigo_accion = 'restituir_sesion' AND estado_registro = 'ACTIVO'
  );

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_fact, 'ajustar_pago', 'Ajustar o anular pagos de un plan', 'SPECIAL', 'ACTIVO'
WHERE @id_mod_fact IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sis_accion
    WHERE id_modulo = @id_mod_fact AND codigo_accion = 'ajustar_pago' AND estado_registro = 'ACTIVO'
  );

INSERT INTO `sis_accion` (`id_modulo`, `codigo_accion`, `descripcion`, `tipo_operacion`, `estado_registro`)
SELECT @id_mod_fact, 'administrar_configuracion_finanzas', 'Configurar exigencias de cobro de la unidad', 'UPDATE', 'ACTIVO'
WHERE @id_mod_fact IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM sis_accion
    WHERE id_modulo = @id_mod_fact
      AND codigo_accion = 'administrar_configuracion_finanzas'
      AND estado_registro = 'ACTIVO'
  );

-- Asignar SOLO a SUPERADMIN, ADMIN_CLINICA y OMNI_ADMINISTRADOR
INSERT IGNORE INTO `sis_permiso` (`id_rol`, `id_accion`, `estado_registro`)
SELECT r.id_rol, a.id_accion, 'ACTIVO'
FROM sis_rol r
CROSS JOIN sis_accion a
WHERE r.nombre IN ('SUPERADMIN', 'ADMIN_CLINICA', 'OMNI_ADMINISTRADOR')
  AND r.estado_registro = 'ACTIVO'
  AND a.estado_registro = 'ACTIVO'
  AND a.codigo_accion IN (
    'restituir_sesion',
    'ajustar_pago',
    'administrar_configuracion_finanzas'
  );

-- ==============================================================================
-- CONVENCIÓN (patches futuros):
-- Todo patch que asigne permisos a ADMIN_CLINICA debe asignarlos también a
-- OMNI_ADMINISTRADOR (mismo INSERT IGNORE / WHERE r.nombre IN (...)).
-- OMNI hereda el alcance clínico de ADMIN_CLINICA, no el de SUPERADMIN.
-- Ver también README.md.
-- ==============================================================================

-- ==============================================================================
-- ROLLBACK (manual, no ejecutar con este patch)
-- ALTER TABLE cli_pago DROP COLUMN tipo_pago, DROP COLUMN comprobante_tipo, DROP COLUMN comprobante_numero;
-- ALTER TABLE cli_unidad DROP COLUMN requiere_comprobante;
-- ALTER TABLE cli_catalogo_item DROP COLUMN intervalo_dias_sugerido;
-- ALTER TABLE cli_hd_cita_sesion DROP INDEX idx_hd_cita_sesion_paquete;
-- DELETE FROM sis_permiso WHERE id_accion IN (
--   SELECT id_accion FROM sis_accion WHERE codigo_accion IN
--     ('restituir_sesion','ajustar_pago','administrar_configuracion_finanzas'));
-- DELETE FROM sis_accion WHERE codigo_accion IN
--   ('restituir_sesion','ajustar_pago','administrar_configuracion_finanzas');
-- UPDATE sis_rol SET estado_registro='ELIMINADO' WHERE nombre='OMNI_ADMINISTRADOR';
-- ==============================================================================
