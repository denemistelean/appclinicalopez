-- ==============================================================================
-- PATCH 041 — sis_auditoria.id_unidad (auditoría por empresa / OMNI)
-- Segundo despliegue: aplicar ANTES de uso intensivo de OMNI en producción.
-- Columna nullable + índice. NO rellena filas antiguas.
-- Idempotente. Emparejar con el backend que escribe id_unidad al registrar.
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

ALTER TABLE `sis_auditoria`
  ADD COLUMN IF NOT EXISTS `id_unidad` INT NULL
    COMMENT 'Empresa activa al auditar (OMNI / multi-unidad); NULL = legado o sin contexto'
    AFTER `id_usuario`;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sis_auditoria'
    AND INDEX_NAME = 'idx_sis_auditoria_unidad'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE `sis_auditoria` ADD KEY `idx_sis_auditoria_unidad` (`id_unidad`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Verificación:
-- SHOW COLUMNS FROM sis_auditoria LIKE 'id_unidad';
-- SELECT INDEX_NAME FROM information_schema.STATISTICS
--  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sis_auditoria'
--    AND INDEX_NAME = 'idx_sis_auditoria_unidad';
