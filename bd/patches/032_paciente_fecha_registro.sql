-- Fecha de alta del paciente (reportes)
USE app_clinica_lopez;

SET @c := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'cli_paciente'
    AND COLUMN_NAME = 'fecha_registro'
);
SET @sql := IF(
  @c = 0,
  'ALTER TABLE cli_paciente ADD COLUMN fecha_registro DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER estado_registro',
  'SELECT 1'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

UPDATE cli_paciente p
JOIN (
  SELECT id_registro, MIN(fecha) AS fecha
  FROM sis_auditoria
  WHERE nombre_tabla = 'cli_paciente' AND accion = 'CREAR'
  GROUP BY id_registro
) a ON a.id_registro = p.id_paciente
SET p.fecha_registro = a.fecha;
