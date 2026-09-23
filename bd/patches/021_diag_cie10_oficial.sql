-- ==============================================================================
-- PATCH 021 — Diagnósticos → CIE-10 oficial (subcategoría MINSA)
-- ==============================================================================
USE app_clinica_lopez;
SET NAMES utf8mb4 COLLATE utf8mb4_general_ci;

-- Ampliar descripción (nombres oficiales llegan a 500)
ALTER TABLE `cli_consulta_diagnostico`
  MODIFY COLUMN `descripcion` VARCHAR(500) NOT NULL;

ALTER TABLE `cli_consulta_diagnostico`
  MODIFY COLUMN `codigo_cie10` VARCHAR(20) NULL COMMENT 'Código MINSA (con o sin punto)';

-- Quitar FK a catálogo muestra cli_cie10
SET @fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_consulta_diagnostico'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
    AND CONSTRAINT_NAME = 'fk_cli_diag_cie10'
  LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL,
  'ALTER TABLE `cli_consulta_diagnostico` DROP FOREIGN KEY `fk_cli_diag_cie10`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Nueva columna hacia catálogo oficial
SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_consulta_diagnostico'
    AND COLUMN_NAME = 'id_cie10_subcategoria'
);
SET @sql := IF(@c = 0,
  'ALTER TABLE `cli_consulta_diagnostico`
     ADD COLUMN `id_cie10_subcategoria` INT NULL AFTER `id_cie10`,
     ADD KEY `idx_cli_diag_cie10_sub` (`id_cie10_subcategoria`),
     ADD CONSTRAINT `fk_cli_diag_cie10_sub`
       FOREIGN KEY (`id_cie10_subcategoria`) REFERENCES `cli_cie10_subcategoria` (`id_cie10_subcategoria`)
       ON DELETE SET NULL ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
