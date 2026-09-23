-- Fix patch 017 (ejecutar si uk_cli_gineco_paciente aún existe)
USE app_clinica_lopez;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_gineco_obstetrico'
    AND CONSTRAINT_NAME = 'fk_cli_gineco_paciente'
);
SET @sql := IF(@fk > 0,
  'ALTER TABLE `cli_paciente_gineco_obstetrico` DROP FOREIGN KEY `fk_cli_gineco_paciente`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @uk := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_gineco_obstetrico'
    AND INDEX_NAME = 'uk_cli_gineco_paciente'
);
SET @sql := IF(@uk > 0,
  'ALTER TABLE `cli_paciente_gineco_obstetrico` DROP INDEX `uk_cli_gineco_paciente`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_gineco_obstetrico'
    AND INDEX_NAME = 'idx_cli_gineco_paciente'
);
SET @sql := IF(@idx = 0,
  'ALTER TABLE `cli_paciente_gineco_obstetrico` ADD KEY `idx_cli_gineco_paciente` (`id_paciente`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk2 := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_paciente_gineco_obstetrico'
    AND CONSTRAINT_NAME = 'fk_cli_gineco_paciente'
);
SET @sql := IF(@fk2 = 0,
  'ALTER TABLE `cli_paciente_gineco_obstetrico` ADD CONSTRAINT `fk_cli_gineco_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `cli_paciente` (`id_paciente`) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
