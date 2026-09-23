-- Patch 017: %grasa en medidas + gineco-obstétricos múltiples
-- Ejecutar en app_clinica_lopez

ALTER TABLE cli_paciente_medida
  ADD COLUMN IF NOT EXISTS porcentaje_grasa DECIMAL(5,2) NULL COMMENT '% grasa corporal' AFTER imc;

-- Gineco: permitir varios registros por paciente (quitar UNIQUE + FK)
-- MariaDB puede fallar si el UNIQUE está referenciado; secuencia segura:
SET @fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_paciente_gineco_obstetrico'
    AND REFERENCED_TABLE_NAME = 'cli_paciente'
    AND CONSTRAINT_NAME <> 'PRIMARY'
  LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL,
  CONCAT('ALTER TABLE cli_paciente_gineco_obstetrico DROP FOREIGN KEY `', @fk, '`'),
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE cli_paciente_gineco_obstetrico DROP INDEX IF EXISTS uk_cli_gineco_paciente;
ALTER TABLE cli_paciente_gineco_obstetrico ADD KEY IF NOT EXISTS idx_cli_gineco_paciente (id_paciente);

ALTER TABLE cli_paciente_gineco_obstetrico
  ADD COLUMN IF NOT EXISTS descripcion VARCHAR(500) NULL AFTER observaciones;

ALTER TABLE cli_paciente_gineco_obstetrico
  ADD CONSTRAINT fk_cli_gineco_paciente
  FOREIGN KEY (id_paciente) REFERENCES cli_paciente(id_paciente)
  ON UPDATE CASCADE ON DELETE RESTRICT;
