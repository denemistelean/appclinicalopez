-- ==============================================================================
-- PATCH 014 — Especialidades clínicas (catálogo + N:M personal + FK tratamiento)
-- Agenda valida por especialidad (no por rol ESPECIALISTA / solo certificación)
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_especialidad` (
  `id_especialidad` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` VARCHAR(255) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_especialidad`),
  UNIQUE KEY `uk_cli_especialidad_nombre` (`nombre`),
  UNIQUE KEY `uk_cli_especialidad_codigo` (`codigo`)
) ENGINE=InnoDB COMMENT='Catálogo de especialidades / intervenciones que puede cubrir el personal';

CREATE TABLE IF NOT EXISTS `cli_personal_especialidad` (
  `id_personal_especialidad` INT NOT NULL AUTO_INCREMENT,
  `id_personal` INT NOT NULL,
  `id_especialidad` INT NOT NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_personal_especialidad`),
  UNIQUE KEY `uk_cli_pers_esp` (`id_personal`, `id_especialidad`),
  KEY `idx_cli_pers_esp_esp` (`id_especialidad`),
  CONSTRAINT `fk_cli_pers_esp_pers` FOREIGN KEY (`id_personal`) REFERENCES `cli_personal` (`id_personal`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_pers_esp_esp` FOREIGN KEY (`id_especialidad`) REFERENCES `cli_especialidad` (`id_especialidad`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Especialidades asignadas a un miembro del personal (1..N)';

-- FK especialidad en tratamiento
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_tratamiento' AND COLUMN_NAME = 'id_especialidad'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE `cli_tratamiento` ADD COLUMN `id_especialidad` INT NULL AFTER `categoria`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_tratamiento' AND CONSTRAINT_NAME = 'fk_cli_trat_especialidad'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE `cli_tratamiento` ADD CONSTRAINT `fk_cli_trat_especialidad` FOREIGN KEY (`id_especialidad`) REFERENCES `cli_especialidad` (`id_especialidad`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Seed desde tratamientos existentes
INSERT INTO `cli_especialidad` (`codigo`, `nombre`)
SELECT UPPER(REPLACE(LEFT(t.nombre, 40), ' ', '_')), UPPER(TRIM(t.nombre))
FROM cli_tratamiento t
WHERE t.estado_registro = 'ACTIVO'
  AND TRIM(IFNULL(t.nombre, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM cli_especialidad e
    WHERE UPPER(e.nombre) = UPPER(TRIM(t.nombre)) AND e.estado_registro = 'ACTIVO'
  );

-- Seed desde texto libre de personal (valor completo; si hay varios, se normalizan en la app)
INSERT INTO `cli_especialidad` (`nombre`)
SELECT DISTINCT UPPER(TRIM(p.especialidad))
FROM cli_personal p
WHERE p.estado_registro = 'ACTIVO'
  AND TRIM(IFNULL(p.especialidad, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM cli_especialidad e
    WHERE UPPER(e.nombre) = UPPER(TRIM(p.especialidad)) AND e.estado_registro = 'ACTIVO'
  );

-- Vincular tratamientos → especialidad homónima
UPDATE cli_tratamiento t
JOIN cli_especialidad e ON UPPER(e.nombre) = UPPER(TRIM(t.nombre)) AND e.estado_registro = 'ACTIVO'
SET t.id_especialidad = e.id_especialidad
WHERE t.estado_registro = 'ACTIVO' AND t.id_especialidad IS NULL;

-- Vincular personal → especialidades por coincidencia de nombre (texto libre)
INSERT IGNORE INTO `cli_personal_especialidad` (`id_personal`, `id_especialidad`)
SELECT p.id_personal, e.id_especialidad
FROM cli_personal p
JOIN cli_especialidad e ON e.estado_registro = 'ACTIVO'
  AND (
    UPPER(TRIM(IFNULL(p.especialidad, ''))) = UPPER(e.nombre)
    OR UPPER(IFNULL(p.especialidad, '')) LIKE CONCAT('%', UPPER(e.nombre), '%')
  )
WHERE p.estado_registro = 'ACTIVO'
  AND TRIM(IFNULL(p.especialidad, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM cli_personal_especialidad pe
    WHERE pe.id_personal = p.id_personal AND pe.id_especialidad = e.id_especialidad
      AND pe.estado_registro = 'ACTIVO'
  );

-- Tipos de cita: la afinidad se valida por especialidad (flag se reinterpreta en API)
-- No se exige rol MEDICO/PRINCIPAL; roles adicionales (p. ej. anestesista) siguen opcionales.
