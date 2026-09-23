-- ==============================================================================
-- PATCH 012 — Tipos de cita (simple vs procedimiento/cirugía) + flags de recursos
-- ==============================================================================
USE app_clinica_lopez;

CREATE TABLE IF NOT EXISTS `cli_tipo_cita` (
  `id_tipo_cita` INT NOT NULL AUTO_INCREMENT,
  `codigo` VARCHAR(40) NOT NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `descripcion` VARCHAR(255) NULL,
  `duracion_default_minutos` INT NOT NULL DEFAULT 30,
  `requiere_tratamiento` TINYINT(1) NOT NULL DEFAULT 0,
  `requiere_sala` TINYINT(1) NOT NULL DEFAULT 0,
  `requiere_equipo` TINYINT(1) NOT NULL DEFAULT 0,
  `requiere_certificacion` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=profesional debe estar certificado en el tratamiento',
  `color_agenda` VARCHAR(20) NULL,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tipo_cita`),
  UNIQUE KEY `uk_cli_tipo_cita_codigo` (`codigo`)
) ENGINE=InnoDB COMMENT='Catálogo de tipos de cita; define qué recursos exige cada una';

CREATE TABLE IF NOT EXISTS `cli_tipo_cita_rol_requerido` (
  `id_tipo_cita_rol_requerido` INT NOT NULL AUTO_INCREMENT,
  `id_tipo_cita` INT NOT NULL,
  `id_rol_recurso` INT NOT NULL,
  `obligatorio` TINYINT(1) NOT NULL DEFAULT 1,
  `estado_registro` ENUM('ACTIVO','ELIMINADO') NOT NULL DEFAULT 'ACTIVO',
  `id_usuario_crea` INT NULL,
  `id_usuario_mod` INT NULL,
  PRIMARY KEY (`id_tipo_cita_rol_requerido`),
  UNIQUE KEY `uk_cli_tipo_cita_rol` (`id_tipo_cita`, `id_rol_recurso`),
  CONSTRAINT `fk_cli_tipo_cita_rol_tipo` FOREIGN KEY (`id_tipo_cita`) REFERENCES `cli_tipo_cita` (`id_tipo_cita`) ON DELETE RESTRICT,
  CONSTRAINT `fk_cli_tipo_cita_rol_rol` FOREIGN KEY (`id_rol_recurso`) REFERENCES `cli_rol_recurso` (`id_rol_recurso`) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='Roles humanos exigidos por tipo de cita (independiente del tratamiento)';

INSERT INTO `cli_tipo_cita`
  (`codigo`, `nombre`, `descripcion`, `duracion_default_minutos`, `requiere_tratamiento`, `requiere_sala`, `requiere_equipo`, `requiere_certificacion`, `color_agenda`)
SELECT v.* FROM (
  SELECT 'CITA_SIMPLE' AS codigo, 'Cita simple / evaluación' AS nombre,
         'Toma de datos y orientación. Solo personal, sede, fecha y hora.' AS descripcion,
         30 AS duracion_default_minutos, 0 AS requiere_tratamiento, 0 AS requiere_sala, 0 AS requiere_equipo,
         0 AS requiere_certificacion, '#5B6960' AS color_agenda
  UNION ALL
  SELECT 'PROCEDIMIENTO', 'Procedimiento / tratamiento',
         'Requiere tratamiento; sala/equipo según catálogo del tratamiento.',
         45, 1, 0, 0, 1, '#1F4E4A'
  UNION ALL
  SELECT 'CIRUGIA_FACIAL', 'Cirugía facial',
         'Intervención facial: tratamiento, sala y roles clínicos.',
         90, 1, 1, 0, 1, '#C97F86'
  UNION ALL
  SELECT 'CIRUGIA_CORPORAL', 'Cirugía corporal',
         'Intervención corporal: tratamiento, sala y roles clínicos.',
         120, 1, 1, 0, 1, '#4C6B8A'
  UNION ALL
  SELECT 'SESION_EQUIPO', 'Sesión con equipo',
         'Procedimiento que exige equipo (láser, RF, etc.).',
         45, 1, 1, 1, 1, '#7A6C9E'
) v
WHERE NOT EXISTS (SELECT 1 FROM cli_tipo_cita t WHERE t.codigo = v.codigo AND t.estado_registro = 'ACTIVO');

-- Roles típicos para cirugías (anestesista opcional/obligatorio según clínica)
INSERT IGNORE INTO `cli_tipo_cita_rol_requerido` (`id_tipo_cita`, `id_rol_recurso`, `obligatorio`)
SELECT tc.id_tipo_cita, rr.id_rol_recurso, 0
FROM cli_tipo_cita tc
CROSS JOIN cli_rol_recurso rr
WHERE tc.codigo IN ('CIRUGIA_FACIAL', 'CIRUGIA_CORPORAL')
  AND rr.codigo = 'ANESTESISTA'
  AND tc.estado_registro = 'ACTIVO'
  AND rr.estado_registro = 'ACTIVO';

-- id_tipo_cita en cli_cita
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND COLUMN_NAME = 'id_tipo_cita');
SET @sql := IF(@col = 0,
  'ALTER TABLE cli_cita ADD COLUMN id_tipo_cita INT NULL AFTER id_sede',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Hacer tratamiento nullable (cita simple)
SET @nullok := (
  SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND COLUMN_NAME = 'id_tratamiento'
);
SET @sql := IF(@nullok = 'NO',
  'ALTER TABLE cli_cita MODIFY COLUMN id_tratamiento INT NULL',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill tipo en citas existentes
UPDATE cli_cita c
SET c.id_tipo_cita = (
  SELECT id_tipo_cita FROM cli_tipo_cita WHERE codigo = 'PROCEDIMIENTO' AND estado_registro = 'ACTIVO' LIMIT 1
)
WHERE c.id_tipo_cita IS NULL AND c.id_tratamiento IS NOT NULL;

UPDATE cli_cita c
SET c.id_tipo_cita = (
  SELECT id_tipo_cita FROM cli_tipo_cita WHERE codigo = 'CITA_SIMPLE' AND estado_registro = 'ACTIVO' LIMIT 1
)
WHERE c.id_tipo_cita IS NULL;

-- FK tipo cita
SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cli_cita' AND CONSTRAINT_NAME = 'fk_cli_cita_tipo'
);
SET @sql := IF(@fk = 0,
  'ALTER TABLE cli_cita ADD CONSTRAINT fk_cli_cita_tipo FOREIGN KEY (id_tipo_cita) REFERENCES cli_tipo_cita (id_tipo_cita) ON DELETE RESTRICT',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
